# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

l1br3-prompt — a local-first prompt management tool for storing, composing, and getting AI-powered suggestions for prompts. Ships as a browser extension sidebar (Chrome/Firefox). All data stays on the user's machine; cloud sync via Supabase is optional.

Full product spec: `requirements.md`

## Repository Layout

```
l1br3-prompt/
├── api/                    # Python FastAPI backend (Phase 1 ✅ complete)
│   ├── app/
│   │   ├── main.py         # Entry point — binds to 127.0.0.1:8000
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic v2 request/response schemas
│   │   ├── routes/         # REST endpoints
│   │   ├── repositories/   # Data access layer (repository pattern)
│   │   └── services/       # Business logic
│   ├── migrations/         # Alembic migrations
│   └── tests/              # pytest suite (73 tests, all passing)
├── browser-ext/            # WXT/React browser extension (Phase 2 🔵 in progress)
│   ├── components/         # Tab components (Compose, Prompts, Suggestions, Settings, Sidebar)
│   ├── contexts/           # AppConfig React context (global state)
│   ├── entrypoints/        # WXT entry points (sidepanel, background, content)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # API client, storage, sync utilities
│   └── types/              # TypeScript types
├── Justfile                # Task runner (just dev, just test, just build)
└── requirements.md         # Full product specification
```

## Commands

All commands use `just` from the repo root:

```bash
just dev          # start API (localhost:8000) + extension dev server
just dev-api      # API only
just dev-ext      # extension dev server (Chrome)
just dev-ext-ff   # extension dev server (Firefox)
just test         # run API tests (pytest)
just lint         # lint both API (ruff) and extension (tsc)
just build        # build API + Chrome extension
just clean        # remove build artifacts
```

Or run directly:

```bash
# API
cd api && uv run python -m app.main

# Extension
cd browser-ext && npm run dev
```

## Architecture

### Backend (`api/`)

Python 3.12+ / FastAPI / SQLite + SQLAlchemy 2 / Alembic / Pydantic v2.

All responses use the `ApiResponse[T]` envelope: `{ success, data, error, metadata }`.

Endpoints: prompts CRUD, `/suggest` (rule-based + optional Ollama), `/generate` (SSE stream), `/process-template`, `/ai/status`, `/health`. Binds to `127.0.0.1` only (never exposed to internet).

### Browser Extension (`browser-ext/`)

WXT + React 19 + TypeScript + Tailwind CSS 4. Chrome Side Panel API + Firefox sidebar_action. Keyboard shortcut: `Ctrl+Shift+Y`.

**Global state**: `AppConfigProvider` (React Context, `contexts/AppConfig.tsx`) — backend connection, AI settings, sync state, quick-actions. Persisted to `browser.storage.local`.

**Tab components**: `ComposeTab` (Tiptap editor + variables + modifiers), `PromptsTab` (prompt library), `SuggestionsTab` (AI suggestions), `SettingsTab` (backend/AI/sync config).

**Entry points**: `sidepanel` (main UI), `background` (opens side panel, broadcasts TAB_CHANGED), `content` (context detection + text injection into ChatGPT/Claude/Gemini).

### Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Local Backend (FastAPI + SQLite) | ✅ Complete |
| 2 | Browser Extension Sidebar (MVP UI) | 🔵 In Progress |
| 3 | Context-Aware Suggestions | ⬜ Upcoming |
| 4 | Local AI Integration (Ollama) | ✅ Complete |
| 5 | Optional Cloud Sync (Supabase) | 🔵 In Progress |
| 6 | Free Cloud AI Fallback | ✅ Complete |

### Planning Workflow

The `.claude/` harness includes a planning toolchain for agile development:

```
/sprint-plan  →  /capability  →  /plan  →  /tdd  →  /verify  →  /sprint-update
  (phases)       (features)     (steps)    (code)   (quality)    (persist status)
```

| Command | Purpose |
|---------|---------|
| `/sprint-plan` | Decompose a phase into sprints with features and acceptance criteria |
| `/capability` | Deep-dive a feature into constraints, interfaces, and open questions |
| `/plan` | Create step-by-step implementation plan (waits for confirmation) |
| `/tdd` | Test-driven development (RED-GREEN-REFACTOR) |
| `/verify` | Build, test, lint, typecheck verification loop |
| `/sprint-update` | Persist feature status (in-progress / completed / blocked) into the sprint plan |
| `/sprint-status` | Read the current sprint plan (no writes) |
| `/pr-review` | Code review (local changes or GitHub PR) |

Supporting skills: `product-capability`, `strategic-compact`, `project-flow-ops`

Behavioral rules for this workflow: `.claude/rules/workflow.md`.
Full contributor guide: `CONTRIBUTING.md`.
