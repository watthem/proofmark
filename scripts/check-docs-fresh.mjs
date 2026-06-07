#!/usr/bin/env node
// Drift guard: rebuild the VitePress docs and fail if the committed site/docs
// output no longer matches the docs source. Because the Cloudflare deploy serves
// ./site directly (no build step), site/docs is checked in — this prevents the
// public docs at proofmark.dev/docs from silently going stale.
import { execSync } from 'node:child_process'

function git(args) {
  return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

console.log('Rebuilding docs to verify site/docs is in sync...')
try {
  execSync('npm run docs:build', { stdio: 'inherit' })
} catch {
  console.error('\n✗ docs build failed — fix the build before shipping.')
  process.exit(1)
}

const dirty = git('status --porcelain -- site/docs').trim()
if (dirty) {
  console.error('\n✗ site/docs is out of date with the docs source.')
  console.error('  The rebuild above regenerated it. Commit the result and retry:')
  console.error('    git add site/docs && git commit -m "docs: rebuild site/docs"')
  console.error('\n  Changed:')
  console.error(dirty)
  process.exit(1)
}

console.log('✓ site/docs is in sync with the docs source.')
