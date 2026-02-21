# Proofmark

Quality gate for AI responses. Score, route, and auto-escalate across models transparently.

## What it does

Every LLM response gets scored (0.0–1.0) before your user sees it. If quality drops below threshold, Proofmark auto-escalates to a stronger model. The caller never sees the bad response.

**3-tier escalation chain:**

```
MiniMax ($0.001/1K) → OpenAI ($0.01/1K) → Anthropic Opus ($0.06/1K)
```

Each tier is tried in order. First response passing the quality gate wins. Without `MINIMAX_API_KEY`, falls back to 2-tier (OpenAI → Opus).

## Install

```bash
npm install proofmark
```

## Quick start

```js
import { createRouter } from "proofmark/router";

const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  minimaxKey: process.env.MINIMAX_API_KEY, // optional, cheapest tier
  promptId: process.env.SAAS_IDEAS,
});

const result = await router.evaluate("AI-powered pet food subscription");

console.log(result.provider);  // "minimax", "openai", or "anthropic"
console.log(result.quality);   // 0.88
console.log(result.escalated); // false
console.log(result.responses); // [{ text, probability }, ...]
console.log(result.timing);    // { primary: 850, gate: 2, escalation: 0, total: 852 }
```

## Quality gate

Use the gate standalone to score any LLM output:

```js
import { qualityGate, QUALITY_THRESHOLD } from "proofmark/gate";

const result = qualityGate(llmOutputText);
console.log(result.score);      // 0.0–1.0
console.log(result.passesGate); // true if >= QUALITY_THRESHOLD (0.70)
console.log(result.issues);     // ["Missing rubric dimensions", ...]
```

Checks: XML well-formedness, response parsing, probability sanity, rubric completeness (10 dimensions), prompt injection detection, content length, structural consistency.

## A/B testing

Run prompt experiments with Standard Schema v1 (Zod) validation:

```js
import { defineExperiment, selectVariant, recordMetric, pickWinner } from "proofmark/experiment";

const exp = defineExperiment({
  name: "tone-test",
  variants: [
    { id: "formal", promptId: "pmpt_formal" },
    { id: "casual", promptId: "pmpt_casual" },
  ],
  outputSchema: z.object({ score: z.number(), text: z.string() }),
});

const variant = selectVariant(exp);
// ... run your prompt with variant.promptId ...
recordMetric(exp, variant.id, { quality: 0.92, latency: 1200 });

const winner = pickWinner(exp);
// { variantId: "casual", confidence: 0.95, metrics: {...} }
```

## Scoring breakdown

| Check | Weight | Description |
|-------|--------|-------------|
| XML well-formedness | Critical | Open/close tags match |
| Response parsing | Critical | Valid `<response><text><probability>` blocks |
| Probability sanity | Critical | Each 0.0–1.0, sum <= 1.0 |
| Rubric completeness | Warning | 10 scoring dimensions present |
| Prompt injection | Critical | No instruction override artifacts |
| Content length | Warning | Not truncated (<100) or runaway (>10K) |
| Structural consistency | Warning | All responses follow same format |

## Environment variables

```bash
OPENAI_API_KEY=sk-...          # Required: OpenAI primary
ANTHROPIC_API_KEY=sk-ant-...   # Required: Opus fallback
MINIMAX_API_KEY=...            # Optional: cheapest tier (skip if absent)
SAAS_IDEAS=pmpt_...            # Optional: OpenAI stored prompt ID
```

## Development

```bash
# Run unit tests (18 tests)
node --test src/*.test.mjs

# Run adversarial suite (50 cases)
npm run adversarial

# Release (dry run)
npm run release:dry
```

## License

MIT
