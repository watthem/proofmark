# Contributing

## Local Workflow

```bash
npm install
npm run check
npm test
npm run dashboard:build
```

Use `rg` for search and keep changes scoped to the active task.

## CLI Checks

```bash
npm run cli -- --help
npm run cli -- pull --dry-run --demo
```

For real Postgres dry-run work, use a temporary project with `proofmark.json`
and a disposable Postgres database.

## Test Expectations

Add focused tests when changing:

- config loading
- Prisma schema parsing
- SQL construction
- masking behavior
- evidence/certificate output
- dashboard server function behavior

Run these before handing off:

```bash
npm run check
npm test
npm run dashboard:build
```

## Docs Site Freshness

The VitePress docs are built into `site/docs/`, which is committed because the
Cloudflare deploy serves `./site` directly with no build step. After editing any
source under `docs/`, rebuild and commit the output:

```bash
npm run docs:build
git add site/docs
```

`npm run docs:check` rebuilds and fails if `site/docs/` has drifted from source.
A pre-push hook runs it automatically — enable it once per clone with:

```bash
git config core.hooksPath scripts/hooks
```

## Docs Boundary

Repo docs are for contributors and maintainers. Keep private stakeholder decks,
customer discovery notes, pricing, positioning, and market strategy out of this
repo.

The root `DECK.md` is the exception: it is a public forwarding deck for the
current product story, and it should link back to canonical docs instead of
copying implementation details.

Use `/home/watthem/Vaults/projects/proofmark` for internal business material.

## Review Priorities

1. Does the change preserve local-first behavior?
2. Does dry-run remain read-only?
3. Are demo paths explicit?
4. Are source values and credentials kept out of logs?
5. Are tests scoped to the changed behavior?
