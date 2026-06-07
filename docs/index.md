---
layout: home

hero:
  name: Proofmark
  text: Production-shaped dev data
  tagline: >-
    PII-safe by proof, not promise. Pull a small Postgres sample, mask detected
    PII locally, and generate a dry-run proof certificate before anything is
    copied into development.
  actions:
    - theme: brand
      text: Roadmap to npm
      link: /roadmap
    - theme: alt
      text: How masking works
      link: /solution
    - theme: alt
      text: GitHub
      link: https://github.com/watthem/proofmark
    - theme: alt
      text: Stakeholder deck
      link: https://github.com/watthem/proofmark/blob/main/DECK.md

features:
  - title: Deterministic by design
    details: >-
      HMAC-keyed masking means the same input always maps to the same output
      across every table — referential integrity without storing a real-to-fake
      lookup table.
  - title: Transparent evidence
    details: >-
      Every dry run prints the field, strategy, original sample, masked value,
      and certificate status.
  - title: Local-first and read-only
    details: >-
      Dry runs sample the source database read-only. Production data and
      credentials never leave your environment.
  - title: Fails closed
    details: >-
      Without a workspace seed, masking refuses to run. Demo evidence is
      explicit only through --demo.
---

## What this is

Proofmark is a local-first CLI for Prisma + Postgres teams. It reads your
Prisma schema, samples Postgres read-only, masks configured fields with
HMAC-keyed deterministic fake data, and prints a dry-run proof certificate.

The supported path today is **Prisma + Postgres, dry-run**. Write/seed mode is
planned, not shipped — see the [Roadmap to npm](/roadmap) for what is shipped,
in progress, and planned.

## Quick start

```bash
npm install
npm run cli -- --help
npm run cli -- pull --dry-run --demo
```

For the full walkthrough against a real Prisma/Postgres database, see the
[example project](https://github.com/watthem/proofmark/tree/main/examples/prisma-postgres).

For the forwarding narrative, use the
[stakeholder deck](https://github.com/watthem/proofmark/blob/main/DECK.md).
