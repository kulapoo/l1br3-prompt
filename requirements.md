# l1br3-prompt — Product Specification

> A high-performance, cross-browser, and cross-platform application to store, manage, and intelligently suggest AI prompts based on real-time user activity. Local-first design with optional free cloud sync.

**Tags:** Local-First · Free Forever · Cross-Platform · AI-Powered

---

## 1. Project Vision

A high-performance, cross-browser, and cross-platform application to store, manage, and intelligently suggest AI prompts based on real-time user activity. Local-first design – all data stored on the user's own machine, with optional free cloud sync for backup and cross-device sharing. The MVP browser extension will use a sidebar interface for seamless access while browsing.

---

## 2. Platform Requirements

| Platform | Details |
|---|---|
| **Browser Extensions** | Manifest V3 for Chrome and Firefox. MVP uses sidebar (Chrome Side Panel API, Firefox sidebar_action). |
| **Mobile & Desktop** | Future-ready for iOS, Android, Windows, macOS via REST API or WebSocket. |
| **AI Integration** | Compatibility as a "Tool" for AI assistants (MCP) and ChatGPT (Actions). |

---

## 3. Technical Stack

### Backend Core (Python 3.11+)
| Component | Technology |
|---|---|
| Web Framework | FastAPI – async, self-documenting |
| Local Database | SQLite + SQLAlchemy ORM + Alembic |
| Async Processing | asyncio + httpx |
| Data Validation | Pydantic v2 |
| Template Engine | Jinja2 |
| Packaging | PyInstaller – single executable |

### Browser Extension (TypeScript + WXT)
| Component | Technology |
|---|---|
| Orchestrator | WXT – cross-browser builds |
| UI Paradigm | Sidebar (Side Panel API) |
| Framework | React + TypeScript |
| API Client | Generated from OpenAPI spec |
| Local Cache | IndexedDB for offline access |

### Optional Cloud Sync
| Component | Technology |
|---|---|
| Cloud DB & Auth | Supabase free tier (500 MB PostgreSQL) |
| Cloud Storage | Supabase Storage (1 GB free) |
| Sync Protocol | REST + Supabase Realtime (WebSocket) |
| Conflict Resolution | Last-write-wins with version vectors |

### AI Connectivity
| Component | Technology |
|---|---|
| Local LLM (Default) | Ollama on localhost:11434 |
| Cloud Fallback | Cloudflare Worker → Groq/Gemini |
| Bring-Your-Own-Key (Phase 7) | OpenAI, Anthropic, OpenAI-compatible (LM Studio, vLLM, OpenRouter) |
| MCP Server | Python, runs as part of local backend |
| Rate Limiting | 50 req/day per user (cloud) |

---

## 4. Feature Requirements

### MVP — Sidebar Extension + Local Backend

#### Sidebar UI
- Opens via toolbar button or keyboard shortcut (Ctrl+Shift+Y)
- Resizable, stays open while user browses
- Tabs: Compose, Prompts, Settings
- Admin/Dashboard mode for full-width view

#### Prompt Management
- List, search, filter by tag/category
- Click prompt → copy to clipboard or insert into active input field
- Inline edit/delete prompts
- Favorites, usage count, last used timestamps

#### Rich Prompt Editor
- Tiptap rich text editor with formatting toolbar
- Wrap text in code blocks, XML tags
- Configurable modifiers (concise, step-by-step, etc.) with external source support
- `{{variable}}` detection with auto-generated form fields
- Live preview with variable substitution

#### Transform (in Compose)
- Built into the Compose tab as `TransformPanel`, below the editor
- One-shot AI prompt rewriting with selectable modes (summarize, concise,
  add role, chain-of-thought, output format, best judgement) plus custom instructions
- Modes can be **combined** (multi-select → single combined meta-prompt, one LLM stream)
- **Transform the editor selection** (replaces only selected text); whole-text transform
  shows a confirmation warning that `{{variables}}`, modifiers, and formatting are removed
- User can **save a custom instruction as a reusable mode** (persisted to DB, syncable)
- Placeholders `{{...}}` are kept in the LLM input for context; the meta-prompt directs
  the AI to remove them from the output
- Result actions: use in Compose, save as new prompt, copy, retry
- Requires AI connection (local or cloud); disabled state with clear setup guidance

### Post-MVP Features
- Cloud sync (Supabase)
- AI integration (Ollama)
- MCP server for AI assistants/ChatGPT
- Mobile & desktop apps

---

## 5. API Endpoints (Local Backend)

### Prompts
```
GET    /api/v1/prompts              # List (paginated, search, filter)
POST   /api/v1/prompts              # Create
GET    /api/v1/prompts/{id}         # Get single
PUT    /api/v1/prompts/{id}         # Update
DELETE /api/v1/prompts/{id}         # Delete
POST   /api/v1/prompts/{id}/copy    # Increment usage count
```

### Categories & Tags
```
GET    /api/v1/categories           # List categories
POST   /api/v1/prompts/{id}/tags    # Add tags
```

### AI & Transform
```
POST   /api/v1/transform             # Stream an AI-rewritten prompt (SSE)
GET    /api/v1/transform-modes       # List built-in + custom transform modes
POST   /api/v1/transform-modes       # Create a custom transform mode
DELETE /api/v1/transform-modes/{id}  # Delete a custom transform mode
POST   /api/v1/generate             # Generate AI response
POST   /api/v1/process-template     # Render Jinja2 template
```

