# l1br3-prompt

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A local-first prompt management tool — store, organize, compose, and get AI-powered suggestions for prompts. Ships as a browser extension sidebar so your prompt library is always one keystroke away (`Ctrl+Shift+Y`). All data stays on your machine.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Local Backend (FastAPI + SQLite) | ✅ Complete |
| 2 | Browser Extension Sidebar (MVP UI) | ✅ Complete |
| 3 | Transform (AI Prompt Rewriting) | ✅ Complete |
| 4 | Local AI Integration (Ollama) | ✅ Complete |
| 5 | Multi-Provider Models Manager | 🔵 In Progress (~40%) |
| 6 | Pluggable Database Store | ⚪ Planned |

> See [`docs/roadmap.md`](docs/roadmap.md) for the authoritative EPIC register,
> feature-level status, and the PRD backlog.

## Tech Stack

| Backend | Frontend |
|---------|----------|
| Python 3.12+ / FastAPI | React 19 / TypeScript |
| SQLite + SQLAlchemy 2 | WXT (Manifest V3, Chrome & Firefox) |
| Alembic (migrations) | Tiptap (rich text editor) |
| Uvicorn (ASGI server) | Tailwind CSS 4 |
| PyInstaller (single binary) | Framer Motion / Lucide React |

## Prerequisites

- **Node.js** + **pnpm** (browser extension)
- **Python 3.12+** + **[UV](https://docs.astral.sh/uv/)** (backend)
- **[just](https://just.systems/)** (task runner)

## Getting Started

```bash
# Install all dependencies
just install

# Start API (localhost:8000) + extension dev server concurrently
just dev
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `browser-ext/.output/chrome-mv3`
4. Open the side panel with `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`)

## Commands

| Command | Description |
|---------|-------------|
| `just install` | Install all dependencies |
| `just dev` | Run API + extension dev server |
| `just dev-api` | API only (FastAPI on localhost:8000) |
| `just dev-ext` | Extension dev server (Chrome) |
| `just dev-ext-ff` | Extension dev server (Firefox) |
| `just build` | Build API + extension |
| `just build-api` | Build API as single executable |
| `just build-ext` | Build Chrome extension |
| `just build-ext-ff` | Build Firefox extension |
| `just zip-ext` | Package extension zips for distribution |
| `just test` | Run API tests (pytest) |
| `just lint` | Type-check browser extension |
| `just clean` | Remove all build artifacts |

## Project Structure

```
l1br3-prompt/
├── api/                    # Python FastAPI backend
│   ├── app/
│   │   ├── main.py         # Entry point
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── routes/         # REST endpoints
│   │   ├── repositories/   # Data access layer
│   │   └── services/       # Business logic
│   ├── migrations/         # Alembic migrations
│   └── tests/              # pytest suite
├── browser-ext/            # WXT/React extension
│   ├── components/         # Tab components (Compose, Prompts, Settings) + TransformPanel
│   ├── contexts/           # AppConfig React context
│   ├── entrypoints/        # WXT entry points (sidepanel)
│   ├── hooks/              # Custom React hooks
│   └── types/              # TypeScript types
├── docs/                   # Roadmap, PRDs, sprint plans (source of truth)
└── Justfile                # Task runner recipes
```

## AI Setup

### Local AI with Ollama

1. Install [Ollama](https://ollama.ai) and pull a model:
   ```bash
   ollama pull llama3
   ollama serve          # runs on localhost:11434
   ```
2. In the extension: **Settings → AI Models** — verify the Ollama provider is detected
3. Select your installed model from the dropdown

### Bring Your Own Key (BYOK)

For non-local providers (OpenAI, OpenAI-compatible endpoints), open the
**Models Manager** in Admin Mode and add your API keys. Keys are stored locally in
your browser; encrypted server-side storage arrives in a follow-up.

## License

[MIT](LICENSE)
