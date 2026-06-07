# Roadmap to npm

This is the **product** roadmap: what ships, in what order, on the way to a
published `npm` package you can run with `npx proofmark`. It covers shipped
behavior and planned work only — it makes no claims about features that don't
exist yet.

Status legend:

- ✅ **Shipped** — available today on `main`.
- 🚧 **In progress** — partially built, not yet complete.
- 🔭 **Planned** — designed, not yet built.

> Today Proofmark runs from a clone (`npm run cli -- ...`). The headline goal of
> this roadmap is the first published release: `npx proofmark` with no clone.

## Now — Alpha (Prisma + Postgres, dry-run)

The current supported path. All of this works today.

| Capability | Status |
|---|---|
| Prisma schema discovery and masking-rule inference | ✅ Shipped |
| Read-only Postgres sampling | ✅ Shipped |
| HMAC-keyed deterministic masking (fails closed without a workspace seed) | ✅ Shipped |
| CLI evidence output with a Proofmark Certificate | ✅ Shipped |
| `init` generates `proofmark.json` + a gitignored `PROOFMARK_WORKSEED` | ✅ Shipped |
| Runnable example Prisma/Postgres project | ✅ Shipped |

Masking is deterministic, transparent, and stateless — no real-to-fake values
are ever stored. See [How masking works](/solution) for the algorithm and the
security model, including what a leaked seed does and does not expose.

## Next — First npm release

The work that turns "clone and run" into "install and run."

| Milestone | Status | Notes |
|---|---|---|
| Publish CLI to npm so `npx proofmark` works without cloning | 🔭 Planned | The dry run today is local; this is the gate to public install. |
| Public demo route that renders **real** dry-run evidence (not mocked) | 🚧 In progress | Example project shipped; the public demo route is still deferred. |
| Quickstart and CLI reference docs on proofmark.dev/docs | 🚧 In progress | This docs site. |

### What "ready for npm" means

A release is publishable when:

1. `npx proofmark init` → `pull --dry-run` works against a real Prisma/Postgres
   database from a clean machine.
2. A non-demo dry run with no resolvable `PROOFMARK_WORKSEED` exits non-zero
   with a clear error (fails closed).
3. `npm pack --dry-run` ships only the CLI surface — no internal tooling,
   planning notes, or experimental dashboard code.
4. README and docs describe only shipped behavior, with planned items clearly
   marked.

## Later — After v1

Larger capabilities that extend Proofmark beyond a read-only dry run. These are
designed, not built — they are not promised in any current release.

| Capability | Status | Notes |
|---|---|---|
| Write/seed mode — load masked sample data into a local or target database | 🔭 Planned | Today's path is dry-run only; nothing is written to source or target. |
| Additional schema adapters beyond Prisma | 🔭 Planned | The dry-run sampler is Prisma-only today. |
| Additional source databases beyond Postgres | 🔭 Planned | |
| Plugin API for custom maskers | 🔭 Planned | Documented as planned in [How masking works](/solution); not yet implemented. |

## Out of scope here

Go-to-market plans, launch sequencing, pricing, and funding are tracked
privately, not in this repo or on this site. This page stays focused on the
product.

## Want to influence this?

Open an issue or start a discussion on
[GitHub](https://github.com/watthem/proofmark). The most useful contribution
right now: bring a messy table that makes local testing painful, and a dry run
should prove your app still works without keeping the real identifiers.
