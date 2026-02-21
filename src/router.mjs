/**
 * Model Router — transparent multi-model orchestration with quality gate.
 *
 * Escalation chain (cheapest first):
 *   MiniMax ($0.001/1K) → OpenAI ($0.01/1K) → Anthropic Opus ($0.06/1K)
 *
 * Flow:
 *   1. If minimaxKey configured → try MiniMax first (cheapest)
 *   2. Run quality gate on response
 *   3. If quality < threshold → escalate to OpenAI (mid-tier)
 *   4. If still below threshold → escalate to Anthropic Opus (strongest)
 *   5. Return the best response — caller never sees the bad one
 *
 * Without minimaxKey: OpenAI → Anthropic Opus (original 2-tier chain)
 *
 * Usage:
 *   const router = createRouter({ openaiKey, anthropicKey, minimaxKey, promptId });
 *   const result = await router.evaluate("My SaaS idea here");
 *   // result.provider — "minimax" | "openai" | "anthropic"
 *   // result.quality — the gate score
 *   // result.escalated — whether fallback was used
 */

import OpenAI from "openai";
import { qualityGate } from "./quality-gate.mjs";
import { selectVariant, validateOutput, recordMetric } from "./prompt-schema.mjs";
import { callMiniMax } from "./providers/minimax.mjs";

/**
 * @typedef {Object} RouterConfig
 * @property {string} openaiKey
 * @property {string} [anthropicKey]
 * @property {string} [minimaxKey]
 * @property {string} promptId - OpenAI stored prompt ID
 * @property {string} [promptVersion] - defaults to "3"
 * @property {number} [qualityThreshold] - override the default 0.70
 * @property {boolean} [allowEscalation] - default true
 */

/**
 * @typedef {Object} EvaluationResult
 * @property {string} provider - "openai" | "anthropic"
 * @property {string} model - specific model ID
 * @property {number} quality - gate score 0.0-1.0
 * @property {boolean} escalated - whether fallback was used
 * @property {Array} responses - parsed response variants
 * @property {Array} issues - quality issues found (empty if clean)
 * @property {Object} usage - token counts
 * @property {Object} timing - latency breakdown in ms
 */

