/**
 * End-to-end test of the quality-gated router.
 * Usage: node --env-file=.env.local scripts/test-router.mjs [idea]
 */
import { createRouter } from "../src/router.mjs";

const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  promptId: process.env.SAAS_IDEAS,
});

const idea = process.argv[2] || "A Chrome extension that tracks how long you spend on each SaaS tool and suggests cheaper alternatives";

console.log(`\n=== IdeaHub Router Test ===`);
console.log(`Idea: "${idea}"\n`);

const result = await router.evaluate(idea);

console.log(`Provider: ${result.provider} (${result.model})`);
console.log(`Quality:  ${result.quality} (threshold: 0.70)`);
console.log(`Escalated: ${result.escalated}`);
console.log(`Responses: ${result.responses.length}`);
console.log(`Timing:   primary=${result.timing.primary}ms, gate=${result.timing.gate}ms, escalation=${result.timing.escalation}ms, total=${result.timing.total}ms`);
console.log(`Tokens:   ${JSON.stringify(result.usage)}`);

if (result.issues.length > 0) {
  console.log(`\nIssues (${result.issues.length}):`);
  for (const issue of result.issues) {
    console.log(`  [${issue.severity}] ${issue.category}: ${issue.message}`);
  }
}

console.log(`\n--- Top Response (probability: ${result.responses[0]?.probability}) ---`);
console.log(result.responses[0]?.text?.substring(0, 500) + "...");
