/**
 * Proofmark Docs — Documentation quality scoring API.
 *
 * Submit a URL or markdown content, get a structured quality report:
 * completeness, readability grade, Diataxis classification, accuracy signals.
 *
 * Endpoints:
 *   POST /v1/docs/score       — Score documentation content
 *   POST /v1/docs/score-url   — Fetch + score a documentation URL
 *   GET  /v1/docs/reports/:id — Retrieve a stored report
 *   GET  /health              — Health check
 *
 * Usage:
 *   node --env-file=.env.local verticals/docs/server.mjs
 *
 * Env:
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY, MINIMAX_API_KEY
 *   DOCS_PORT (default 8092)
 *   DOCS_KEYS (comma-separated API keys, or "*" for open)
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { qualityGate } from "../../src/quality-gate.mjs";

const PORT = parseInt(process.env.DOCS_PORT || "8092", 10);
const ALLOWED_KEYS = (process.env.DOCS_KEYS || "*").split(",").map(k => k.trim());

// In-memory report store
const reports = new Map();

// Diataxis categories
const DIATAXIS = ["tutorial", "how-to", "reference", "explanation"];

/**
 * Score documentation content on multiple dimensions.
 *
 * Dimensions (each 0-10):
 * - completeness: Does the doc cover its topic fully?
 * - readability: Flesch-Kincaid-like grade level estimate
 * - structure: Headings, sections, logical flow
 * - accuracy_signals: Code blocks match descriptions, links present, no TODOs
 * - diataxis: Which category, and how well it fits
 */
