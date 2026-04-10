# Phase Status

Current development progress tracking for l1br3-prompt.

## Phase Definitions

| Phase | Title | Timeline | Status | Details |
|-------|-------|----------|--------|---------|
| 1 | Local Backend Foundation | Week 1-2 | ✅ Complete | FastAPI + SQLite + SQLAlchemy with FTS5. 73/73 tests passing. Also includes /suggest (rule-based + Ollama rerank), /generate (SSE), /process-template, MCP server — ahead of roadmap. |
| 2 | Sidebar UI | Week 3-4 | 🔵 In Progress | WXT extension scaffolded. UI components exist. PromptsTab uses mock data — needs API wiring. ComposeTab Save button empty. No browser.storage persistence. |
| 3 | Context-Aware Suggestions | Week 5-6 | ⬜ Upcoming | Backend /suggest already done (Phase 1). Frontend mostly wired. Rule editing UI still needed. |
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
- Phase 3 (Suggestions) → backend done; frontend mostly wired
- Phase 4 (AI) → backend Ollama done; frontend streaming needed
- Phase 5 (Sync) → in progress (independent of Phase 2 backend; needs Phase 2 frontend for end-to-end)
- Phase 6 (Cloud AI) → after Phase 5

## Key Performance Targets (MVP)
- Sidebar open: < 200ms
- Prompt copy: < 50ms
- Suggestion display: < 150ms
- Idle memory: < 150 MB
