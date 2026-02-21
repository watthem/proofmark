/**
 * Quality Gate — scores AI responses 0.0–1.0 before returning them.
 *
 * Checks for:
 *   - XML well-formedness (tags open/close properly)
 *   - Expected structure (<response><text>...<probability>)
 *   - Probability sanity (0.0–1.0, sum ≤ 1.0)
 *   - Scoring rubric completeness (10 categories present)
 *   - Prompt injection artifacts (system/assistant role leaks, instruction override attempts)
 *   - Formatting consistency (all responses follow same structure)
 *
 * Returns { score, issues, responses, passesGate }
 */

const QUALITY_THRESHOLD = 0.70;

/**
 * Parse XML responses from the raw output text.
 * Handles the multi-response format: <response><text>...</text><probability>N</probability></response>
 */
export function parseResponses(outputText) {
  const responses = [];
  const responseRegex = /<response>\s*<text>([\s\S]*?)<\/text>\s*<probability>([\s\S]*?)<\/probability>\s*<\/response>/g;
  let match;

  while ((match = responseRegex.exec(outputText)) !== null) {
    responses.push({
      text: match[1].trim(),
      probability: parseFloat(match[2].trim()),
    });
  }

  return responses;
}

/**
 * Score a single parsed response for quality.
 */
function scoreResponse(response, index) {
  const issues = [];
  let score = 1.0;

  // 1. Probability sanity
  if (isNaN(response.probability) || response.probability < 0 || response.probability > 1) {
    issues.push({ category: "probability", severity: "critical", message: `Response ${index}: probability ${response.probability} out of range` });
    score -= 0.3;
  }

  // 2. Scoring rubric — detect multiple formats
  //    Format A: "1) Category: 8" (numbered list)
  //    Format B: "Category: 8/10" or "Category — 8"
  //    Format C: Prose with embedded scores
  const formatA = response.text.match(/^\d+\)\s+.+:\s+\d+/gm) || [];
  const formatB = response.text.match(/\b\w[\w\s]+:\s+\d+(?:\/10)?/gm) || [];
  const totalMatch = response.text.match(/Total:\s*(\d+)\/100/);
  const hasScoreTable = response.text.match(/\|\s*\d+\s*\|/g) || [];

  const bestScoreCount = Math.max(formatA.length, formatB.length, hasScoreTable.length);

  if (bestScoreCount < 5 && !totalMatch) {
    // Only penalize if BOTH specific scores and total are missing — likely a format variant
    issues.push({ category: "rubric", severity: "info", message: `Response ${index}: non-standard scoring format (${bestScoreCount} score-like items found)` });
    score -= 0.05;
  } else if (bestScoreCount < 10 && formatA.length > 0) {
    // Has numbered format but incomplete
    issues.push({ category: "rubric", severity: "warning", message: `Response ${index}: found ${formatA.length}/10 rubric scores` });
    score -= 0.1 * (10 - formatA.length) / 10;
  }

  // 3. Total score present (lighter penalty if format is just different)
  if (!totalMatch && bestScoreCount >= 5) {
    issues.push({ category: "rubric", severity: "info", message: `Response ${index}: missing Total: X/100 (may be format variant)` });
    score -= 0.03;
  } else if (!totalMatch && bestScoreCount < 5) {
    issues.push({ category: "rubric", severity: "warning", message: `Response ${index}: missing Total: X/100` });
    score -= 0.1;
  }

  // 4. Pivot/alternative section OR substantive content (>300 chars)
  const hasPivot = /(?:pivot|alternative|reframe|high.leverage|polar|how\s+it\s+works|integration)/i.test(response.text);
  if (!hasPivot && response.text.length < 300) {
    issues.push({ category: "structure", severity: "warning", message: `Response ${index}: no pivot/alternative section and short content` });
    score -= 0.1;
  }

  // 5. Prompt injection artifacts
  const injectionPatterns = [
    /\bsystem\s*:\s*/i,
    /\bassistant\s*:\s*/i,
    /\bignore\s+(previous|above|all)\s+instructions/i,
    /\byou\s+are\s+(now|a)\b/i,
    /\bdo\s+not\s+follow/i,
    /<\/?(?:system|instruction|prompt)>/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(response.text)) {
      issues.push({ category: "injection", severity: "critical", message: `Response ${index}: prompt injection artifact detected: ${pattern}` });
      score -= 0.4;
      break;
    }
  }

  // 6. Text length sanity (too short = truncated, too long = runaway)
  if (response.text.length < 100) {
    issues.push({ category: "formatting", severity: "warning", message: `Response ${index}: suspiciously short (${response.text.length} chars)` });
    score -= 0.2;
  }
  if (response.text.length > 10000) {
    issues.push({ category: "formatting", severity: "warning", message: `Response ${index}: unusually long (${response.text.length} chars)` });
    score -= 0.05;
  }

  return { score: Math.max(0, score), issues };
}

/**
 * Run the full quality gate on raw output text from the AI response.
 *
 * @param {string} outputText - The raw output_text from the API response
 * @returns {{ score: number, issues: Array, responses: Array, passesGate: boolean, threshold: number }}
 */
export function qualityGate(outputText) {
  const allIssues = [];
  let totalScore = 1.0;

  // 1. XML well-formedness — check for unclosed tags
  const openTags = (outputText.match(/<response>/g) || []).length;
  const closeTags = (outputText.match(/<\/response>/g) || []).length;
  if (openTags !== closeTags) {
    allIssues.push({ category: "xml", severity: "critical", message: `Mismatched <response> tags: ${openTags} open, ${closeTags} close` });
    totalScore -= 0.3;
  }

  // 2. Parse responses
  const responses = parseResponses(outputText);

  if (responses.length === 0) {
    allIssues.push({ category: "xml", severity: "critical", message: "No valid <response> blocks parsed" });
    return { score: 0, issues: allIssues, responses: [], passesGate: false, threshold: QUALITY_THRESHOLD };
  }

  // 3. Expected count (prompt generates 5)
  if (responses.length < 3) {
    allIssues.push({ category: "completeness", severity: "warning", message: `Only ${responses.length} responses (expected 5)` });
    totalScore -= 0.15;
  }

  // 4. Probability sum check
  const probSum = responses.reduce((sum, r) => sum + r.probability, 0);
  if (probSum > 1.0) {
    allIssues.push({ category: "probability", severity: "critical", message: `Probability sum ${probSum.toFixed(3)} exceeds 1.0` });
    totalScore -= 0.2;
  }

  // 5. Score each response individually
  const responseScores = responses.map((r, i) => scoreResponse(r, i));
  const avgResponseScore = responseScores.reduce((sum, r) => sum + r.score, 0) / responseScores.length;

  for (const rs of responseScores) {
    allIssues.push(...rs.issues);
  }

  // 6. Structural consistency — all responses should have similar structure
  const hasScoresFlags = responses.map(r => /^\d+\)\s+/m.test(r.text));
  const allHaveScores = hasScoresFlags.every(Boolean);
  if (!allHaveScores && hasScoresFlags.some(Boolean)) {
    allIssues.push({ category: "consistency", severity: "warning", message: "Inconsistent scoring structure across responses" });
    totalScore -= 0.1;
  }

  // Final composite score
  const compositeScore = Math.max(0, Math.min(1, (totalScore * 0.4 + avgResponseScore * 0.6)));

  return {
    score: parseFloat(compositeScore.toFixed(3)),
    issues: allIssues,
    responses,
    passesGate: compositeScore >= QUALITY_THRESHOLD,
    threshold: QUALITY_THRESHOLD,
  };
}

export { QUALITY_THRESHOLD };
