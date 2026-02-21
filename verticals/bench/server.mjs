/**
 * Proofmark Bench — Prompt benchmarking service.
 *
 * Upload prompt variants + test cases, get quality-scored leaderboards
 * across models. Built on the A/B experiment framework.
 *
 * Endpoints:
 *   POST /v1/bench/suites          — Create a benchmark suite
 *   POST /v1/bench/suites/:id/run  — Run a suite (async, returns job ID)
 *   GET  /v1/bench/suites/:id      — Get suite with results
 *   GET  /v1/bench/jobs/:id        — Check job status
 *   GET  /v1/bench/leaderboard     — Cross-suite leaderboard
 *   GET  /health                   — Health check
 *
 * Usage:
 *   node --env-file=.env.local verticals/bench/server.mjs
 *
 * Env:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, MINIMAX_API_KEY
 *   SAAS_IDEAS (stored prompt ID)
 *   BENCH_PORT (default 8091)
 *   BENCH_KEYS (comma-separated API keys, or "*" for open)
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createRouter } from "../../src/router.mjs";
import { qualityGate } from "../../src/quality-gate.mjs";
import {
  defineExperiment,
  getExperimentStats,
  pickWinner,
} from "../../src/prompt-schema.mjs";

const PORT = parseInt(process.env.BENCH_PORT || "8091", 10);
const ALLOWED_KEYS = (process.env.BENCH_KEYS || "*").split(",").map(k => k.trim());

// In-memory stores
const suites = new Map();   // suiteId → Suite
const jobs = new Map();     // jobId → Job

const router = createRouter({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  minimaxKey: process.env.MINIMAX_API_KEY,
  promptId: process.env.SAAS_IDEAS,
});

/**
 * Suite shape:
 * {
 *   id, name, createdAt,
 *   variants: [{ id, provider, model, promptConfig, weight }],
 *   testCases: [{ name, input, expectedSchema? }],
 *   runs: [{ jobId, startedAt, completedAt, results, stats, winner }]
 * }
 */

function authenticate(req) {
  if (ALLOWED_KEYS[0] === "*") return { key: "open", ok: true };
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return { key: null, ok: false };
  const key = auth.slice(7);
  return { key, ok: ALLOWED_KEYS.includes(key) };
}

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

