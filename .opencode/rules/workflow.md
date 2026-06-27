# Development Workflow

## Source of Truth

- **`docs/roadmap.md`** is the authoritative epic/feature register: the
  [Status Summary](../../docs/roadmap.md#status-summary) table + per-feature
  `- [ ]` / `- [x]` checkboxes. Check it before starting any work.
- Requirements live in `docs/prds/*.prd.md`; implementation plans in
  `docs/plans/*.plan.md`; TDD specs in `docs/testing/*.tdd.md`.
- The old `sprint_plan_current.md` + `/sprint-status` system has been removed —
  do not recreate it.

## Pipeline

```
brainstorm → plan → implement (TDD) → review → verify → finish → status
```

Each stage is a **superpowers skill** (loaded via the skill tool), not a
slash-command:

| Stage      | Skill                              | Output                                             |
| ---------- | ---------------------------------- | -------------------------------------------------- |
| brainstorm | `brainstorming`                    | PRD drafted to `docs/prds/{name}.prd.md`            |
| plan       | `writing-plans`                    | Task-by-task plan in `docs/plans/{name}.plan.md`    |
| implement  | `subagent-driven-development` _(same session)_ or `executing-plans` _(parallel session)_ | One commit per task, TDD (RED → GREEN → REFACTOR) |
| review     | `requesting-code-review`           | Per-task + final whole-branch review                |
| verify     | (this file — the gate below)       | Green suites + lint + build                         |
| finish     | `finishing-a-development-branch`   | Merge / PR / keep                                   |
| status     | (manual roadmap edit — see below)  | `- [x]` tick + Status Summary update                |

**Never code without a confirmed plan.** `brainstorming` and `writing-plans`
both require explicit user approval before any implementation begins.

## Verify Gate (must pass before status is mutated)

Run from repo root (`just` required):

- `just test` — both suites: API (`pytest`) + Extension (vitest)
- `just lint` — `tsc --noEmit` (ext) + `ruff check .` (api); **0 new ruff errors**
- `just build` — API (PyInstaller → `api/dist/l1br3`) + Chrome ext (emits
  `admin.html` + `sidepanel.html`)
- `cd api && uv run mypy app` — `--strict` clean (runs in pre-commit; `just lint`
  does not include it)
- `pre-commit run --all-files` — mypy --strict, eslint, prettier, ruff
  fix+format, detect-secrets

> `pre-commit` must be installed (`pre-commit install`) and its config valid.
> Note: `.pre-commit-config.yaml` currently has an invalid `yml` type tag that
> blocks `pre-commit run` — fix the config before relying on the hook.

Full Definition of Done: see
[docs/roadmap.md → Definition of Done](../../docs/roadmap.md#definition-of-done-per-feature).

## Status Rules

There is **no `/checkpoint` command** — status is a direct edit to
`docs/roadmap.md`, performed **only after** the verify gate passes AND the
feature's acceptance criteria are met (not just green tests):

1. Tick the feature: `- [ ]` → `- [x]`.
2. Update the [Status Summary](../../docs/roadmap.md#status-summary) `%` and
   reconcile the EPIC mark (🔵 → ✅).
3. Fill in the PRD link next to the feature if one exists.
4. Commit the roadmap change (Conventional Commit: `docs(roadmap): …`).

## Anti-Patterns

- Never code without a confirmed plan (brainstorming → writing-plans first).
- Never mark complete on green tests alone — verify acceptance criteria.
- Never skip the verify gate before ticking a feature `- [x]`.
- Never tick a roadmap checkbox for work that isn't merged to `main`.
