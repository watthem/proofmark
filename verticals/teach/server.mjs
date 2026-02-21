/**
 * Proofmark Teach — Educational content quality gate API.
 *
 * Scores lesson plans and curriculum content against proven pedagogical methods:
 * - Suzuki: play first, theory after (experiential before conceptual)
 * - Kodaly: start with familiar, name what you know
 * - Orff: rhythm before pitch, body before instrument
 *
 * Understands two input formats:
 * 1. Markdown lessons (generic educational content)
 * 2. GetNotes curriculum nodes (JSONB content schema with objective, steps, tips, etc.)
 *
 * Endpoints:
 *   POST /v1/teach/score            — Score a lesson plan (markdown or JSONB)
 *   POST /v1/teach/score-batch      — Score multiple lessons
 *   POST /v1/teach/audit-curriculum — Audit an entire curriculum track
 *   GET  /v1/teach/reports/:id      — Retrieve a stored report
 *   GET  /health                    — Health check
 *
 * Usage:
 *   node --env-file=.env.local verticals/teach/server.mjs
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = parseInt(process.env.TEACH_PORT || "8093", 10);
const ALLOWED_KEYS = (process.env.TEACH_KEYS || "*").split(",").map(k => k.trim());

const reports = new Map();

// Bloom's taxonomy levels
const BLOOMS_LEVELS = [
  { level: "remember", verbs: ["define", "list", "recall", "identify", "name", "state", "describe", "recognize", "label"] },
  { level: "understand", verbs: ["explain", "summarize", "interpret", "classify", "compare", "contrast", "discuss", "hear", "listen", "notice"] },
  { level: "apply", verbs: ["apply", "demonstrate", "solve", "use", "implement", "execute", "calculate", "play", "perform", "practice", "strum", "pluck", "tune"] },
  { level: "analyze", verbs: ["analyze", "differentiate", "examine", "categorize", "distinguish", "break down", "alternate", "switch"] },
  { level: "evaluate", verbs: ["evaluate", "judge", "justify", "critique", "assess", "defend", "argue", "check", "verify"] },
  { level: "create", verbs: ["create", "design", "construct", "develop", "compose", "produce", "formulate", "improvise", "build"] },
];

// Pedagogy method detectors (Suzuki, Kodaly, Orff)
const PEDAGOGY_METHODS = {
  suzuki: {
    name: "Suzuki (play-first)",
    signals: [
      { pattern: /play|sound|pluck|strum|perform/i, weight: 2, label: "action-before-theory" },
      { pattern: /first sound|first note|first song|make.*music/i, weight: 3, label: "immediate-experience" },
      { pattern: /listen|hear|sound.*like|ring out/i, weight: 2, label: "ear-training" },
      { pattern: /no.*theory|no.*reading|just.*sound|before.*theory/i, weight: 3, label: "theory-deferred" },
      { pattern: /repeat|imitate|mirror|copy/i, weight: 1, label: "imitation-learning" },
    ],
  },
  kodaly: {
    name: "Kodaly (familiar-first)",
    signals: [
      { pattern: /familiar|know.*already|recognize|remember.*from/i, weight: 2, label: "prior-knowledge" },
      { pattern: /mnemonic|memory.*trick|song.*name|eddie.*ate/i, weight: 3, label: "mnemonic-anchoring" },
      { pattern: /name.*out.*loud|say.*name|call.*it/i, weight: 2, label: "vocalization" },
      { pattern: /sing|song|melody|campfire/i, weight: 1, label: "song-based" },
    ],
  },
  orff: {
    name: "Orff (rhythm-first)",
    signals: [
      { pattern: /rhythm|pulse|beat|tempo|metronome|bpm/i, weight: 2, label: "rhythm-focus" },
      { pattern: /tap|clap|body.*percussion|stomp|snap/i, weight: 3, label: "body-percussion" },
      { pattern: /before.*chord|before.*note|foundation|sits.*on/i, weight: 2, label: "rhythm-before-pitch" },
      { pattern: /backbeat|downbeat|eighth.*note|strum.*pattern/i, weight: 2, label: "rhythmic-vocabulary" },
    ],
  },
};

/**
 * Score a lesson. Accepts markdown or GetNotes JSONB content schema.
 *
 * GetNotes content schema:
 * { objective, steps[], tips[], common_mistakes[], encouragement, theory_notes, target }
 */
