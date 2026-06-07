# Proofmark Deck

This is the public stakeholder deck in Markdown. It is meant for forwarded
emails, founder conversations, design reviews, and early design-partner calls.

Keep this file MECE and DRY:

- **MECE**: each slide has one job. Problem, buyer, product, proof, status, and
  ask should not blur together.
- **DRY**: this deck states the story. It links to the README, docs, roadmap,
  and example instead of repeating implementation detail.

## Slide 1 - The Mark

**Proofmark**

Production-shaped dev data. PII-safe by proof, not promise.

Proofmark is a local-first CLI for Next.js, Prisma, and Postgres teams. It
pulls a small production-shaped sample, masks detected PII locally, and emits a
dry-run proof certificate before anything is copied into development.

## Slide 2 - The Problem

Developers need data that behaves like production. Toy seed files miss the edge
cases that break real workflows.

Copying production data solves the realism problem, but creates a privacy
problem. Teams end up choosing between brittle anonymization scripts, fake data
that does not test the app, or heavyweight privacy tooling that is not built for
local development.

## Slide 3 - The Buyer

The first wedge is small on purpose:

- Next.js, React, or TypeScript product teams.
- Prisma schema.
- Postgres source database.
- Local development, preview, or QA workflows.
- Teams that need believable user, account, billing, scheduling, or support
  records without carrying real identifiers.

Not the first wedge:

- Enterprise governance suites.
- Statistical privacy for published research datasets.
- General data cataloging.
- Multi-database sync.
- AI-generated synthetic data platforms.

## Slide 4 - The Product

Proofmark turns a risky production copy into an inspectable dry run.

1. Inspect the Prisma schema.
2. Sample configured Postgres fields read-only.
3. Mask likely PII with deterministic, HMAC-keyed fake values.
4. Preserve referential integrity without storing a real-to-fake lookup table.
5. Emit evidence rows and a Proofmark Certificate.

Today the supported path is dry-run only. Write/seed mode is planned, not
shipped.

## Slide 5 - The Proof Artifact

The Proofmark Certificate is the product object that stakeholders can trust,
forward, and inspect.

It should answer:

- What source/schema was inspected?
- Which fields were sampled?
- Which masking strategy ran?
- What did the before/after evidence look like?
- Did the run pass or fail?
- When was the report generated?

The claim is not "trust our masking." The claim is "read the proof."

## Slide 6 - Why It Is Different

Proofmark is built around evidence instead of vague safety language.

- **Local-first**: source data and credentials stay in the user's environment.
- **Read-only dry runs**: the current path does not write to source or target.
- **Deterministic masking**: the same input maps to the same fake value within
  the same seed.
- **No lookup table**: Proofmark does not store real-to-fake mappings.
- **Fails closed**: masking refuses to run without a workspace seed.
- **Narrow stack**: Prisma + Postgres first, because a true wedge beats a broad
  promise.

## Slide 7 - Current State

Shipped:

- Prisma schema discovery and masking-rule inference.
- Read-only Postgres sampling.
- Deterministic HMAC-keyed masking.
- CLI dry-run evidence output.
- Proofmark Certificate state.
- Runnable Prisma/Postgres example.

Planned:

- Published npm package for `npx proofmark`.
- Public demo route with real dry-run evidence.
- Write/seed mode after the dry-run path is trusted.
- Additional adapters after Prisma/Postgres proves useful.

Canonical status: [docs/roadmap.md](docs/roadmap.md)

## Slide 8 - The Ask

Bring one messy table.

The best early Proofmark conversation starts with a schema and a table that
makes local testing painful. A good dry run should prove the app still behaves
like production without keeping the real identifiers.

Try it:

- Demo dry run: `npm run cli -- pull --dry-run --demo`
- Real example: [examples/prisma-postgres](examples/prisma-postgres/README.md)
- Technical model: [docs/solution.md](docs/solution.md)

## Source Of Truth Map

Use one file for each job:

- [README.md](README.md): install, quick start, current supported path.
- [docs/index.md](docs/index.md): public docs landing page.
- [docs/solution.md](docs/solution.md): masking algorithm and security model.
- [docs/roadmap.md](docs/roadmap.md): shipped, in progress, planned.
- [examples/prisma-postgres](examples/prisma-postgres/README.md): runnable
  proof path.
- `DECK.md`: stakeholder narrative and forwarding copy.

Private market notes, customer discovery, pricing, and fundraising material
belong in the Proofmark vault, not this public repo.
