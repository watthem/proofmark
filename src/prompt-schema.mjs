/**
 * Prompt Schema — Define prompt variants with Standard Schema validation.
 *
 * Each prompt config defines:
 *   - id: unique identifier for A/B tracking
 *   - provider: "openai" | "anthropic"
 *   - weight: traffic allocation (0.0–1.0, weights across variants are normalized)
 *   - promptConfig: provider-specific config (stored prompt ID, system prompt, etc.)
 *   - outputSchema: a Standard Schema that validates the response output
 *   - qualityThreshold: override the default quality gate threshold for this variant
 *
 * Usage:
 *   const experiment = defineExperiment("saas-eval-v2", [
 *     { id: "openai-v3", provider: "openai", weight: 0.7, ... },
 *     { id: "opus-direct", provider: "anthropic", weight: 0.3, ... },
 *   ]);
 */

/**
 * @typedef {Object} PromptVariant
 * @property {string} id - Unique variant identifier for tracking
 * @property {"openai"|"anthropic"} provider
 * @property {number} weight - Traffic weight (normalized across variants)
 * @property {Object} promptConfig - Provider-specific prompt configuration
 * @property {string} [promptConfig.promptId] - OpenAI stored prompt ID
 * @property {string} [promptConfig.promptVersion] - OpenAI stored prompt version
 * @property {string} [promptConfig.systemPrompt] - Direct system prompt (Anthropic)
 * @property {string} [promptConfig.model] - Model override
 * @property {Object} [outputSchema] - Standard Schema for output validation
 * @property {number} [qualityThreshold] - Override default quality threshold
 */

/**
 * @typedef {Object} Experiment
 * @property {string} name
 * @property {PromptVariant[]} variants
 * @property {Map} metrics - Collected quality metrics per variant
 */

/**
 * Define an A/B testing experiment with multiple prompt variants.
 *
 * @param {string} name - Experiment name
 * @param {PromptVariant[]} variants - Array of prompt variants
 * @returns {Experiment}
 */
export function defineExperiment(name, variants) {
  if (!variants.length) throw new Error("Experiment must have at least one variant");

  // Normalize weights
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
  const normalized = variants.map(v => ({
    ...v,
    weight: (v.weight || 1) / totalWeight,
  }));

  return {
    name,
    variants: normalized,
    metrics: new Map(),
    _startedAt: Date.now(),
  };
}

/**
 * Select a variant based on weighted random selection.
 *
 * @param {Experiment} experiment
 * @returns {PromptVariant}
 */
export function selectVariant(experiment) {
  const rand = Math.random();
  let cumulative = 0;

  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (rand <= cumulative) return variant;
  }

  // Fallback to last variant (floating point edge case)
  return experiment.variants[experiment.variants.length - 1];
}

/**
 * Validate a response against a variant's Standard Schema output schema.
 *
 * @param {PromptVariant} variant
 * @param {*} output - The parsed response to validate
 * @returns {Promise<{valid: boolean, issues: Array}>}
 */
export async function validateOutput(variant, output) {
  if (!variant.outputSchema) {
    return { valid: true, issues: [] };
  }

  const schema = variant.outputSchema;

  // Standard Schema v1 interface
  const result = await schema["~standard"].validate(output);

  if (result.issues) {
    return {
      valid: false,
      issues: result.issues.map(i => ({
        message: i.message,
        path: i.path?.map(p => (typeof p === "object" ? p.key : p)).join("."),
      })),
    };
  }

  return { valid: true, issues: [] };
}

/**
 * Record a quality metric for a variant.
 *
 * @param {Experiment} experiment
 * @param {string} variantId
 * @param {Object} metric
 * @param {number} metric.qualityScore - Quality gate score 0.0-1.0
 * @param {boolean} metric.escalated - Whether fallback was triggered
 * @param {boolean} metric.schemaValid - Whether output passed Standard Schema validation
 * @param {number} metric.latencyMs - Response latency
 * @param {number} metric.tokenCount - Total tokens used
 */