function scoreDocumentation(content) {
  const lines = content.split("\n");
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const sentenceCount = content.split(/[.!?]+/).filter(s => s.trim()).length;
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  const issues = [];
  const scores = {};

  // 1. Completeness — based on length and section coverage
  if (wordCount < 50) {
    scores.completeness = 2;
    issues.push({ dimension: "completeness", severity: "critical", message: "Content is very short (< 50 words)" });
  } else if (wordCount < 200) {
    scores.completeness = 5;
    issues.push({ dimension: "completeness", severity: "warning", message: "Content is short (< 200 words)" });
  } else if (wordCount < 500) {
    scores.completeness = 7;
  } else {
    scores.completeness = 9;
  }

  // 2. Readability — approximate grade level
  const avgSyllables = estimateSyllables(content) / Math.max(wordCount, 1);
  const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllables - 15.59;
  const clampedGrade = Math.max(1, Math.min(18, gradeLevel));
  // Ideal: grade 8-12 for tech docs
  if (clampedGrade >= 8 && clampedGrade <= 12) {
    scores.readability = 9;
  } else if (clampedGrade < 6 || clampedGrade > 14) {
    scores.readability = 5;
    issues.push({ dimension: "readability", severity: "warning", message: `Grade level ${clampedGrade.toFixed(1)} is outside ideal range (8-12)` });
  } else {
    scores.readability = 7;
  }

  // 3. Structure — headings, code blocks, lists
  const headings = lines.filter(l => /^#{1,6}\s/.test(l));
  const codeBlocks = (content.match(/```/g) || []).length / 2;
  const lists = lines.filter(l => /^\s*[-*]\s/.test(l) || /^\s*\d+\.\s/.test(l));

  if (headings.length === 0) {
    scores.structure = 3;
    issues.push({ dimension: "structure", severity: "warning", message: "No headings found" });
  } else if (headings.length < 3) {
    scores.structure = 6;
  } else {
    scores.structure = 8 + Math.min(2, codeBlocks * 0.5);
  }

  // 4. Accuracy signals
  const hasTodos = /\bTODO\b|\bFIXME\b|\bHACK\b/i.test(content);
  const hasLinks = /\[.*?\]\(.*?\)/.test(content) || /https?:\/\//.test(content);
  const hasCodeExamples = codeBlocks > 0;
  let accuracyScore = 7;
  if (hasTodos) { accuracyScore -= 2; issues.push({ dimension: "accuracy", severity: "warning", message: "Contains TODO/FIXME markers" }); }
  if (hasLinks) accuracyScore += 1;
  if (hasCodeExamples) accuracyScore += 1;
  scores.accuracy_signals = Math.min(10, Math.max(1, accuracyScore));

  // 5. Diataxis classification
  const diataxisScores = classifyDiataxis(content, headings);
  scores.diataxis_fit = diataxisScores.fitScore;

  // Composite
  const composite = (
    scores.completeness * 0.25 +
    scores.readability * 0.20 +
    scores.structure * 0.25 +
    scores.accuracy_signals * 0.15 +
    scores.diataxis_fit * 0.15
  ) / 10;

  return {
    score: parseFloat(composite.toFixed(3)),
    scores,
    grade_level: parseFloat(clampedGrade.toFixed(1)),
    word_count: wordCount,
    diataxis: diataxisScores.category,
    diataxis_confidence: diataxisScores.confidence,
    issues,
    passes_gate: composite >= 0.70,
  };
}

function estimateSyllables(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    const vowelGroups = w.match(/[aeiouy]+/g);
    total += vowelGroups ? vowelGroups.length : 1;
  }
  return total;
}

function classifyDiataxis(content, headings) {
  const lower = content.toLowerCase();
  const signals = {
    tutorial: 0,
    "how-to": 0,
    reference: 0,
    explanation: 0,
  };

  // Tutorial signals: step-by-step, "let's", "we will", numbered steps
  if (/step\s*\d|step-by-step/i.test(lower)) signals.tutorial += 3;
  if (/let['']s|we will|you will learn/i.test(lower)) signals.tutorial += 2;
  if (headings.some(h => /getting started|introduction|beginner/i.test(h))) signals.tutorial += 2;

  // How-to signals: imperative mood, problem-solving
  if (/how to|solve|fix|configure|set up|install/i.test(lower)) signals["how-to"] += 3;
  if (headings.some(h => /how to|troubleshoot|prerequisites/i.test(h))) signals["how-to"] += 2;

  // Reference signals: API, params, tables, method signatures
  if (/parameter|return|type|default|required/i.test(lower)) signals.reference += 2;
  if (/\|.*\|.*\|/m.test(content)) signals.reference += 2; // tables
  if (headings.some(h => /api|reference|methods|properties|options/i.test(h))) signals.reference += 3;

  // Explanation signals: why, because, understand, concept
  if (/because|therefore|in order to|the reason/i.test(lower)) signals.explanation += 2;
  if (/understand|concept|background|overview/i.test(lower)) signals.explanation += 2;
  if (headings.some(h => /overview|background|concepts|architecture/i.test(h))) signals.explanation += 2;

  const sorted = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  const [category, score] = sorted[0];
  const totalSignals = Object.values(signals).reduce((a, b) => a + b, 0);

  return {
    category,
    confidence: totalSignals > 0 ? parseFloat((score / totalSignals).toFixed(2)) : 0,
    fitScore: Math.min(10, score + 3), // base 3, up to 10 based on signals
  };
}

// HTTP utilities
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
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error("Invalid JSON body")); }
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

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, null);

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, {
      status: "ok",
      service: "proofmark-docs",
      version: "0.1.0",
      reports: reports.size,
    });
  }

  const auth = authenticate(req);
  if (!auth.ok) return json(res, 401, { error: "Invalid or missing API key" });

  try {
    // POST /v1/docs/score — Score markdown content
    if (url.pathname === "/v1/docs/score" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.content) return json(res, 400, { error: "Provide 'content' (markdown string)" });

      const result = scoreDocumentation(body.content);
      const report = {
        id: randomUUID().slice(0, 8),
        createdAt: new Date().toISOString(),
        source: body.source || "direct",
        ...result,
      };

      reports.set(report.id, report);
      return json(res, 200, report);
    }

    // POST /v1/docs/score-url — Fetch + score a URL
    if (url.pathname === "/v1/docs/score-url" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.url) return json(res, 400, { error: "Provide 'url' to score" });

      const fetchRes = await fetch(body.url, {
        headers: { "Accept": "text/plain, text/markdown, text/html" },
      });
      if (!fetchRes.ok) return json(res, 502, { error: `Failed to fetch URL: ${fetchRes.status}` });

      let content = await fetchRes.text();
      // Basic HTML → text stripping if HTML
      if (content.includes("<html") || content.includes("<!DOCTYPE")) {
        content = content
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const result = scoreDocumentation(content);
      const report = {
        id: randomUUID().slice(0, 8),
        createdAt: new Date().toISOString(),
        source: body.url,
        ...result,
      };

      reports.set(report.id, report);
      return json(res, 200, report);
    }

    // GET /v1/docs/reports/:id — Get stored report
    const reportMatch = url.pathname.match(/^\/v1\/docs\/reports\/([^/]+)$/);
    if (reportMatch && req.method === "GET") {
      const report = reports.get(reportMatch[1]);
      if (!report) return json(res, 404, { error: "Report not found" });
      return json(res, 200, report);
    }

    return json(res, 404, { error: "Not found" });

  } catch (err) {
    console.error(`[docs] Error: ${err.message}`);
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Proofmark Docs listening on http://localhost:${PORT}`);
  console.log(`Auth: ${ALLOWED_KEYS[0] === "*" ? "OPEN" : `${ALLOWED_KEYS.length} key(s)`}`);
});
