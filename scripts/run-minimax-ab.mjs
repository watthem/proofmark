/**
 * A/B test: MiniMax vs OpenAI on all 10 PRFAQ verticals.
 *
 * This is the money experiment — proves the quality gate's value by showing:
 * 1. How often MiniMax produces good-enough output (cost savings)
 * 2. How often it fails and escalates (gate catches it)
 * 3. Quality difference between providers
 *
 * Usage: node --env-file=.env.local scripts/run-minimax-ab.mjs
 */
import { createRouter } from "../src/router.mjs";
import { defineExperiment, getExperimentStats, pickWinner } from "../src/prompt-schema.mjs";
import { z } from "zod";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const responseSchema = z.array(z.object({
  text: z.string().min(50),
  probability: z.number().min(0).max(1),
}));

const experiment = defineExperiment("minimax-vs-openai-v1", [
  {
    id: "minimax-text-01",
    provider: "minimax",
    weight: 0.5,
    promptConfig: { model: "MiniMax-Text-01" },
    outputSchema: responseSchema,
    qualityThreshold: 0.70,
  },
  {
    id: "openai-stored-v3",
    provider: "openai",
    weight: 0.5,
    promptConfig: {
      promptId: process.env.SAAS_IDEAS,
      promptVersion: "3",
    },
    outputSchema: responseSchema,
    qualityThreshold: 0.70,
  },
]);

const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  minimaxKey: process.env.MINIMAX_API_KEY,
  promptId: process.env.SAAS_IDEAS,
});

const VERTICALS = [
  { name: "Validate", idea: "A SaaS API that evaluates business ideas using AI with a 10-dimension scoring rubric, hard filters for passivity and digital delivery, and suggests Polar-compatible pivot ideas with integration sketches." },
  { name: "Gate", idea: "A managed API proxy that sits between your app and LLM providers. Scores every AI response 0.0-1.0 for quality before returning it. Auto-escalates to a stronger model when quality drops below threshold." },
  { name: "Bench", idea: "A prompt benchmarking SaaS where you upload prompt variants, define test cases and expected output schemas, and get quality-scored leaderboards showing which prompt performs best across models." },
  { name: "Comply", idea: "An API that checks AI-generated text for compliance issues: PII leakage, GDPR violations, HIPAA-sensitive content, biased language, and regulatory red flags." },
  { name: "Docs", idea: "A documentation quality scoring API. Submit a URL or markdown content, get a structured quality report: completeness, accuracy, readability grade level, Diataxis category detection." },
  { name: "Review", idea: "An AI code review quality gate API. Submit a pull request diff, get a structured review with severity-scored issues, security vulnerability detection, and a quality score." },
  { name: "Support", idea: "A quality gate for AI-generated customer support responses. Scores each draft response for accuracy, tone, helpfulness, and brand voice compliance. Blocks low-scoring responses." },
  { name: "Copy", idea: "A marketing copy quality gate API. Scores AI-generated ad copy for brand voice consistency, compliance with advertising regulations, readability, and persuasion effectiveness." },
  { name: "Teach", idea: "An educational content quality gate API. Scores AI-generated lesson plans and study materials for factual accuracy, grade-level appropriateness, and pedagogical effectiveness." },
  { name: "Recruit", idea: "A quality gate for AI-generated job postings and resume screening. Checks for biased language, legal compliance, and consistency with job requirements." },
];

async function evaluateVertical(v, index) {
  const tag = `[${index + 1}/10 ${v.name}]`;
  console.error(`${tag} Starting...`);
  const start = Date.now();

  try {
    const result = await router.evaluateWithExperiment(v.idea, experiment);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`${tag} Done in ${elapsed}s — variant: ${result.variantId}, quality: ${result.quality}, escalated: ${result.escalated}`);

    return {
      name: v.name,
      variantId: result.variantId,
      provider: result.provider,
      model: result.model,
      quality: result.quality,
      escalated: result.escalated,
      schemaValid: result.schemaValid,
      responseCount: result.responses.length,
      topResponse: result.responses[0]?.text?.substring(0, 500) || null,
      issueCount: result.issues?.length || 0,
      tokens: result.usage?.total_tokens || null,
      latencyMs: result.timing?.total || null,
      error: null,
    };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`${tag} ERROR in ${elapsed}s: ${err.message}`);
    return { name: v.name, error: err.message, quality: 0, escalated: false, responseCount: 0 };
  }
}

console.error(`\n=== MiniMax vs OpenAI A/B Test ===`);
console.error(`Variants: ${experiment.variants.map(v => `${v.id} (${(v.weight * 100).toFixed(0)}%)`).join(" vs ")}\n`);

const batchStart = Date.now();

// Batch 1: 1-5
console.error("--- Batch 1 (1-5) ---");
const batch1 = await Promise.all(VERTICALS.slice(0, 5).map((v, i) => evaluateVertical(v, i)));

// Batch 2: 6-10
console.error("\n--- Batch 2 (6-10) ---");
const batch2 = await Promise.all(VERTICALS.slice(5).map((v, i) => evaluateVertical(v, i + 5)));

const results = [...batch1, ...batch2];
const totalElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);

// Summary
console.error(`\n=== Results (${totalElapsed}s) ===\n`);
console.error("| # | Vertical | Variant | Quality | Escalated | Tokens | Error |");
console.error("|---|----------|---------|---------|-----------|--------|-------|");
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  console.error(`| ${i + 1} | ${r.name.padEnd(10)} | ${(r.variantId || "?").padEnd(20)} | ${r.error ? "ERR" : r.quality?.toFixed(3)} | ${String(r.escalated).padEnd(9)} | ${String(r.tokens || "?").padStart(6)} | ${r.error?.substring(0, 30) || ""} |`);
}

// Provider breakdown
const minimax = results.filter(r => r.variantId === "minimax-text-01");
const openai = results.filter(r => r.variantId === "openai-stored-v3");
console.error(`\nMiniMax: ${minimax.length} runs, avg quality: ${(minimax.reduce((s, r) => s + (r.quality || 0), 0) / (minimax.length || 1)).toFixed(3)}, escalations: ${minimax.filter(r => r.escalated).length}`);
console.error(`OpenAI:  ${openai.length} runs, avg quality: ${(openai.reduce((s, r) => s + (r.quality || 0), 0) / (openai.length || 1)).toFixed(3)}, escalations: ${openai.filter(r => r.escalated).length}`);

// Experiment stats
const stats = getExperimentStats(experiment);
const winner = pickWinner(experiment);
console.error(`\nWinner: ${winner.winner?.id || "insufficient data"} (confidence: ${winner.confidence})`);

// Save
const output = { experiment: experiment.name, timestamp: new Date().toISOString(), totalElapsedSeconds: parseFloat(totalElapsed), results, stats };
console.log(JSON.stringify(output, null, 2));

const outPath = join(__dirname, "..", "data", "minimax-ab-results.json");
mkdirSync(join(__dirname, "..", "data"), { recursive: true });
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.error(`\nSaved to ${outPath}`);
