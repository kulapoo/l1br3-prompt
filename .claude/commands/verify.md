---
description: Legacy slash-entry shim for the verification-loop skill. Prefer the skill directly.
---

# Verification Command (Legacy Shim)

Use this only if you still invoke `/verify`. The maintained workflow lives in `skills/verification-loop/SKILL.md`.

## Canonical Surface

- Prefer the `verification-loop` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments

`$ARGUMENTS`

## Delegation

Apply the `verification-loop` skill.
- Choose the right verification depth for the user's requested mode.
- Run build, types, lint, tests, security/log checks, and diff review in the right order for the current repo.
- Report only the verdicts and blockers instead of maintaining a second verification checklist here.

## Post-Verify Handoff

When `/verify` passes on work that maps to a feature in `sprint_plan_current.md`:

- Confirm the feature's acceptance criteria are all met (not just tests green).
- Suggest the user run `/sprint-update <F#> completed [note]` to close the loop in the sprint plan.
- Do not silently edit `sprint_plan_current.md` — always route status changes through `/sprint-update`.
