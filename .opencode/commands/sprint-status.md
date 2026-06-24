---
description: Show a concise sprint overview of roadmap progress
---

# Sprint Status

Read the master roadmap and report a concise snapshot of where the project stands.

## Your Task

1. Read `docs/roadmap.md` (the EPIC register and feature checklists).
2. Produce a concise status report — no reformatting of the roadmap, just a summary.

## Report Format

Keep it tight. Use this structure:

### Status Summary

A compact table mirroring the Status Summary table from the roadmap (Epic, Title,
Status, Completion). Then add:

### Next Up

The first 3-5 pending features (`[ ]`) by dependency readiness, taken from the
"PRD Backlog" section. For each, one line: `F## — <name> (<depends on>)`.

### In Progress

Any feature marked 🔵 / in-progress, with a one-line note on what remains.

## Rules

- **Do not edit any files.** This is read-only.
- **Do not restate the full roadmap.** Summarize only.
- If a referenced file (`docs/prds/*.prd.md`) is mentioned for a pending feature,
  you don't need to open it — just note it exists.

---

**TIP**: Run `/sprint-status` before `/plan` to confirm which feature is next.
