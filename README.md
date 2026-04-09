# l1br3-prompt

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A local-first prompt management tool — store, organize, compose, and get AI-powered suggestions for prompts. Ships as a browser extension sidebar so your prompt library is always one keystroke away (`Ctrl+Shift+Y`). All data stays on your machine; cloud sync and AI features are optional.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Local Backend (FastAPI + SQLite) | ✅ Complete |
| 2 | Browser Extension Sidebar (MVP UI) | 🔵 In Progress |
| 3 | Context-Aware Suggestions | ⬜ Upcoming |
| 4 | Local AI Integration (Ollama) | ⬜ Upcoming |
| 5 | Optional Cloud Sync (Supabase) | ⬜ Upcoming |
| 6 | Free Cloud AI Fallback | ⬜ Upcoming |
| 7 | Cross-Platform & Polish | ⬜ Upcoming |

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
│   ├── components/         # Tab components (Compose, Prompts, Suggestions, Settings)
│   ├── contexts/           # AppConfig React context
│   ├── entrypoints/        # WXT entry points (sidepanel)
│   ├── hooks/              # Custom React hooks
│   └── types/              # TypeScript types
├── Justfile                # Task runner recipes
└── requirements.md         # Full product specification
```

## AI Setup

### Local AI with Ollama (Phase 4)

> Full backend wiring lands in Phase 4. The Settings UI is already in place.

1. Install [Ollama](https://ollama.ai) and pull a model:
   ```bash
   ollama pull llama3
   ollama serve          # runs on localhost:11434
   ```
2. In the extension: **Settings → AI Connection → Local AI (Ollama)** toggle ON
3. Select your installed model from the dropdown

### Cloud AI Fallback (Phase 6, coming soon)

Groq and Gemini APIs via a Cloudflare Worker proxy — **no API key required from you**. Opt-in only; 50 requests/day free tier. Disabled by default.

## License

[MIT](LICENSE)
