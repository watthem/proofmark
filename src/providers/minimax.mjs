/**
 * MiniMax provider — cheapest tier in the escalation chain.
 *
 * MiniMax → OpenAI → Opus
 *
 * Uses MiniMax's chat completion API.
 * Docs: https://www.minimax.io/
 *
 * This provider is the reason the quality gate exists:
 * MiniMax is cheap but inconsistent. The gate catches bad responses
 * and escalates transparently. Users save 80%+ on tokens when MiniMax
 * produces good output.
 */

const MINIMAX_API_URL = "https://api.minimax.io/v1/text/chatcompletion_v2";

/**
 * Call MiniMax with a SaaS idea evaluation prompt.
 *
 * @param {string} idea - The business idea to evaluate
 * @param {Object} config
 * @param {string} config.apiKey - MiniMax API key
 * @param {string} [config.model] - Model ID (default: "MiniMax-Text-01")
 * @param {string} [config.systemPrompt] - System prompt for evaluation
 * @returns {Promise<{outputText: string, model: string, usage: Object, latency: number}>}
 */
export async function callMiniMax(idea, config) {
  const {
    apiKey,
    model = "MiniMax-Text-01",
    systemPrompt,
  } = config;

  if (!apiKey) {
    throw new Error("MiniMax API key required but not configured");
  }

  const defaultSystemPrompt = `You are a SaaS idea evaluator. Given a business idea, produce exactly 5 evaluation variants.

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

  const start = Date.now();

  const response = await fetch(MINIMAX_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt || defaultSystemPrompt },
        { role: "user", content: `Evaluate this SaaS idea:\n\n${idea}` },
      ],
      temperature: 0.7,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`MiniMax API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const latency = Date.now() - start;

  const outputText = data.choices?.[0]?.message?.content || "";
  const usage = {
    input_tokens: data.usage?.prompt_tokens || 0,
    output_tokens: data.usage?.completion_tokens || 0,
    total_tokens: data.usage?.total_tokens || 0,
  };

  return {
    outputText,
    model: data.model || model,
    usage,
    reasoning: null,
    latency,
    raw: data,
  };
}
