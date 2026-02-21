/**
 * Proofmark Gate — Quality-gated LLM proxy API.
 *
 * Drop-in replacement for direct LLM API calls.
 * Scores every response 0.0-1.0, auto-escalates when quality drops.
 *
 * Endpoints:
 *   POST /v1/chat/completions   — OpenAI-compatible proxy with quality gate
 *   POST /v1/gate/score         — Score raw text without calling an LLM
 *   GET  /v1/gate/stats         — Per-key usage and quality stats
 *   GET  /health                — Health check
 *
 * Usage:
 *   node --env-file=.env.local verticals/gate/server.mjs
 *
 * Env:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, MINIMAX_API_KEY
 *   SAAS_IDEAS (stored prompt ID)
 *   GATE_PORT (default 8090)
 *   GATE_KEYS (comma-separated API keys, or "*" for open)
 */

import { createServer } from "node:http";
import { createRouter } from "../../src/router.mjs";
import { qualityGate, parseResponses } from "../../src/quality-gate.mjs";
import { defineExperiment, getExperimentStats } from "../../src/prompt-schema.mjs";

const PORT = parseInt(process.env.GATE_PORT || "8090", 10);
const ALLOWED_KEYS = (process.env.GATE_KEYS || "*").split(",").map(k => k.trim());

// In-memory stats per API key
const keyStats = new Map();

function getStats(apiKey) {
  if (!keyStats.has(apiKey)) {
    keyStats.set(apiKey, {
      requests: 0,
      totalTokens: 0,
      escalations: 0,
      avgQuality: 0,
      qualitySum: 0,
      lastRequest: null,
      byModel: {},
    });
  }
  return keyStats.get(apiKey);
}

function recordRequest(apiKey, result) {
  const stats = getStats(apiKey);
  stats.requests++;
  stats.totalTokens += result.usage?.total_tokens || 0;
  if (result.escalated) stats.escalations++;
  stats.qualitySum += result.quality;
  stats.avgQuality = stats.qualitySum / stats.requests;
  stats.lastRequest = new Date().toISOString();

  const model = result.model || "unknown";
  stats.byModel[model] = (stats.byModel[model] || 0) + 1;
}

// Auth middleware
function authenticate(req) {
  if (ALLOWED_KEYS[0] === "*") return { key: "open", ok: true };
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return { key: null, ok: false };
  const key = auth.slice(7);
  return { key, ok: ALLOWED_KEYS.includes(key) };
}

// JSON body parser
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

// Create the router
const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  minimaxKey: process.env.MINIMAX_API_KEY,
  promptId: process.env.SAAS_IDEAS,
});

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return json(res, 204, null);
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check — no auth
  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, {
      status: "ok",
      service: "proofmark-gate",
      version: "0.1.0",
      uptime: process.uptime(),
    });
  }

  // Auth check for everything else
  const auth = authenticate(req);
  if (!auth.ok) {
    return json(res, 401, { error: "Invalid or missing API key" });
  }

  try {
    // POST /v1/chat/completions — OpenAI-compatible proxy
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      const body = await parseBody(req);

      // Accept either OpenAI-style messages or raw "input" string
      let input;
      if (body.input) {
        input = body.input;
      } else if (body.messages?.length) {
        // Extract the last user message
        const userMsg = [...body.messages].reverse().find(m => m.role === "user");
        input = userMsg?.content || "";
      } else {
        return json(res, 400, { error: "Provide 'input' string or 'messages' array" });
      }

      const opts = {
        qualityThreshold: body.quality_threshold,
        allowEscalation: body.allow_escalation !== false,
        preferProvider: body.prefer_provider, // "minimax" | "openai" | "anthropic"
      };

      const result = await router.evaluate(input);

      recordRequest(auth.key, result);

      // Return OpenAI-compatible response shape + gate metadata
      return json(res, 200, {
        id: `gate-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: result.responses.map((r, i) => ({
          index: i,
          message: { role: "assistant", content: r.text },
          finish_reason: "stop",
        })),
        usage: result.usage,
        // Proofmark extensions
        proofmark: {
          quality: result.quality,
          escalated: result.escalated,
          provider: result.provider,
          issues: result.issues,
          timing: result.timing,
          gate_threshold: 0.70,
        },
      });
    }

    // POST /v1/gate/score — Score raw text without LLM call
    if (url.pathname === "/v1/gate/score" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.text) {
        return json(res, 400, { error: "Provide 'text' to score" });
      }

      const gate = qualityGate(body.text);
      return json(res, 200, {
        score: gate.score,
        passes_gate: gate.passesGate,
        threshold: gate.threshold,
        issues: gate.issues,
        response_count: gate.responses.length,
      });
    }

    // GET /v1/gate/stats — Usage stats for this API key
    if (url.pathname === "/v1/gate/stats" && req.method === "GET") {
      const stats = getStats(auth.key);
      return json(res, 200, {
        api_key: auth.key === "open" ? "open" : `${auth.key.slice(0, 8)}...`,
        ...stats,
        escalation_rate: stats.requests > 0 ? stats.escalations / stats.requests : 0,
      });
    }

    // 404
    return json(res, 404, { error: "Not found" });

  } catch (err) {
    console.error(`[gate] Error: ${err.message}`);
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Proofmark Gate listening on http://localhost:${PORT}`);
  console.log(`Auth: ${ALLOWED_KEYS[0] === "*" ? "OPEN (no auth required)" : `${ALLOWED_KEYS.length} key(s) configured`}`);
  console.log(`Providers: OpenAI${process.env.ANTHROPIC_API_KEY ? " + Anthropic" : ""}${process.env.MINIMAX_API_KEY ? " + MiniMax" : ""}`);
});
