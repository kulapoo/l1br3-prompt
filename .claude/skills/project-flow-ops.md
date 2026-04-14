# Project Flow Ops

Operate execution flow on GitHub by triaging issues and PRs, classifying work,
and keeping the backlog actionable.

## When to Use

- Triage open issue or PR backlogs
- Classify PRs: merge, rebuild, close, or park
- Audit review comments, CI failures, or stale issues
- Prioritize work across phases
- Clean up after a milestone or release

## Operating Model

- **GitHub** is the single source of truth (no Linear — this is open-source)
- Not every issue needs immediate action — park what's not scheduled
- Labels drive priority: `phase-2`, `phase-3`, `phase-5`, `bug`, `enhancement`, `good-first-issue`
- Milestones map to phases

## Core Workflow

### 1. Read the Surface

For each issue or PR, gather:
- State (open/closed/draft)
- Author and branch status
- Labels and milestone
- Review comments and CI status
- Linked issues or PRs

### 2. Classify the Work

| Classification | Meaning | Action |
|---|---|---|
| **Merge** | Self-contained, tested, policy-compliant, ready | Approve and merge |
| **Rebuild** | Useful idea, but implementation needs rework | Close with guidance, open new issue |
| **Close** | Wrong direction, stale, duplicate, or superseded | Close with explanation |
| **Park** | Potentially useful, not scheduled now | Label `parked`, remove from milestone |

### 3. Prioritize by Phase

Current priority order:
1. **Phase 2** (Sidebar UI) — in progress, highest priority
2. **Phase 5** (Cloud Sync) — in progress, second priority
3. **Phase 3** (Context Suggestions) — next up
4. Bug fixes in completed phases (1, 4, 6) — as needed

### 4. Keep State Consistent

When work ships:
- Close the issue with a reference to the commit/PR
- Update labels and milestone
- If it affects phase status, note in `.claude/memories/phase-status.md`

When work is rejected:
- Close with clear explanation of why
- If the idea has merit, open a new issue scoped correctly

## Review Rules

- Never merge from title alone — read the full diff
- CI red = investigate and fix or block; don't merge broken code
- External contributions should be rebuilt inside the project's patterns when valuable
- If a PR conflicts with the product spec (`requirements.md`), say so

## Output Format

```text
ISSUE/PR: #N — [title]

STATUS
- State: open/closed/draft
- CI: passing/failing/none
- Reviews: approved/changes-requested/none

CLASSIFICATION
- merge / rebuild / close / park
- [One-paragraph rationale]

PRIORITY
- Phase: [which phase]
- Urgency: now / next sprint / backlog

NEXT ACTION
- [Exact next step — e.g., "approve and merge", "request changes: missing tests",
  "close: superseded by #M", "label parked, remove from milestone"]
```

## Bulk Triage Template

When triaging multiple items:

```markdown
# Backlog Triage — [date]

## Summary
- Total items: N
- Merge: N
- Rebuild: N
- Close: N
- Park: N

## Items
| # | Title | Classification | Phase | Action |
|---|---|---|---|---|
| 1 | ... | merge | 2 | approve |
| 2 | ... | park | - | label parked |
```