function scoreLesson(lesson) {
  // Normalize input — handle both markdown and JSONB
  const isStructured = lesson.structured_content || (lesson.content && typeof lesson.content === "object");
  const structured = isStructured
    ? (lesson.structured_content || lesson.content)
    : null;

  // Build a flat text for text-analysis dimensions
  let content;
  if (structured) {
    content = flattenStructured(structured);
  } else {
    content = typeof lesson.content === "string" ? lesson.content : "";
  }

  const objectives = lesson.objectives
    || (structured?.objective ? [structured.objective] : null)
    || extractObjectives(content);

  const issues = [];
  const scores = {};
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // ──── 1. Structural completeness (0-10) ────
  if (structured) {
    scores.structure = scoreStructuredLesson(structured, issues);
  } else {
    scores.structure = scoreMarkdownStructure(content, objectives, issues);
  }

  // ──── 2. Grade-level appropriateness (0-10) ────
  const sentenceCount = content.split(/[.!?]+/).filter(s => s.trim()).length;
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const avgSyllables = estimateSyllables(content) / Math.max(wordCount, 1);
  const gradeLevel = Math.max(1, Math.min(18, 0.39 * avgWordsPerSentence + 11.8 * avgSyllables - 15.59));

  const targetRange = parseGradeRange(lesson.grade_level);
  if (targetRange) {
    const inRange = gradeLevel >= targetRange[0] && gradeLevel <= targetRange[1];
    const closeToRange = gradeLevel >= targetRange[0] - 2 && gradeLevel <= targetRange[1] + 2;
    if (inRange) scores.grade_appropriateness = 9;
    else if (closeToRange) {
      scores.grade_appropriateness = 6;
      issues.push({ dimension: "grade", severity: "warning", message: `Reads at grade ${gradeLevel.toFixed(1)}, target is ${lesson.grade_level}` });
    } else {
      scores.grade_appropriateness = 3;
      issues.push({ dimension: "grade", severity: "critical", message: `Grade ${gradeLevel.toFixed(1)} far outside target ${lesson.grade_level}` });
    }
  } else {
    scores.grade_appropriateness = (gradeLevel >= 5 && gradeLevel <= 12) ? 8 : 5;
  }

  // ──── 3. Bloom's taxonomy alignment (0-10) ────
  const bloomsDetected = detectBlooms(content, objectives);
  const uniqueLevels = new Set(bloomsDetected.map(b => b.level)).size;
  scores.blooms_alignment = Math.min(10, uniqueLevels * 2);
  if (uniqueLevels <= 1) {
    issues.push({ dimension: "blooms", severity: "warning", message: "Targets only one Bloom's level" });
  }

  // ──── 4. Pedagogy method alignment (0-10) ────
  const pedagogy = detectPedagogy(content);
  scores.pedagogy = pedagogy.score;
  if (pedagogy.methods.length === 0) {
    issues.push({ dimension: "pedagogy", severity: "warning", message: "No recognized pedagogy signals (Suzuki/Kodaly/Orff)" });
  }

  // ──── 5. Engagement and safety (0-10) ────
  let engagementScore = 4;
  const hasEncouragement = structured?.encouragement || /encouragement|you.*did|great.*job|well.*done|keep.*going/i.test(content);
  const hasTips = structured?.tips?.length > 0 || /tip[s]?:|hint|pro.*tip/i.test(content);
  const hasCommonMistakes = structured?.common_mistakes?.length > 0 || /common.*mistake|watch.*out|avoid/i.test(content);
  const hasTarget = structured?.target || /target|goal|aim.*for/i.test(content);
  if (hasEncouragement) engagementScore += 2;
  if (hasTips) engagementScore += 1;
  if (hasCommonMistakes) engagementScore += 2;
  if (hasTarget) engagementScore += 1;
  scores.engagement = Math.min(10, engagementScore);

  // ──── 6. Progressive difficulty signals (0-10) — for curriculum context ────
  let progressionScore = 5; // neutral baseline
  if (structured?.steps?.length >= 3) progressionScore += 1;
  if (structured?.steps?.length >= 5) progressionScore += 1;
  // Steps that build on each other
  const steps = structured?.steps || [];
  const buildSignals = steps.filter(s => /now|next|once|after|then/i.test(s)).length;
  progressionScore += Math.min(3, buildSignals);
  scores.progression = Math.min(10, progressionScore);

  // ──── Composite ────
  const composite = (
    scores.structure * 0.20 +
    scores.grade_appropriateness * 0.15 +
    scores.blooms_alignment * 0.10 +
    scores.pedagogy * 0.20 +
    scores.engagement * 0.20 +
    scores.progression * 0.15
  ) / 10;

  return {
    score: parseFloat(composite.toFixed(3)),
    scores,
    grade_level: parseFloat(gradeLevel.toFixed(1)),
    word_count: wordCount,
    objectives_found: objectives.length,
    blooms_levels: [...new Set(bloomsDetected.map(b => b.level))],
    blooms_details: bloomsDetected.slice(0, 10),
    pedagogy_methods: pedagogy.methods,
    pedagogy_signals: pedagogy.signals.slice(0, 15),
    is_structured: !!structured,
    issues,
    passes_gate: composite >= 0.70,
  };
}

