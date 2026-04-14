---
description: Decompose a project phase or feature brief into structured sprints with features, acceptance criteria, and definition of done.
---

# Sprint Planning

This command invokes the **sprint-planner** agent to expand a phase description
or feature brief into a structured sprint plan.

## What This Command Does

1. **Read current phase status** from requirements.md and memories
2. **Decompose into sprints** — Must-Have (Sprint 1), Should-Have (Sprint 2), Nice-to-Have (Sprint 3+)
3. **Define features** with acceptance criteria and file-level scope
4. **Map dependencies** between features
5. **Set definition of done** for the overall sprint plan

## When to Use

Use `/sprint-plan` when:
- Starting a new phase and need to break it into deliverable chunks
- Prioritizing work within an in-progress phase
- Planning what "done" looks like for a milestone
- Need to communicate scope to collaborators

## Example Usage

```
User: /sprint-plan Phase 2 — Browser Extension Sidebar MVP

Agent:
# Sprint Plan: Browser Extension Sidebar MVP

> Decomposed from: "Phase 2 — Browser Extension Sidebar MVP"

## Goal
Deliver a functional sidebar UI that connects to the local backend, allowing
users to browse their prompt library, compose new prompts, and copy them to
AI chat interfaces.

## Features (prioritized)

### Must-Have (Sprint 1)
1. **Prompts Tab — Library View**
   - Description: List all prompts from backend with search/filter
   - Acceptance Criteria:
     - [ ] Fetches prompts from GET /api/v1/prompts on tab open
     - [ ] Search filters by title and content
     - [ ] Click-to-copy puts prompt text on clipboard
   - Files: browser-ext/components/PromptsTab.tsx, browser-ext/lib/api.ts
   - Complexity: Medium
...
```

## Flow

```
/sprint-plan → sprint plan → /capability (per feature) → /plan → /tdd → code
```

## Related

- `/capability` — Deep-dive a single feature into a capability plan
- `/plan` — Create implementation plan for a specific feature
- `agents/sprint-planner.yaml` — Agent definition