export function recordMetric(experiment, variantId, metric) {
  if (!experiment.metrics.has(variantId)) {
    experiment.metrics.set(variantId, []);
  }
  experiment.metrics.get(variantId).push({
    ...metric,
    timestamp: Date.now(),
  });
}

/**
 * Get aggregated stats for an experiment.
 *
 * @param {Experiment} experiment
 * @returns {Object} Per-variant stats
 */
export function getExperimentStats(experiment) {
  const stats = {};

  for (const variant of experiment.variants) {
    const metrics = experiment.metrics.get(variant.id) || [];
    if (metrics.length === 0) {
      stats[variant.id] = { samples: 0, weight: variant.weight };
      continue;
    }

    const qualityScores = metrics.map(m => m.qualityScore);
    const latencies = metrics.map(m => m.latencyMs);
    const tokens = metrics.map(m => m.tokenCount);

    stats[variant.id] = {
      samples: metrics.length,
      weight: variant.weight,
      quality: {
        mean: avg(qualityScores),
        min: Math.min(...qualityScores),
        max: Math.max(...qualityScores),
        p50: percentile(qualityScores, 0.5),
        p95: percentile(qualityScores, 0.95),
      },
      escalationRate: metrics.filter(m => m.escalated).length / metrics.length,
      schemaPassRate: metrics.filter(m => m.schemaValid).length / metrics.length,
      latency: {
        mean: avg(latencies),
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      },
      tokens: {
        mean: avg(tokens),
        total: tokens.reduce((a, b) => a + b, 0),
      },
    };
  }

  return {
    experiment: experiment.name,
    totalSamples: [...experiment.metrics.values()].reduce((sum, m) => sum + m.length, 0),
    startedAt: new Date(experiment._startedAt).toISOString(),
    variants: stats,
  };
}

/**
 * Determine the winning variant based on quality-weighted scoring.
 * Returns null if not enough samples (minimum 5 per variant).
 *
 * @param {Experiment} experiment
 * @param {Object} [options]
 * @param {number} [options.minSamples=5] - Minimum samples per variant to declare a winner
 * @param {string} [options.optimizeFor="quality"] - "quality" | "cost" | "latency"
 * @returns {{winner: PromptVariant|null, confidence: string, stats: Object}}
 */
export function pickWinner(experiment, options = {}) {
  const { minSamples = 5, optimizeFor = "quality" } = options;
  const stats = getExperimentStats(experiment);

  const eligible = Object.entries(stats.variants).filter(([_, s]) => s.samples >= minSamples);

  if (eligible.length < 2) {
    return { winner: null, confidence: "insufficient_data", stats };
  }

  let bestId = null;
  let bestScore = -Infinity;

  for (const [id, s] of eligible) {
    let score;
    switch (optimizeFor) {
      case "quality":
        // Higher quality mean is better, penalize escalation rate
        score = s.quality.mean * (1 - s.escalationRate * 0.5);
        break;
      case "cost":
        // Lower tokens is better, weighted by quality
        score = s.quality.mean / (s.tokens.mean || 1);
        break;
      case "latency":
        // Lower latency is better, weighted by quality
        score = s.quality.mean / (s.latency.mean || 1) * 1000;
        break;
      default:
        score = s.quality.mean;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  const winner = experiment.variants.find(v => v.id === bestId);
  const winnerStats = stats.variants[bestId];
  const runnerUp = eligible.filter(([id]) => id !== bestId).sort((a, b) => b[1].quality.mean - a[1].quality.mean)[0];

  // Simple confidence based on sample size and score gap
  const gap = runnerUp ? winnerStats.quality.mean - runnerUp[1].quality.mean : 0;
  const confidence = winnerStats.samples >= 30 && gap > 0.1 ? "high"
    : winnerStats.samples >= 10 && gap > 0.05 ? "medium"
    : "low";

  return { winner, confidence, stats };
}

// --- Helpers ---

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}