export function createRouter(config) {
  const {
    openaiKey,
    anthropicKey,
    minimaxKey,
    promptId,
    promptVersion = "3",
    qualityThreshold = 0.70,
    allowEscalation = true,
  } = config;

  const openai = new OpenAI({ apiKey: openaiKey });

  async function callOpenAI(idea) {
    const start = Date.now();

    const response = await openai.responses.create({
      prompt: { id: promptId, version: promptVersion },
      input: idea,
      reasoning: { summary: "auto" },
      store: true,
      include: [
        "reasoning.encrypted_content",
        "web_search_call.action.sources",
      ],
    });

    const latency = Date.now() - start;

    return {
      outputText: response.output_text,
      model: response.model,
      usage: response.usage,
      reasoning: response.reasoning,
      latency,
      raw: response,
    };
  }

  async function callAnthropic(idea) {
    if (!anthropicKey) {
      throw new Error("Anthropic API key required for escalation but not configured");
    }

    // Dynamic import — only loaded when escalation triggers
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicKey });
    const start = Date.now();

    // Reconstruct the prompt intent for Opus since we can't use OpenAI's stored prompt
    const systemPrompt = `You are a SaaS idea evaluator. Given a business idea, produce exactly 5 evaluation variants.

Each variant must:
1. Score the original idea on 10 dimensions (1-10 each): Self-Serve Fulfillment, Zero Human Labor, 100% Digital Delivery, No Expert Judgment Required, Polar Compliance, Low Dispute Risk, Autonomous Feature Delivery, Narrow Scope Strong Utility, Subscription-Friendly, Sells Itself
2. Calculate Total: X/100
3. If Total < 60, suggest a Polar-safe digital pivot with its own 10-dimension scoring
4. Include a Polar integration sketch for the pivot

Hard Filters (auto-fail if any score 0):
- HF1: Zero Human Labor
- HF2: 100% Digital Delivery
- HF3: No Expert Judgment Required (threshold: 3+)

Output format (XML, exactly 5 response blocks):
<response>
  <text>[evaluation text]</text>
  <probability>[0.01-0.10]</probability>
</response>

Probabilities across all 5 responses must sum to < 1.0.`;

    const message = await client.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: `Evaluate this SaaS idea:\n\n${idea}` }],
      system: systemPrompt,
    });

    const latency = Date.now() - start;
    const outputText = message.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    return {
      outputText,
      model: message.model,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        total_tokens: message.usage.input_tokens + message.usage.output_tokens,
      },
      reasoning: null,
      latency,
      raw: message,
    };
  }

  /**
   * Evaluate a SaaS idea through the quality-gated pipeline.
   *
   * Escalation chain: MiniMax → OpenAI → Anthropic Opus
   * Each tier is tried in order. The first response that passes the quality
   * gate is returned. If no tier passes, the strongest model's response wins.
   *
   * @param {string} idea - The business idea to evaluate
   * @returns {Promise<EvaluationResult>}
   */
  async function evaluate(idea) {
    const timing = { primary: 0, gate: 0, escalation: 0, total: 0 };
    const totalStart = Date.now();
    const usageLog = {};

    // ── Tier 1: MiniMax (cheapest) ──────────────────────────
    if (minimaxKey) {
      try {
        const mm = await callMiniMax(idea, { apiKey: minimaxKey });
        timing.primary = mm.latency;
        usageLog.minimax = mm.usage;

        const gateStart = Date.now();
        const gate = qualityGate(mm.outputText);
        timing.gate = Date.now() - gateStart;

        if (gate.passesGate || !allowEscalation) {
          timing.total = Date.now() - totalStart;
          return {
            provider: "minimax",
            model: mm.model,
            quality: gate.score,
            escalated: false,
            responses: gate.responses,
            issues: gate.issues,
            usage: mm.usage,
            timing,
            reasoning: null,
          };
        }

        console.warn(
          `[quality-gate] MiniMax scored ${gate.score} < ${qualityThreshold} — escalating to OpenAI`
        );
      } catch (err) {
        console.warn(`[quality-gate] MiniMax error: ${err.message} — escalating to OpenAI`);
      }
    }

    // ── Tier 2: OpenAI (mid-tier) ───────────────────────────
    const primary = await callOpenAI(idea);
    timing.primary = timing.primary || primary.latency; // keep MiniMax timing if it ran
    timing.escalation = primary.latency;
    usageLog.openai = primary.usage;

    const gateStart = Date.now();
    const gate = qualityGate(primary.outputText);
    timing.gate = Date.now() - gateStart;

    if (gate.passesGate || !allowEscalation) {
      timing.total = Date.now() - totalStart;
      return {
        provider: "openai",
        model: primary.model,
        quality: gate.score,
        escalated: !!minimaxKey, // escalated if MiniMax was tried first
        escalationReason: minimaxKey ? ["MiniMax failed quality gate"] : undefined,
        responses: gate.responses,
        issues: gate.issues,
        usage: Object.keys(usageLog).length > 1 ? usageLog : primary.usage,
        timing,
        reasoning: primary.reasoning,
      };
    }

    // ── Tier 3: Anthropic Opus (strongest) ──────────────────
    console.warn(
      `[quality-gate] OpenAI scored ${gate.score} < ${qualityThreshold} — escalating to Opus`
    );

    const fallback = await callAnthropic(idea);
    timing.escalation += fallback.latency;
    usageLog.anthropic = fallback.usage;

    const fallbackGate = qualityGate(fallback.outputText);
    timing.total = Date.now() - totalStart;

    return {
      provider: "anthropic",
      model: fallback.model,
      quality: fallbackGate.score,
      escalated: true,
      escalationReason: gate.issues,
      responses: fallbackGate.responses,
      issues: fallbackGate.issues,
      usage: usageLog,
      timing,
      reasoning: null,
    };
  }

  /**
   * Evaluate using an A/B experiment — selects a variant, runs through the gate,
   * records metrics, and returns the result with variant attribution.
   *
   * @param {string} idea - The business idea to evaluate
   * @param {import("./prompt-schema.mjs").Experiment} experiment - The experiment to use
   * @returns {Promise<EvaluationResult & {variantId: string, schemaValid: boolean}>}
   */
  async function evaluateWithExperiment(idea, experiment) {
    const variant = selectVariant(experiment);
    const timing = { primary: 0, gate: 0, escalation: 0, total: 0 };
    const totalStart = Date.now();

    // Step 1: Call the variant's provider
    let primary;
    if (variant.provider === "openai") {
      const pid = variant.promptConfig?.promptId || promptId;
      const pver = variant.promptConfig?.promptVersion || promptVersion;

      // Temporarily override for this call
      const origPromptId = promptId;
      const start = Date.now();
      const response = await openai.responses.create({
        prompt: { id: pid, version: pver },
        input: idea,
        reasoning: { summary: "auto" },
        store: true,
        include: ["reasoning.encrypted_content", "web_search_call.action.sources"],
      });
      primary = {
        outputText: response.output_text,
        model: response.model,
        usage: response.usage,
        reasoning: response.reasoning,
        latency: Date.now() - start,
        raw: response,
      };
    } else if (variant.provider === "anthropic") {
      primary = await callAnthropic(idea);
      if (variant.promptConfig?.systemPrompt) {
        // Re-call with custom system prompt
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: anthropicKey });
        const start = Date.now();
        const message = await client.messages.create({
          model: variant.promptConfig?.model || "claude-opus-4-20250514",
          max_tokens: 8192,
          messages: [{ role: "user", content: `Evaluate this SaaS idea:\n\n${idea}` }],
          system: variant.promptConfig.systemPrompt,
        });
        const latency = Date.now() - start;
        primary = {
          outputText: message.content.filter(b => b.type === "text").map(b => b.text).join("\n"),
          model: message.model,
          usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, total_tokens: message.usage.input_tokens + message.usage.output_tokens },
          reasoning: null,
          latency,
          raw: message,
        };
      }
    } else if (variant.provider === "minimax") {
      primary = await callMiniMax(idea, {
        apiKey: minimaxKey,
        model: variant.promptConfig?.model,
        systemPrompt: variant.promptConfig?.systemPrompt,
      });
    } else {
      throw new Error(`Unknown provider: ${variant.provider}`);
    }

    timing.primary = primary.latency;

    // Step 2: Quality gate
    const gateStart = Date.now();
    const threshold = variant.qualityThreshold || qualityThreshold;
    const gate = qualityGate(primary.outputText);
    timing.gate = Date.now() - gateStart;

    // Step 3: Standard Schema validation (if defined)
    let schemaValid = true;
    if (variant.outputSchema && gate.responses.length > 0) {
      const validation = await validateOutput(variant, gate.responses);
      schemaValid = validation.valid;
      if (!schemaValid) {
        gate.issues.push(...validation.issues.map(i => ({
          category: "schema",
          severity: "warning",
          message: i.message,
        })));
      }
    }

    // Step 4: Decide — escalate or return
    let result;
    if (gate.score >= threshold || !allowEscalation) {
      timing.total = Date.now() - totalStart;
      result = {
        provider: variant.provider,
        model: primary.model,
        quality: gate.score,
        escalated: false,
        responses: gate.responses,
        issues: gate.issues,
        usage: primary.usage,
        timing,
        reasoning: primary.reasoning,
        variantId: variant.id,
        schemaValid,
      };
    } else {
      console.warn(`[experiment:${experiment.name}] Variant ${variant.id} scored ${gate.score} < ${threshold} — escalating`);
      const fallback = await callAnthropic(idea);
      timing.escalation = fallback.latency;
      const fallbackGate = qualityGate(fallback.outputText);
      timing.total = Date.now() - totalStart;
      result = {
        provider: "anthropic",
        model: fallback.model,
        quality: fallbackGate.score,
        escalated: true,
        escalationReason: gate.issues,
        responses: fallbackGate.responses,
        issues: fallbackGate.issues,
        usage: { primary: primary.usage, fallback: fallback.usage },
        timing,
        reasoning: null,
        variantId: variant.id,
        schemaValid,
      };
    }

    // Step 5: Record metrics for the experiment
    recordMetric(experiment, variant.id, {
      qualityScore: result.quality,
      escalated: result.escalated,
      schemaValid,
      latencyMs: timing.total,
      tokenCount: result.usage?.total_tokens || (result.usage?.primary?.total_tokens || 0) + (result.usage?.fallback?.total_tokens || 0),
    });

    return result;
  }

  return { evaluate, evaluateWithExperiment };
}
