/**
 * @proofmark/gate — Quality-gated model router with prompt A/B testing.
 *
 * Open-core SDK. MIT licensed.
 */

// Quality Gate
export { qualityGate, parseResponses, QUALITY_THRESHOLD } from "./quality-gate.mjs";

// Model Router
export { createRouter } from "./router.mjs";

// Prompt A/B Testing
export {
  defineExperiment,
  selectVariant,
  validateOutput,
  recordMetric,
  getExperimentStats,
  pickWinner,
} from "./prompt-schema.mjs";
