# Prompt v4 Request — Format Enforcement

**Stored prompt**: `pmpt_69161f0fa8a881909d9e9947df2c7a5e0c66f61254d11606`
**Current version**: v3
**Requested version**: v4
**Owner**: @watthem
**Reference**: [OpenAI Stored Prompts Dashboard](https://platform.openai.com/prompts)

---

## Problem

v3 produces inconsistent scoring formats across responses:
- Sometimes: `1) Self-Serve Fulfillment: 8/10`
- Sometimes: `Self-Serve Fulfillment — 8 out of 10`
- Sometimes: prose with inline scores

This inconsistency causes the quality gate to apply lighter penalties for format variants when it should be getting clean, parseable output every time.

## Requested Change

Add this formatting constraint to the system prompt (append after the existing output format section):

```
SCORING FORMAT (strict):
Each of the 10 dimensions MUST use this exact format on its own line:
  N) Category Name: X/10
where N is 1-10, Category Name is the exact name listed above, and X is the integer score.

Example:
  1) Self-Serve Fulfillment: 8/10
  2) Zero Human Labor: 9/10
  3) 100% Digital Delivery: 10/10
  ...
  Total: 85/100

Do NOT use prose descriptions of scores. Do NOT use "out of 10" or em-dashes.
Each response block must contain all 10 numbered dimension lines and a Total line.
```

## Why This Matters

- The quality gate (`src/quality-gate.mjs`) checks for rubric completeness using regex patterns
- Consistent format means the gate can score with higher confidence
- Reduces false positives where good content gets penalized for format drift
- Enables automated extraction of dimension scores for analytics

## A/B Test Plan

After v4 is created:
1. Run `npm run test:minimax` with experiment config pointing v3 vs v4
2. Compare quality gate scores — v4 should score higher on rubric checks
3. Compare response quality — v4 should not sacrifice content quality for format

## How to Apply

1. Go to [OpenAI Stored Prompts](https://platform.openai.com/prompts)
2. Find prompt `pmpt_69161f0fa8a881909d9e9947df2c7a5e0c66f61254d11606`
3. Click "Create new version"
4. Append the SCORING FORMAT block above to the system instructions
5. Save as version 4
6. Update `.env.local`: no change needed (version is passed at runtime)
7. Test: `node --env-file=.env.local scripts/test-prompt.mjs` (update promptVersion to "4")
