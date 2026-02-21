/**
 * Test caller for the OpenAI stored prompt.
 * Usage: node --env-file=.env.local scripts/test-prompt.mjs [idea]
 */
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const idea = process.argv[2] || "AI-powered pet food subscription box that learns your pet's preferences";

console.log(`\n--- Calling stored prompt: ${process.env.SAAS_IDEAS} ---`);
console.log(`Input idea: "${idea}"\n`);

try {
  const response = await openai.responses.create({
    prompt: {
      id: process.env.SAAS_IDEAS,
      version: "3",
    },
    input: idea,
    reasoning: {
      summary: "auto",
    },
    store: true,
    include: [
      "reasoning.encrypted_content",
      "web_search_call.action.sources",
    ],
  });

  console.log("=== RAW RESPONSE ===");
  console.log(JSON.stringify(response, null, 2));

  console.log("\n=== RESPONSE SHAPE ===");
  console.log("Top-level keys:", Object.keys(response));
  console.log("Type:", response.object);

  if (response.output) {
    console.log("\nOutput items:", response.output.length);
    for (const item of response.output) {
      console.log(`  - type: ${item.type}, keys: ${Object.keys(item).join(", ")}`);
      if (item.type === "message") {
        console.log(`    content types: ${item.content?.map(c => c.type).join(", ")}`);
        console.log(`    text preview: ${item.content?.[0]?.text?.substring(0, 200)}...`);
      }
    }
  }
} catch (err) {
  console.error("API Error:", err.message);
  if (err.status) console.error("Status:", err.status);
  if (err.error) console.error("Details:", JSON.stringify(err.error, null, 2));
}
