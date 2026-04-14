---
description: Decompose a phase or feature into an implementation-ready capability plan with constraints, interfaces, and open questions.
---

# Capability Planning

This command uses the **product-capability** skill to translate a phase, feature,
or product discussion into a structured capability plan.

## What This Command Does

1. **Restate the capability** — who benefits, what changes, what outcome
2. **Resolve constraints** — business rules, scope, data ownership, lifecycle, failure modes
3. **Define implementation contract** — actors, surfaces, states, interfaces, data, security
4. **Identify open questions** — blockers that need product decisions
5. **Determine handoff** — ready for `/plan`, needs review, or needs clarification

## When to Use

Use `/capability` when:
- Starting work on a new phase (e.g., Phase 3: Context-Aware Suggestions)
- A feature touches both backend and frontend
- Requirements are clear but implementation boundaries are fuzzy
- You want to surface hidden assumptions before writing code

## Example Usage

```
User: /capability Phase 3 — context-aware suggestions based on active tab

Agent:
# Capability: Context-Aware Prompt Suggestions

## CAPABILITY
Users viewing a specific AI chat interface (ChatGPT, Claude, Gemini) receive
prompt suggestions relevant to their current context — the active site,
conversation topic, and their prompt library usage patterns.

## CONSTRAINTS
- Suggestions must work without backend (offline fallback to usage-frequency)
- Content script detection must not inject into non-AI sites
- Suggestion ranking is deterministic given the same inputs
- Maximum 5 suggestions shown at a time
...
```

## Flow

```
/capability → capability plan → /plan → implementation plan → /tdd → code
```

## Related

- `/plan` — Create implementation plan from a capability plan
- `/sprint-plan` — Decompose a phase into structured sprints
- `skills/product-capability.md` — Full skill reference
