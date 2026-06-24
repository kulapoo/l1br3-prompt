# Contributing to l1br3-prompt

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12+ | With [UV](https://docs.astral.sh/uv/) for dependency management |
| Node.js | 20+ | With pnpm (browser extension) |
| just | latest | Task runner — [just.systems](https://just.systems) |
| pre-commit | latest | Optional but recommended |
| Ollama | latest | Optional — for local AI features |

## Quick Start

```bash
just install          # install API + extension dependencies
just install-hooks    # set up pre-commit hooks
just dev              # start API (localhost:8000) + extension dev server
```

Then load the unpacked extension in Chrome from `browser-ext/.output/chrome-mv3-dev`.

## Development Commands

| Command | What it does |
|---------|-------------|
| `just dev` | API + extension dev servers |
| `just dev-api` | API only (FastAPI on localhost:8000) |
| `just dev-ext` | Chrome extension (WXT) |
| `just dev-ext-ff` | Firefox extension (WXT) |
| `just test` | All tests (API + extension) |
| `just test-api` | pytest suite |
| `just lint` | Typecheck extension + lint API |
| `just format` | Prettier (extension) + Ruff (API) |
| `just build` | Build API + Chrome extension |
| `just clean` | Remove build artifacts |

## Development Loop

Every feature follows a gated process to prevent scope creep and ensure implementation-readiness before coding starts.

### 1. Check Status

Read the current sprint plan to see what is in-progress, blocked, or available. The sprint plan is the source of truth for feature status.

### 2. Pick a Feature

Choose the next unblocked feature from the current sprint. Features are prioritized: Sprint 1 (must-have) before Sprint 2 (should-have) before Sprint 3+ (nice-to-have).

### 3. Understand the Feature

Review or create a capability plan that covers constraints, interfaces, data shape, and open questions. This prevents mid-implementation surprises.

### 4. Plan the Implementation

Write a step-by-step implementation plan. Get confirmation from collaborators before writing any code.

### 5. Write Code (TDD)

Follow the RED-GREEN-REFACTOR cycle:
- **RED** — write a failing test that captures the requirement
- **GREEN** — write the minimum code to make it pass
- **REFACTOR** — clean up while tests stay green

### 6. Verify

Run the full quality gate:

```bash
just test    # all tests pass
just lint    # typecheck + lint clean
just build   # extension builds
```

### 7. Update Status

Mark the feature as completed (with a note) once acceptance criteria are met — not just when tests are green.

## Development Workflow

This project uses a planning toolchain for agile development. Each step in the development loop maps to a command:

| Step | Command | Purpose |
|------|---------|---------|
| Check status | `/sprint-status` | Read the sprint plan (no writes) |
| Pick + mark in-flight | `/sprint-update F# in-progress` | Persist status before coding starts |
| Understand | `/capability` | Deep-dive constraints and interfaces |
| Plan | `/plan` | Step-by-step plan; waits for confirmation |
| Code | `/tdd` | Test-driven RED-GREEN-REFACTOR loop |
| Verify | `/verify` | Build + test + lint + typecheck loop |
| Update status | `/sprint-update F# completed "note"` | Persist completion after acceptance criteria met |

Additional commands:
- `/sprint-plan` — decompose a phase into sprints with features and acceptance criteria
- `/pr-review` — code review for local changes or a GitHub PR

## Testing

- **API**: `just test-api` — pytest covering routes, services, and repositories
- **Extension**: `just test-ext` — vitest (jsdom)

## Code Style

The project follows language-specific conventions. Pre-commit hooks handle formatting automatically (Ruff for Python, Prettier for TypeScript). Run `just format` to format manually.

## Project Structure

See [CLAUDE.md](CLAUDE.md) for the full repository layout, architecture details, and phase status.
