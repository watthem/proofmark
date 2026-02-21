#!/usr/bin/env node
/**
 * Proofmark Sunday Night Release Script
 *
 * Standard workflow: runs every Sunday night before publish.
 * 1. Run all tests (gate + schema + adversarial)
 * 2. Verify package.json is correct
 * 3. Bump version (patch by default)
 * 4. Print publish command (doesn't auto-publish — manual confirmation)
 *
 * Usage:
 *   node scripts/release.mjs              # patch bump (0.1.0 → 0.1.1)
 *   node scripts/release.mjs minor        # minor bump (0.1.0 → 0.2.0)
 *   node scripts/release.mjs major        # major bump (0.1.0 → 1.0.0)
 *   node scripts/release.mjs --dry-run    # show what would happen
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PKG_PATH = join(ROOT, "package.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bumpType = args.find(a => ["patch", "minor", "major"].includes(a)) || "patch";

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  if (dryRun && !opts.alwaysRun) {
    console.log("  (dry-run: skipped)");
    return "";
  }
  return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" });
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    default: return `${major}.${minor}.${patch + 1}`;
  }
}

console.log(`\n=== Proofmark Release (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);
console.log(`Bump type: ${bumpType}`);

// Step 1: Run tests
console.log("\n--- Step 1: Run tests ---");
try {
  const testOutput = run("node --test src/*.test.mjs", { alwaysRun: true });
  const testLines = testOutput.split("\n").filter(l => l.includes("pass") || l.includes("fail"));
  console.log(`  Tests: ${testLines.length > 0 ? testLines[testLines.length - 1].trim() : "passed"}`);
} catch (err) {
  console.error("  TESTS FAILED — aborting release");
  console.error(err.stdout || err.message);
  process.exit(1);
}

// Step 2: Run adversarial suite
console.log("\n--- Step 2: Adversarial suite ---");
try {
  const advOutput = run("node scripts/codex-adversarial.mjs", { alwaysRun: true });
  const crashLine = advOutput.split("\n").find(l => l.includes("Results:"));
  console.log(`  ${crashLine?.trim() || "Completed"}`);
  if (/\d+ CRASH/.test(advOutput) && !advOutput.includes("0 CRASH")) {
    console.error("  ADVERSARIAL CRASHES FOUND — aborting release");
    process.exit(1);
  }
} catch (err) {
  console.error("  Adversarial suite failed — aborting");
  process.exit(1);
}

// Step 3: Bump version
console.log("\n--- Step 3: Version bump ---");
const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpType);
console.log(`  ${oldVersion} → ${newVersion}`);

if (!dryRun) {
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
  console.log("  Updated package.json");
}

// Step 4: Git tag
console.log("\n--- Step 4: Git operations ---");
if (!dryRun) {
  run(`git add package.json`);
  console.log("  Staged package.json");
} else {
  console.log("  Would stage package.json and create tag v" + newVersion);
}

// Step 5: Print publish commands
console.log("\n--- Ready to publish ---");
console.log(`\nRun these commands to complete the release:\n`);
console.log(`  git commit -m "release: v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  npm publish --access public`);
console.log(`  git push && git push --tags`);
console.log(`\nVersion: ${newVersion}`);
console.log(`Package: ${pkg.name}`);
console.log(`Homepage: ${pkg.homepage}`);