async function runBenchmark(suite, jobId) {
  const job = jobs.get(jobId);
  job.status = "running";
  job.startedAt = new Date().toISOString();

  const experiment = defineExperiment(`bench-${suite.id}`, suite.variants);
  const results = [];

  for (const tc of suite.testCases) {
    const tcStart = Date.now();
    try {
      const result = await router.evaluateWithExperiment(tc.input, experiment);
      results.push({
        testCase: tc.name,
        variantId: result.variantId,
        provider: result.provider,
        model: result.model,
        quality: result.quality,
        escalated: result.escalated,
        schemaValid: result.schemaValid,
        responseCount: result.responses.length,
        tokens: result.usage?.total_tokens || 0,
        latencyMs: result.timing?.total || 0,
        error: null,
      });
    } catch (err) {
      results.push({
        testCase: tc.name,
        error: err.message,
        quality: 0,
      });
    }
    job.progress = results.length / suite.testCases.length;
  }

  const stats = getExperimentStats(experiment);
  const winner = pickWinner(experiment);

  const run = {
    jobId,
    startedAt: job.startedAt,
    completedAt: new Date().toISOString(),
    results,
    stats,
    winner: {
      variantId: winner.winner?.id || null,
      confidence: winner.confidence,
    },
  };

  suite.runs.push(run);
  job.status = "completed";
  job.completedAt = run.completedAt;
  job.result = run;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, null);

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, {
      status: "ok",
      service: "proofmark-bench",
      version: "0.1.0",
      suites: suites.size,
      activeJobs: [...jobs.values()].filter(j => j.status === "running").length,
    });
  }

  const auth = authenticate(req);
  if (!auth.ok) return json(res, 401, { error: "Invalid or missing API key" });

  try {
    // POST /v1/bench/suites — Create a benchmark suite
    if (url.pathname === "/v1/bench/suites" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.name || !body.variants?.length || !body.testCases?.length) {
        return json(res, 400, { error: "Provide name, variants[], and testCases[]" });
      }

      const suite = {
        id: randomUUID().slice(0, 8),
        name: body.name,
        createdAt: new Date().toISOString(),
        owner: auth.key,
        variants: body.variants.map(v => ({
          id: v.id || `${v.provider}-${v.model || "default"}`,
          provider: v.provider || "openai",
          weight: v.weight || 1,
          promptConfig: v.promptConfig || {},
          model: v.model,
        })),
        testCases: body.testCases.map(tc => ({
          name: tc.name || tc.input?.slice(0, 50),
          input: tc.input,
        })),
        runs: [],
      };

      suites.set(suite.id, suite);
      return json(res, 201, { id: suite.id, name: suite.name, testCases: suite.testCases.length, variants: suite.variants.length });
    }

    // POST /v1/bench/suites/:id/run — Run a suite
    const runMatch = url.pathname.match(/^\/v1\/bench\/suites\/([^/]+)\/run$/);
    if (runMatch && req.method === "POST") {
      const suite = suites.get(runMatch[1]);
      if (!suite) return json(res, 404, { error: "Suite not found" });

      const jobId = randomUUID().slice(0, 8);
      const job = { id: jobId, suiteId: suite.id, status: "queued", progress: 0 };
      jobs.set(jobId, job);

      // Run async — don't await
      runBenchmark(suite, jobId).catch(err => {
        job.status = "failed";
        job.error = err.message;
      });

      return json(res, 202, { jobId, status: "queued", poll: `/v1/bench/jobs/${jobId}` });
    }

    // GET /v1/bench/suites/:id — Get suite with results
    const suiteMatch = url.pathname.match(/^\/v1\/bench\/suites\/([^/]+)$/);
    if (suiteMatch && req.method === "GET") {
      const suite = suites.get(suiteMatch[1]);
      if (!suite) return json(res, 404, { error: "Suite not found" });
      return json(res, 200, suite);
    }

    // GET /v1/bench/jobs/:id — Check job status
    const jobMatch = url.pathname.match(/^\/v1\/bench\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) return json(res, 404, { error: "Job not found" });
      return json(res, 200, job);
    }

    // GET /v1/bench/leaderboard — Cross-suite leaderboard
    if (url.pathname === "/v1/bench/leaderboard" && req.method === "GET") {
      const board = {};
      for (const suite of suites.values()) {
        for (const run of suite.runs) {
          if (!run.stats?.variants) continue;
          for (const [variantId, stats] of Object.entries(run.stats.variants)) {
            if (!board[variantId]) {
              board[variantId] = { variantId, runs: 0, totalSamples: 0, qualitySum: 0, tokenSum: 0, wins: 0 };
            }
            board[variantId].runs++;
            board[variantId].totalSamples += stats.samples;
            board[variantId].qualitySum += stats.quality.mean * stats.samples;
            board[variantId].tokenSum += stats.tokens.total;
            if (run.winner?.variantId === variantId) board[variantId].wins++;
          }
        }
      }

      const leaderboard = Object.values(board)
        .map(b => ({
          ...b,
          avgQuality: b.totalSamples > 0 ? b.qualitySum / b.totalSamples : 0,
          avgTokensPerSample: b.totalSamples > 0 ? b.tokenSum / b.totalSamples : 0,
          winRate: b.runs > 0 ? b.wins / b.runs : 0,
        }))
        .sort((a, b) => b.avgQuality - a.avgQuality);

      return json(res, 200, { leaderboard, totalSuites: suites.size });
    }

    return json(res, 404, { error: "Not found" });

  } catch (err) {
    console.error(`[bench] Error: ${err.message}`);
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Proofmark Bench listening on http://localhost:${PORT}`);
  console.log(`Auth: ${ALLOWED_KEYS[0] === "*" ? "OPEN" : `${ALLOWED_KEYS.length} key(s)`}`);
  console.log(`Providers: OpenAI${process.env.ANTHROPIC_API_KEY ? " + Anthropic" : ""}${process.env.MINIMAX_API_KEY ? " + MiniMax" : ""}`);
});