### Sync
```
POST   /api/v1/sync/enable          # Enable cloud sync
POST   /api/v1/sync/now             # Manual sync
GET    /api/v1/sync/status          # Last sync time, quota
POST   /api/v1/sync/disable         # Turn off sync
```

### WebSocket
```
WS     /ws                          # Real-time connection (local only)
```

---

## 6. Development Roadmap

| Phase | Title | Timeline | Status |
|---|---|---|---|
| 1 | Local Backend Foundation | Week 1-2 | ✅ Complete |
| 2 | Sidebar UI | Week 3-4 | 🔵 In Progress |
| 3 | Transform (AI Prompt Rewriting) | Week 5-6 | ✅ Complete |
| 4 | Local AI Integration | Week 7-8 | ✅ Complete |
| 5 | Optional Cloud Sync | Week 9-10 | 🔵 In Progress |
| 6 | Free Cloud AI Fallback | Week 11-12 | 🔵 In Progress |

### Phase 1: Local Backend Foundation
- FastAPI + SQLite + SQLAlchemy with FTS5
- CRUD + search + tag/category management
- PyInstaller packaging (single executable)
- WXT extension skeleton with sidebar configuration

### Phase 2: Sidebar UI (MVP Core)
- Chrome Side Panel API + Firefox sidebar_action
- React sidebar: prompt list, search/filter, inline CRUD
- Rich text editor with Tiptap, modifiers, variables
- Content script for context detection

### Phase 3: Transform (AI Prompt Rewriting)
- Backend `/transform` endpoint (SSE stream; Ollama → cloud fallback) + `/transform-modes` CRUD
- In-Compose `TransformPanel`: selectable rewrite modes + custom instructions, applied to
  editor selection or whole text (with confirmation)
- Combined modes (multi-select → single meta-prompt); saved custom modes persisted to DB

### Phase 4: Local AI Integration
- Auto-detect and integrate Ollama
- Jinja2 template processing
- MCP server implementation
- Streaming responses to sidebar

### Phase 5: Optional Cloud Sync
- Supabase project (free tier)
- Auth UI in sidebar (Google/GitHub)
- Background sync task + conflict resolution

### Phase 6: Free Cloud AI Fallback
- Cloudflare Worker + Groq/Gemini
- Extension settings for cloud AI
- Rate limiting and quota management

### Phase 7: Multi-Provider Models Manager
- **Models Manager** in Admin Mode: bring-your-own-key provider cards (OpenAI, Anthropic, OpenAI-compatible) alongside Local (Ollama) and Free Cloud
- Per-purpose **Default Model Assignments** (Chat, Transformation) with auto-assign + missing-model warnings
- API key storage (local-first now; encrypted backend storage to follow)
- Frontend slice complete; backend provider classes + role-aware resolution pending

---

## 7. Cost Control & Free Tier Limits

| Component | Free Limit | Mitigation |
|---|---|---|
| Local backend | Unlimited | Runs on user's machine |
| Ollama (local LLM) | Unlimited | User needs GPU/RAM |
| Supabase | 500 MB DB, 1 GB storage, 50k MAU | ~50,000 prompts capacity |
| Cloudflare Worker | 100k req/day | BYOK above 500 users |
| Groq free API | 30 req/min | Worker enforces 50/day/user |
| Cloud AI | Off by default | Opt-in only |

---

## 8. Security & Privacy

- **Local-only binding** — Backend binds to 127.0.0.1, not exposed to internet
- **E2E Encryption** — Cloud sync data encrypted with user-controlled key (optional)
- **No telemetry** — No telemetry without explicit consent
- **Privacy-first AI** — Cloud AI proxy logs only rate-limiting counters, never prompt content
- **Provider API keys (Phase 7)** — BYOK keys stored locally in the browser now; encrypted server-side key storage bound to 127.0.0.1 to follow
- **Data ownership** — User can delete cloud data at any time and keep local copy
- **Zero cost** — $0 for all features, forever, for users with local Ollama + free-tier sync

---

## 9. Success Metrics (MVP)

| Metric | Target |
|---|---|
| Sidebar open time | < 200ms |
| Prompt copy latency | < 50ms |
| Transform first-chunk latency | < 150ms |
| Backend idle memory | < 150 MB |

---

## 10. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser Extension – Sidebar (React)                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐              │
│  │ Compose   │ │ Prompts   │ │ Settings │              │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘              │
│        └──────────────┼───────────┘                      │
│                       │ HTTP / WebSocket                 │
└───────────────────────┼─────────────────────┘───────────┘
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Local Python Backend (FastAPI)                         │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐             │
│  │ REST API │ │ WebSocket │ │ MCP Server │             │
│  └────┬─────┘ └─────┬─────┘ └──────┬─────┘             │
│       └─────────────┼──────────────┘                    │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Business Logic · Template Engine                │   │
│  │  Context Analyzer · AI Orchestrator              │   │
│  │  Sync Manager (background)                       │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     ▼                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SQLite (primary, local)                         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                              │
         │ (optional sync)              │ (optional AI)
         ▼                              ▼
┌─────────────────┐          ┌──────────────────────┐
│ Supabase Free   │          │ Cloudflare Worker    │
│ PostgreSQL      │          │ → Groq / Gemini      │
│ Auth · Realtime │          │   Free API Tiers     │
└─────────────────┘          └──────────────────────┘
```

---

*l1br3-prompt Specification v1.0 — Generated from project requirements*
