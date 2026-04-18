Read the current sprint plan from `.claude/memories/sprint_plan_current.md` in the project root.

Then provide a concise status report:

1. **Current sprint** — which sprint are we in (1, 2, or 3)?
2. **Feature status table** — all features with their status (not started / in progress / completed)
3. **Next up** — which feature(s) are unblocked and ready to start?
4. **Blockers** — anything blocking progress?

Keep it short. If the user wants to start work on a feature, suggest running `/capability` on that feature first, followed by `/sprint-update <F#> in-progress` when coding begins.

This command is read-only. To mutate feature statuses use `/sprint-update`.