function scoreStructuredLesson(s, issues) {
  let score = 0;
  if (s.objective) score += 2;
  else issues.push({ dimension: "structure", severity: "critical", message: "Missing objective" });

  if (s.steps?.length >= 3) score += 3;
  else if (s.steps?.length > 0) score += 1;
  else issues.push({ dimension: "structure", severity: "critical", message: "Missing steps" });

  if (s.tips?.length > 0) score += 1.5;
  if (s.common_mistakes?.length > 0) score += 1.5;
  else issues.push({ dimension: "structure", severity: "warning", message: "Missing common_mistakes" });

  if (s.encouragement) score += 1;
  if (s.target) score += 1;
  else issues.push({ dimension: "structure", severity: "warning", message: "Missing measurable target" });

  return Math.min(10, score);
}

function scoreMarkdownStructure(content, objectives, issues) {
  const hasObjectives = objectives.length > 0;
  const hasInstruction = /explanation|concept|theory|example|demonstrate/i.test(content);
  const hasPractice = /practice|exercise|try|activity|worksheet/i.test(content);
  const hasAssessment = /assess|quiz|test|check|review|evaluate/i.test(content);
  const sections = [hasObjectives, hasInstruction, hasPractice, hasAssessment].filter(Boolean).length;

  if (!hasObjectives) issues.push({ dimension: "structure", severity: "critical", message: "No learning objectives found" });
  if (!hasAssessment) issues.push({ dimension: "structure", severity: "warning", message: "No assessment section found" });
  if (!hasPractice) issues.push({ dimension: "structure", severity: "warning", message: "No practice section found" });

  return Math.min(10, sections * 2.5);
}

function detectPedagogy(content) {
  const methods = [];
  const signals = [];
  let totalScore = 0;

  for (const [key, method] of Object.entries(PEDAGOGY_METHODS)) {
    let methodScore = 0;
    for (const signal of method.signals) {
      if (signal.pattern.test(content)) {
        methodScore += signal.weight;
        signals.push({ method: key, label: signal.label, weight: signal.weight });
      }
    }
    if (methodScore > 0) {
      methods.push({ method: key, name: method.name, strength: methodScore });
      totalScore += methodScore;
    }
  }

  // Score: 0 = no signals, 5 = some signals, 10 = strong multi-method alignment
  const score = Math.min(10, 3 + totalScore * 0.7);

  return {
    methods: methods.sort((a, b) => b.strength - a.strength),
    signals,
    score: parseFloat(score.toFixed(1)),
  };
}

function flattenStructured(s) {
  const parts = [];
  if (s.objective) parts.push(s.objective);
  if (s.steps) parts.push(...s.steps);
  if (s.tips) parts.push(...s.tips);
  if (s.common_mistakes) parts.push(...s.common_mistakes);
  if (s.encouragement) parts.push(s.encouragement);
  if (s.theory_notes) parts.push(s.theory_notes);
  return parts.join("\n");
}

function extractObjectives(content) {
  const lines = content.split("\n");
  const objectives = [];
  let inSection = false;
  for (const line of lines) {
    if (/objective|learning goal|by the end|students will/i.test(line)) {
      inSection = true;
      const inline = line.match(/(?:will|can|be able to)\s+(.+)/i);
      if (inline) objectives.push(inline[1].trim());
      continue;
    }
    if (inSection && /^\s*[-*]\s/.test(line)) {
      objectives.push(line.replace(/^\s*[-*]\s/, "").trim());
    } else if (inSection && /^#/.test(line)) {
      inSection = false;
    }
  }
  return objectives;
}

function detectBlooms(content, objectives) {
  const allText = [...objectives, content].join(" ").toLowerCase();
  const found = [];
  for (const level of BLOOMS_LEVELS) {
    for (const verb of level.verbs) {
      if (new RegExp(`\\b${verb}\\b`, "i").test(allText)) {
        found.push({ level: level.level, verb });
      }
    }
  }
  return found;
}

function estimateSyllables(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const w of words) {
    const g = w.match(/[aeiouy]+/g);
    total += g ? g.length : 1;
  }
  return total;
}

function parseGradeRange(grade) {
  if (!grade) return null;
  const g = grade.toLowerCase().trim();
  if (g.includes("k") || g.includes("kindergarten")) return [0, 2];
  if (g.includes("college") || g.includes("university")) return [12, 18];
  const range = g.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [parseInt(range[1]), parseInt(range[2])];
  const single = g.match(/(\d+)/);
  if (single) return [parseInt(single[1]) - 1, parseInt(single[1]) + 1];
  return null;
}

