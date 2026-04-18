# Development Workflow

## Pipeline

```
/sprint-plan  →  /capability  →  /plan  →  /tdd  →  /verify  →  /sprint-update
  (phases)       (features)     (steps)    (code)   (quality)    (persist status)
```

## Source of Truth

- The sprint plan is authoritative; check it before starting any work (`/sprint-status`)
- `/sprint-update` is the ONLY sanctioned way to mutate feature statuses
- Do not hand-edit `sprint_plan_current.md` for status changes

## Status Rules

- `in-progress`: mark BEFORE starting any coding on a feature
- `completed`: mark ONLY after acceptance criteria are met (not just green tests)
- `blocked`: always requires a reason
- `not-started`: use to walk back a premature status

## Gated Process

1. `/capability` — nail down constraints and interfaces before coding
2. `/plan` — create implementation plan; WAIT for user confirmation before writing code
3. `/tdd` — RED-GREEN-REFACTOR cycle during implementation
4. `/verify` — build + test + lint + typecheck must all pass
5. `/sprint-update` — persist status after verify passes AND acceptance criteria are met

## Anti-Patterns

- Never code without a confirmed plan
- Never mark complete on green tests alone — verify acceptance criteria
- Never skip `/verify` before marking complete
- Never edit sprint plan statuses outside of `/sprint-update`
