# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

l1br3-prompt (codenamed "l1br3-prompt") — a local-first prompt management tool for storing, composing, and getting AI-powered suggestions for prompts. The MVP is a browser extension sidebar; the full product spec is in `l1br3-prompt-Specification.md`.

Currently only the **frontend prototype** exists in `l1br3-prompt/`. There is no backend yet (spec calls for a FastAPI + SQLite Python backend).

## Commands

All commands run from `l1br3-prompt/`:

```bash
cd l1br3-prompt
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build
npm run lint         # ESLint (JS/TS/TSX)
npm run preview      # preview production build
```

## Architecture

### Frontend (`l1br3-prompt/`)

React + TypeScript + Vite + Tailwind CSS. No routing library — view switching is handled via `AppConfig` context.

**Three view modes** controlled by `AppConfig.viewMode`:
- `sidebar` — 400px panel simulating a Chrome extension Side Panel (default)
- `admin` — full-width 3-column layout (Prompts | Compose | Suggestions) with slide-over Settings
- `docs` — renders the product spec

**Tab components** (shared between sidebar and admin modes):
- `ComposeTab` — Tiptap rich text editor with quick-action modifiers and `{{variable}}` support
- `PromptsTab` — prompt library with search, filter, favorites, and inline CRUD
- `SuggestionsTab` — AI suggestion panels (currently mock data)
- `SettingsTab` — backend/AI/sync configuration

**State management**: `AppConfigProvider` (React Context in `src/contexts/AppConfig.tsx`) holds all app config including backend connection status, AI settings, sync state, and quick actions. No external state library.

**Key libraries**: Tiptap (rich text), framer-motion (animations), lucide-react (icons), Emotion (CSS-in-JS, minimal usage — Tailwind is primary).

### Data

All data is currently mock (`src/mockData.ts`). Types are in `src/types.ts`. The `QuickAction` type in `AppConfig.tsx` supports multiple sources: local, API, MCP, and Ollama.

### Planned Backend (not yet built)

Python 3.11+ / FastAPI / SQLite+SQLAlchemy / Alembic. API spec is in `l1br3-prompt-Specification.md` section 5. Will bind to `localhost:8000`.
