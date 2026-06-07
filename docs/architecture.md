---
title: Proofmark architecture
description: A contributor overview of Proofmark's local-first dry-run architecture, CLI, Prisma introspection, Postgres sampling, masking, and evidence flow.
---

# Architecture

Proofmark is currently organized around a local-first dry-run path.

## Design Principles

- Source database sampling is read-only during dry runs.
- Production data and credentials stay in the user's environment.
- Demo evidence must be explicit, never silent fallback for real workflows.
- The CLI owns developer workflow; the dashboard visualizes evidence state.
- Business strategy lives outside the repo.

## Components

| Area | Files | Responsibility |
| --- | --- | --- |
| CLI | `bin/cli.ts`, `src/commands/*` | Command parsing, project init, dry-run output |
| Config | `src/config/load.ts`, `src/config/types.ts` | `proofmark.json` loading and validation |
| Introspection | `src/introspection/prismaAdapter.ts` | Prisma schema parsing and rule inference |
| Sampling | `src/sync/postgresSampler.ts` | Read-only Postgres sampling for configured fields |
| Masking | `src/sync/masking.ts` | Deterministic local replacement values |
| Evidence | `src/sync/evidence.ts`, `src/sync/dashboardData.ts` | Shared dry-run rows, certificates, dashboard data |
| Dashboard | `app/server/syncDashboard.ts`, `app/routes/*` | TanStack Start server function and UI |

## Current Stack Choices

| Choice | Reason |
| --- | --- |
| TypeScript CLI | Shared types with dashboard and strict local checks. |
| Prisma-first introspection | Narrow target stack and schema metadata is available locally. |
| Postgres-first sampling | Common target database and supported by `pg`. |
| `pg` pool | Small direct dependency for read-only SQL queries. |
| TanStack Start dashboard | Existing app surface with server functions and React Router integration. |
| Deterministic masks | Stable output makes CLI reports, screenshots, and tests reproducible. |

## Dry-Run Flow

1. Load `proofmark.json`.
2. Resolve `process.env.*` source URL references.
3. Parse the configured Prisma schema.
4. Map configured model fields to table and column names.
5. Build quoted SQL identifier queries.
6. Sample source rows read-only.
7. Apply local masking strategies.
8. Produce evidence rows and certificate state.
9. Print CLI report or render dashboard state.

## Security Notes

- SQL values are parameterized where values are used.
- Table and column identifiers are derived from config/schema and quoted before
  interpolation.
- Source URLs are resolved for connection use but not printed.
- `--demo` is explicit; missing config fails the CLI dry run.
- The dashboard renders an unconfigured state when no project config exists.
