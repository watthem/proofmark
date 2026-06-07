# Proofmark

**Production-shaped dev data. PII-safe by proof, not promise.**

Proofmark is a local-first CLI for Prisma + Postgres teams. It reads your
Prisma schema, samples Postgres read-only, masks configured fields with
HMAC-keyed deterministic fake data, and prints a dry-run proof certificate
before anything is copied into development.

Everyone says "safe." Proofmark shows the evidence: every dry run prints the
field, strategy, original sample, masked value, and certificate status.

## Status

Alpha. The supported path today is **Prisma + Postgres, dry-run**:

- Prisma schema discovery and masking-rule inference
- read-only Postgres sampling
- HMAC-keyed deterministic masking (fails closed without a workspace seed)
- CLI evidence output with a Proofmark Certificate

Write/seed mode is planned, not shipped. Requires Node >= 20.6.

## Quick Start

```bash
npm install
npm run cli -- --help
npm run cli -- pull --dry-run --demo
```

## Example Project

Run against a real Prisma/Postgres database without wiring Proofmark into an
existing app:

```bash
npm run build:cli
cd examples/prisma-postgres
cp .env.example .env
docker compose up -d --wait
node ../../dist/cli/bin/cli.js pull --dry-run
```

See [examples/prisma-postgres](examples/prisma-postgres/README.md) for the full
walkthrough.

## Use It In Your Project

Generate `proofmark.json` from your schema:

```bash
npm run cli -- init --schema ./prisma/schema.prisma
```

`init` also writes a `PROOFMARK_WORKSEED` to `.env` (gitignored) — the HMAC key
that makes masking deterministic. Set the database environment variables
referenced in `proofmark.json`, then:

```bash
npm run cli -- pull --dry-run
```

The dry run is read-only against the source database. Demo evidence is explicit
only through `--demo` or `PROOFMARK_DEMO=1`.

## Coming from Snaplet or Neosync?

Both shut down — [Snaplet](https://www.snaplet.dev/post/snaplet-is-shutting-down)
in 2024 and [Neosync](https://github.com/nucleuscloud/neosync) archived in 2025 —
and teams still need production-shaped local data without the PII.

Proofmark is built for the same job, with a narrower, honest scope today:

- **Like them:** deterministic, referentially-consistent masking — the same input
  maps to the same fake value across tables, so foreign keys don't break.
- **Different:** stateless by design (no real-to-fake lookup table to leak), and
  every run emits a proof certificate you can read.
- **Not yet:** Proofmark is dry-run only right now — it shows what it *would*
  write. Write/seed mode is on the [roadmap](docs/roadmap.md), not shipped.

If you used Snaplet or Neosync purely to seed a local database, Proofmark isn't a
drop-in replacement yet — but the masking core is here, and seeding is next.

## How Masking Works

Masking is deterministic, transparent, and stateless — no real-to-fake values are
ever stored. See [docs/solution.md](docs/solution.md) for the full algorithm and
security model, including what a leaked seed does and does not expose.

## Docs

- [Stakeholder deck](DECK.md)
- [How masking works](docs/solution.md)
- [Roadmap to npm](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Contributing](docs/contributing.md)

## Experimental

An optional TanStack Start dashboard visualizes evidence state. It is a prototype
(currently sample data) and is not part of the CLI workflow:

```bash
npm run dashboard:dev
```

## Verification

```bash
npm run check
npm test
```
