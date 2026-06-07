# Forage Workflow — Codex Instructions

This repo uses **Forage Protocol v0.1** for agent coordination.

## Start Of Work

Always read `.forage/coordination/ACT.md` first. It is the session authority for the active mission, open work, and handoff notes.

Then read:

- `.forage/config.json` — namespace, owner, enabled pipelines, stages, and repo commands
- `.forage/index/active_facts.json` — active and resolved ticket projection
- `.forage/index/tickets.json` — ticket counters and current month
- `.forage/tickets/<id>.md` — full ticket files when active work exists

## Canonical Layout

Forage v0.1 uses a ledger/index/tickets layout:

- `.forage/ledger/facts.ndjson` — append-only asserted facts
- `.forage/ledger/events.ndjson` — append-only state changes
- `.forage/index/active_facts.json` — rebuildable read model
- `.forage/index/tickets.json` — namespace, counters, current month
- `.forage/tickets/` — YAML frontmatter plus Markdown ticket bodies
- `.forage/context/tools.json` — protocol write-tool schema
- `.forage/coordination/` — ACT, SYNC, ACK, and HANDSHAKE packets

`active.json` and `items/` are present only as compatibility shims for older forage instructions.

## Pipeline

The dev pipeline stages are:

`draft -> research -> design -> build -> test -> review -> done`

Terminal stages are `done` and `blocked`.

## Skills

Use the repo-local forage skills:

- `forage`
- `forage-go`
- `forage-new`
- `forage-status`
- `forage-next`
- `forage-stage`
- `forage-ops`
- `forage-focus`
- `forage-triage`
- `forage-pr`
- `forage-end`
- `forage-feedback`
- `forage-approve`
- `forage-cleanup`

## Default Skill Policy

Always apply `child-time-primacy` for planning, scheduling, or capacity work. Child schedule is fixed infrastructure; work is the variable.
