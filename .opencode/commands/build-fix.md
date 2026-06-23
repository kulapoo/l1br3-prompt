---
description: Fix build, type, and lint errors across API, extension, and worker with minimal changes
subtask: true
agent: build
---

# Build Fix Command

Fix build, type, and lint errors with minimal changes: $ARGUMENTS

This project has three independent stacks. First **detect which one(s) are failing**, then apply stack-specific fixes.

## Stack Map

| Stack | Path | Build | Type/Lint Check | Tests |
|-------|------|-------|-----------------|-------|
| Python API | `api/` | `just build-api` | `cd api && uv run ruff check .` | `just test-api` |
| Browser extension (TS) | `browser-ext/` | `just build-ext` | `cd browser-ext && npm run compile` | `just test-ext` |
| Cloudflare Worker (TS) | `workers/cloud-ai/` | — | `cd workers/cloud-ai && pnpm tsc --noEmit` | `just test-worker` |

Or run everything at once: `just lint`, `just test`, `just build`.

## Your Task

1. **Detect the failure scope**
   - If `$ARGUMENTS` names a path/file, target that stack only.
   - Otherwise run `just lint` then `just build` and collect all errors across stacks.
2. **Collect all errors** per stack (do not mix fixes across stacks).
3. **Fix errors one by one** with minimal changes, running the stack-specific check after each fix.
4. **Verify each fix** doesn't introduce new errors in the same stack.
5. **Run final check** (`just lint && just test && just build`) to confirm everything is green.

## Approach

### DO
- PASS: Fix type errors with correct types
- PASS: Add missing imports
- PASS: Fix syntax errors
- PASS: Make minimal changes
- PASS: Preserve existing behavior
- PASS: Re-run the relevant stack check after each change
- PASS: Follow existing patterns in the file you are editing (Python: PEP 8 + type annotations; TS: see `.opencode/rules/typescript/coding-style.md`)

### DON'T
- FAIL: Refactor code
- FAIL: Add new features
- FAIL: Change architecture
- FAIL: Use `any` type in TS (unless absolutely necessary)
- FAIL: Add `@ts-ignore` / `# type: ignore` comments without a justified reason
- FAIL: Change business logic
- FAIL: Mix unrelated fixes into one change

## Common Error Fixes

### TypeScript (extension + worker)

| Error | Fix |
|-------|-----|
| Type 'X' is not assignable to type 'Y' | Add correct type annotation |
| Property 'X' does not exist | Add property to interface or fix property name |
| Cannot find module 'X' | Install package or fix import path |
| Argument of type 'X' is not assignable | Cast or fix function signature |
| Object is possibly 'undefined' | Add null check or optional chaining |

### Python (API)

| Error | Fix |
|-------|-----|
| `ruff F401` imported but unused | Remove the unused import |
| `ruff F811` redefinition of unused name | Rename or remove the duplicate |
| `ruff E501` line too long | Wrap the line (target 88 chars) |
| `Argument/return type` errors (mypy/pyright) | Add or correct type annotations |
| `ModuleNotFoundError` / `ImportError` | Fix import path or run `uv sync` |
| `undefined name` | Add missing import or define the name |

## Verification Steps

After fixes, all of these must pass:

1. `just lint` — ruff (API) + tsc (extension) clean
2. `just test` — pytest + vitest suites pass
3. `just build` — API + extension build succeeds

If only one stack was broken, still confirm the others haven't regressed.

---

**IMPORTANT**: Focus on fixing errors only. No refactoring, no improvements, no architectural changes. Get the build green with minimal diff.
