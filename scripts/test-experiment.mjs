/**
 * A/B experiment demo — runs multiple prompt variants through the quality gate.
 * Usage: node --env-file=.env.local scripts/test-experiment.mjs [idea]
 */
import { createRouter } from "../src/router.mjs";
import { defineExperiment, getExperimentStats, pickWinner } from "../src/prompt-schema.mjs";
import { z } from "zod";

// Define a Standard Schema for validating parsed responses
const responseSchema = z.array(z.object({
  text: z.string().min(50),
  probability: z.number().min(0).max(1),
}));

// Define the A/B experiment with two prompt variants
const experiment = defineExperiment("saas-eval-v2", [
  {
    id: "openai-stored-v3",
    provider: "openai",
    weight: 0.7,
    promptConfig: {
      promptId: process.env.SAAS_IDEAS,
      promptVersion: "3",
    },
    outputSchema: responseSchema,
    qualityThreshold: 0.70,
  },
  {
    id: "openai-stored-v3-strict",
    provider: "openai",
    weight: 0.3,
    promptConfig: {
      promptId: process.env.SAAS_IDEAS,
      promptVersion: "3",
    },
    outputSchema: responseSchema,
    qualityThreshold: 0.85,  // Higher threshold — escalates more aggressively
  },
]);

const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  promptId: process.env.SAAS_IDEAS,
});

const idea = process.argv[2] || "A CLI tool that generates privacy policies from your codebase's data handling patterns";

console.log(`\n=== A/B Experiment: ${experiment.name} ===`);
console.log(`Idea: "${idea}"`);
console.log(`Variants: ${experiment.variants.map(v => `${v.id} (weight: ${v.weight})`).join(", ")}\n`);

// Run the experiment
const result = await router.evaluateWithExperiment(idea, experiment);

console.log(`Selected variant: ${result.variantId}`);
console.log(`Provider: ${result.provider} (${result.model})`);
console.log(`Quality:  ${result.quality}`);
console.log(`Schema valid: ${result.schemaValid}`);
console.log(`Escalated: ${result.escalated}`);
console.log(`Responses: ${result.responses.length}`);
console.log(`Timing:   total=${result.timing.total}ms`);

// Show experiment stats (will only have 1 sample since we ran once)
const stats = getExperimentStats(experiment);
console.log(`\n--- Experiment Stats ---`);
console.log(JSON.stringify(stats, null, 2));

// Show winner status
const winner = pickWinner(experiment);
console.log(`\nWinner: ${winner.winner?.id || "insufficient data"} (confidence: ${winner.confidence})`);

console.log(`\n--- Top Response Preview ---`);
console.log(result.responses[0]?.text?.substring(0, 400) + "...");
