# Strategic Compaction

Suggest `/compact` at logical task boundaries rather than relying on arbitrary
auto-compaction, which triggers mid-task and loses critical context.

## When to Activate

- Session approaches context limits (heavy file reads, long debugging traces)
- Working on multi-phase tasks (research -> plan -> implement -> test)
- Switching between unrelated work (backend vs. frontend, Phase 2 vs. Phase 5)
- After completing a major milestone (feature done, tests passing, PR ready)
- After a failed approach is abandoned

## Compaction Decision Matrix

| Transition | Compact? | Why |
|---|---|---|
| Research -> Planning | Yes | Research is bulky; plan is the output |
| Planning -> Implementation | Yes | Plan is in file; free up context |
| Implementation -> Testing | Maybe | Keep if tests reference recent code changes |
| Debugging -> Next feature | Yes | Debug traces pollute context |
| Mid-implementation | No | Losing variable names and file state is costly |
| After failed approach | Yes | Clear dead-end reasoning |
| Backend work -> Frontend work | Yes | Different file sets, different patterns |
| Phase 2 work -> Phase 5 work | Yes | Completely different domains |

## What Survives Compaction

- CLAUDE.md instructions and .claude/ rules
- Task list (if using tasks)
- Memory files (~/.claude/memory/)
- Git state and files on disk
- requirements.md and phase status

## What Gets Lost

- Intermediate reasoning and exploration
- File contents previously read (must re-read)
- Tool call history
- Nuanced preferences stated verbally (save to memory first)

## Best Practices

1. **Write before compacting** — save plans, decisions, or findings to files before compacting
2. **Compact after planning** — once the plan is written to a file or task list
3. **Compact after debugging** — debug traces are the noisiest context
4. **Don't compact mid-implementation** — losing file context mid-edit is expensive
5. **Use `/compact` with a summary** — e.g., `/compact Finished Phase 2 sidebar wiring, moving to Phase 5 sync`
6. **Save to memory** — if a preference or decision should persist across sessions, save it before compacting

## How to Suggest

When context is getting heavy, suggest compaction to the user:

> "We've completed the planning phase and the plan is saved. This is a good
> point to `/compact` before starting implementation — it will free up context
> for the code changes ahead."

Never compact automatically. Always suggest and let the user decide.
