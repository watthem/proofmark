/**
 * Prompt schema + A/B testing unit tests.
 * Run: node --test src/prompt-schema.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  defineExperiment,
  selectVariant,
  validateOutput,
  recordMetric,
  getExperimentStats,
  pickWinner,
} from "./prompt-schema.mjs";

describe("defineExperiment", () => {
  it("normalizes weights", () => {
    const exp = defineExperiment("test", [
      { id: "a", provider: "openai", weight: 7 },
      { id: "b", provider: "anthropic", weight: 3 },
    ]);
    assert.equal(exp.variants.length, 2);
    assert.ok(Math.abs(exp.variants[0].weight - 0.7) < 0.001);
    assert.ok(Math.abs(exp.variants[1].weight - 0.3) < 0.001);
  });

  it("throws on empty variants", () => {
    assert.throws(() => defineExperiment("empty", []), /at least one variant/);
  });

  it("defaults weight to 1 if not provided", () => {
    const exp = defineExperiment("equal", [
      { id: "a", provider: "openai" },
      { id: "b", provider: "anthropic" },
    ]);
    assert.ok(Math.abs(exp.variants[0].weight - 0.5) < 0.001);
  });
});

describe("selectVariant", () => {
  it("returns a variant from the experiment", () => {
    const exp = defineExperiment("test", [
      { id: "a", provider: "openai", weight: 1 },
      { id: "b", provider: "anthropic", weight: 1 },
    ]);

    const selected = selectVariant(exp);
    assert.ok(["a", "b"].includes(selected.id));
  });

  it("respects extreme weights", () => {
    const exp = defineExperiment("skewed", [
      { id: "heavy", provider: "openai", weight: 999 },
      { id: "light", provider: "anthropic", weight: 1 },
    ]);

    // Run 100 selections — heavy should win most
    const counts = { heavy: 0, light: 0 };
    for (let i = 0; i < 100; i++) {
      counts[selectVariant(exp).id]++;
    }
    assert.ok(counts.heavy > 80, `Expected heavy > 80, got ${counts.heavy}`);
  });
});

describe("validateOutput with Standard Schema (Zod)", () => {
  it("passes valid output against Zod schema", async () => {
    const schema = z.array(z.object({
      text: z.string().min(10),
      probability: z.number().min(0).max(1),
    }));

    const variant = { id: "test", provider: "openai", outputSchema: schema };
    const output = [
      { text: "This is a valid evaluation response", probability: 0.08 },
      { text: "Another valid evaluation response here", probability: 0.06 },
    ];

    const result = await validateOutput(variant, output);
    assert.equal(result.valid, true);
    assert.equal(result.issues.length, 0);
  });

  it("fails invalid output against Zod schema", async () => {
    const schema = z.array(z.object({
      text: z.string().min(10),
      probability: z.number().min(0).max(1),
    }));

    const variant = { id: "test", provider: "openai", outputSchema: schema };
    const output = [
      { text: "short", probability: 1.5 },  // text too short, probability > 1
    ];

    const result = await validateOutput(variant, output);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0);
  });

  it("skips validation when no schema defined", async () => {
    const variant = { id: "test", provider: "openai" };
    const result = await validateOutput(variant, "anything");
    assert.equal(result.valid, true);
  });
});

describe("metrics and winner selection", () => {
  it("records and aggregates metrics", () => {
    const exp = defineExperiment("test", [
      { id: "a", provider: "openai", weight: 1 },
      { id: "b", provider: "anthropic", weight: 1 },
    ]);

    // Simulate 10 runs for each variant
    for (let i = 0; i < 10; i++) {
      recordMetric(exp, "a", { qualityScore: 0.85 + Math.random() * 0.1, escalated: false, schemaValid: true, latencyMs: 1000 + Math.random() * 500, tokenCount: 10000 });
      recordMetric(exp, "b", { qualityScore: 0.60 + Math.random() * 0.1, escalated: true, schemaValid: true, latencyMs: 3000 + Math.random() * 500, tokenCount: 20000 });
    }

    const stats = getExperimentStats(exp);
    assert.equal(stats.totalSamples, 20);
    assert.ok(stats.variants.a.quality.mean > stats.variants.b.quality.mean);
    assert.ok(stats.variants.a.latency.mean < stats.variants.b.latency.mean);
  });

  it("picks winner with sufficient data", () => {
    const exp = defineExperiment("test", [
      { id: "good", provider: "openai", weight: 1 },
      { id: "bad", provider: "anthropic", weight: 1 },
    ]);

    for (let i = 0; i < 30; i++) {
      recordMetric(exp, "good", { qualityScore: 0.92, escalated: false, schemaValid: true, latencyMs: 1200, tokenCount: 10000 });
      recordMetric(exp, "bad", { qualityScore: 0.55, escalated: true, schemaValid: false, latencyMs: 4000, tokenCount: 25000 });
    }

    const result = pickWinner(exp);
    assert.equal(result.winner.id, "good");
    assert.equal(result.confidence, "high");
  });

  it("returns null winner with insufficient data", () => {
    const exp = defineExperiment("test", [
      { id: "a", provider: "openai", weight: 1 },
      { id: "b", provider: "anthropic", weight: 1 },
    ]);

    recordMetric(exp, "a", { qualityScore: 0.9, escalated: false, schemaValid: true, latencyMs: 1000, tokenCount: 10000 });

    const result = pickWinner(exp);
    assert.equal(result.winner, null);
    assert.equal(result.confidence, "insufficient_data");
  });
});