/**
 * Audit an entire curriculum track.
 * Accepts an array of nodes and scores them collectively,
 * checking progression, prerequisite coverage, and method consistency.
 */
function auditCurriculum(track) {
  const nodeReports = track.nodes.map(node => {
    const lesson = {
      title: node.title,
      content: node.content, // JSONB or string
      structured_content: typeof node.content === "object" ? node.content : null,
      grade_level: track.grade_level,
      subject: track.subject || track.instrument,
    };
    return { ...scoreLesson(lesson), node_id: node.id, title: node.title, type: node.type, order: node.order_index };
  });

  // Track-level checks
  const trackIssues = [];

  // Progression: do scores roughly maintain or improve across nodes?
  const nodeScores = nodeReports.map(r => r.score);
  const avgScore = nodeScores.reduce((a, b) => a + b, 0) / nodeScores.length;

  // Method consistency: does the track use the same pedagogy throughout?
  const allMethods = new Set();
  for (const r of nodeReports) {
    for (const m of r.pedagogy_methods) allMethods.add(m.method);
  }
  if (allMethods.size === 0) {
    trackIssues.push({ severity: "warning", message: "No pedagogy methods detected across the entire track" });
  }

  // Type variety: good tracks mix lesson, practice, milestone
  const types = new Set(nodeReports.map(r => r.type).filter(Boolean));
  if (types.size < 2) {
    trackIssues.push({ severity: "info", message: "Track uses only one node type — consider mixing lessons, practice, and milestones" });
  }

  // Check for milestone nodes
  const hasMilestones = nodeReports.some(r => r.type === "milestone");
  if (!hasMilestones) {
    trackIssues.push({ severity: "warning", message: "No milestone nodes — learners need achievement markers" });
  }

  return {
    track_name: track.name || track.title,
    node_count: nodeReports.length,
    avg_score: parseFloat(avgScore.toFixed(3)),
    passing: nodeReports.filter(r => r.passes_gate).length,
    failing: nodeReports.filter(r => !r.passes_gate).length,
    pedagogy_methods: [...allMethods],
    node_types: [...types],
    track_issues: trackIssues,
    nodes: nodeReports,
  };
}

// HTTP
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
    return json(res, 200, { status: "ok", service: "proofmark-teach", version: "0.2.0", reports: reports.size });
  }

  const auth = authenticate(req);
  if (!auth.ok) return json(res, 401, { error: "Invalid or missing API key" });

  try {
    // POST /v1/teach/score — Score a single lesson
    if (url.pathname === "/v1/teach/score" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.content) return json(res, 400, { error: "Provide 'content' (markdown string or JSONB object)" });
      const result = scoreLesson(body);
      const report = { id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), title: body.title || "Untitled", ...result };
      reports.set(report.id, report);
      return json(res, 200, report);
    }

    // POST /v1/teach/score-batch — Score multiple lessons
    if (url.pathname === "/v1/teach/score-batch" && req.method === "POST") {
      const body = await parseBody(req);
      if (!Array.isArray(body.lessons)) return json(res, 400, { error: "Provide 'lessons' array" });
      const results = body.lessons.map(lesson => {
        const result = scoreLesson(lesson);
        const report = { id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), title: lesson.title || "Untitled", ...result };
        reports.set(report.id, report);
        return report;
      });
      const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
      return json(res, 200, { count: results.length, avg_score: parseFloat(avgScore.toFixed(3)), passing: results.filter(r => r.passes_gate).length, results });
    }

    // POST /v1/teach/audit-curriculum — Audit an entire curriculum track
    if (url.pathname === "/v1/teach/audit-curriculum" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.nodes?.length) return json(res, 400, { error: "Provide 'nodes' array (curriculum_nodes)" });
      const result = auditCurriculum(body);
      const report = { id: randomUUID().slice(0, 8), createdAt: new Date().toISOString(), ...result };
      reports.set(report.id, report);
      return json(res, 200, report);
    }

    // GET /v1/teach/reports/:id
    const reportMatch = url.pathname.match(/^\/v1\/teach\/reports\/([^/]+)$/);
    if (reportMatch && req.method === "GET") {
      const report = reports.get(reportMatch[1]);
      if (!report) return json(res, 404, { error: "Report not found" });
      return json(res, 200, report);
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(`[teach] Error: ${err.message}`);
    return json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Proofmark Teach listening on http://localhost:${PORT}`);
  console.log(`Auth: ${ALLOWED_KEYS[0] === "*" ? "OPEN" : `${ALLOWED_KEYS.length} key(s)`}`);
  console.log("Pedagogy: Suzuki (play-first) + Kodaly (familiar-first) + Orff (rhythm-first)");
});
