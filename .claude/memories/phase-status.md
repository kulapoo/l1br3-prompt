# Phase Status

Current development progress tracking for l1br3-prompt.

## Phase Definitions

| Phase | Title | Timeline | Status | Details |
|-------|-------|----------|--------|---------|
| 1 | Local Backend Foundation | Week 1-2 | ✅ Complete | FastAPI + SQLite + SQLAlchemy with FTS5. 121 tests passing. Includes /generate (SSE), /process-template, /transform (SSE) + /transform-modes CRUD, MCP server. |
| 2 | Sidebar UI | Week 3-4 | 🔵 In Progress | WXT extension scaffolded. UI components exist. PromptsTab uses mock data — needs API wiring. ComposeTab Save button empty. No browser.storage persistence. |
| 3 | Transform (AI Prompt Rewriting) | Week 5-6 | ✅ Complete | `/transform` SSE endpoint + `/transform-modes` CRUD. In-Compose `TransformPanel` (selection-aware, combined modes, saved custom modes). Built-ins in code, customs in DB. |
| 4 | Local AI Integration | Week 7-8 | ✅ Complete | Ollama provider + streaming in backend and frontend. |
| 5 | Optional Cloud Sync | Week 9-10 | 🔵 In Progress | Supabase integration. Extension-orchestrated sync (LWW). |
| 6 | Free Cloud AI Fallback | Week 11-12 | ✅ Complete | Cloudflare Worker → Groq/Gemini. 30s fetch timeout, 50/day quota, SSE meta frames, provider badge in StatusBar, QuotaExceededError UX, background quota polling. |

**Note: Phase 7 (Electron/Tauri + React Native cross-platform) has been removed from scope.**

## Current Focus (Phases 2 + 5 parallel — Phase 6 complete)

**Phase 5: Cloud Sync (Supabase)**
- Extension-orchestrated sync (not backend-orchestrated): extension holds Supabase credentials, merges local + remote via LWW on updated_at
- Backend change: soft-delete support (deleted_at column) + include_deleted query param
- Frontend: lib/supabase.ts (client factory + OAuth PKCE), lib/sync.ts (SyncService), SettingsTab rewrite
- User supplies their own free Supabase project URL + anon key (local-first philosophy)

**Phase 2: Sidebar UI MVP (parallel)**
- Wire PromptsTab to backend API
- Wire ComposeTab Save → backend
- Add browser.storage.local persistence for AppConfig

## Dependencies

- Phase 1 (Backend) → ✅ done
- Phase 2 (UI) → partially done; API wiring remaining
- Phase 3 (Transform) → ✅ done (F13 Enhance → F14 Transform refactor)
- Phase 4 (AI) → backend Ollama done; frontend streaming needed
- Phase 5 (Sync) → in progress (independent of Phase 2 backend; needs Phase 2 frontend for end-to-end)
- Phase 6 (Cloud AI) → after Phase 5

## Key Performance Targets (MVP)
- Sidebar open: < 200ms
- Prompt copy: < 50ms
- Transform first-chunk: < 150ms
- Idle memory: < 150 MB
