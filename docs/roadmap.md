# Roadmap

> The master **EPIC register** for l1br3-prompt. Every PRD (`docs/prds/*.prd.md`)
> opens against exactly one feature listed here. **Status lives in this file** —
> PRDs reference it by `Epic` + `Feature` ID; when a PRD lands or a feature ships,
> tick the matching box and update the Status Summary table below.
>
> Source of truth for completion data: `docs/sprint_plan_current.md`.
> Requirements source of truth: **this file**.

## How to use this doc

1. **Pick a feature** from an EPIC's checklist below (prefer pending `[ ]` items).
2. Run `/plan-prd "<idea>"` and set the PRD front-matter:
   ```yaml
   epic: EPIC-2          # from the Status Summary table
   feature: F1           # from the checklist (or "NEW" for a feature not yet listed)
   ```
3. The PRD writes to `docs/prds/{name}.prd.md`, then `/plan` consumes it.
4. When a PRD is created, link it next to the feature: `PRD: docs/prds/{name}.prd.md`.
5. When the feature ships, change `- [ ]` to `- [x]` and update the Status Summary % .

> **Adding a new feature?** Append it to the relevant EPIC's checklist with a new
> `F##` id (or `NEW`) before opening its PRD. The roadmap is the index — don't let
> PRDs dangle without an entry here.

## Legend

| Mark | Meaning |
|------|---------|
| ✅ | Done — meets acceptance criteria, tests green |
| 🔵 | In Progress — some work shipped, more pending |
| ⚪ | Not Started |
| ⛔ | Superseded — replaced by a later feature (kept for history) |

Complexity: **Low** / **Medium** / **High**

---

## Status Summary

| Epic | Title | Status | Completion |
|------|-------|--------|------------|
| EPIC-1 | Local Backend Foundation | ✅ | 100% |
| EPIC-2 | Sidebar UI (MVP Core) | ✅ | 100% |
| EPIC-3 | Transform (AI Prompt Rewriting) | ✅ | 100% |
| EPIC-4 | Local AI Integration (Ollama) | ✅ | 100% |
| EPIC-5 | Optional Cloud Sync (Supabase) | 🔵 | ~85% |
| EPIC-6 | Free Cloud AI Fallback | ✅ | ~95% |
| EPIC-7 | Multi-Provider Models Manager | 🔵 | ~40% |
| EPIC-8 | Pluggable Database Store | ⚪ | 0% |

---

## EPIC-1 — Local Backend Foundation  ✅

FastAPI + SQLite + SQLAlchemy (FTS5), CRUD/search/tag/category, PyInstaller packaging,
WXT extension skeleton. Foundational — no tracked feature PRDs.

- [x] FastAPI service bound to `127.0.0.1:8000`, `ApiResponse[T]` envelope
- [x] SQLite + Alembic migrations, FTS5 search
- [x] Prompts CRUD + categories/tags endpoints
- [x] Health + AI status endpoints

---

## EPIC-2 — Sidebar UI (MVP Core)  ✅

Chrome Side Panel API + Firefox `sidebar_action`. React sidebar wired to the backend:
prompt library, search/filter, inline CRUD, rich editor, content-script injection,
admin/dashboard mode. *Glue between existing UI and backend.*

- [x] **F1 — PromptsTab: replace mock data with backend** · *Medium*
  Fetch from `GET /api/v1/prompts` (React Query, `usePrompts`), debounced search,
  tag/favorite filters, loading + error/retry states, nullable `lastUsed`.
  *PRD: —*
- [x] **F2 — Prompt CRUD in UI** · *Medium* · depends on F1
  Delete/toggle-favorite/record-copy mutations with optimistic updates, delete-confirm
  dialog, create stub wired to empty-state.
  *PRD: —*
- [x] **F3 — ComposeTab: save to backend** · *Medium*
  `useCreatePrompt`, free-text tag input, backend-offline banner, "Saved!" flash →
  auto-switch to PromptsTab, `activeTab` lifted into AppConfig.
  *PRD: —*
- [x] **F4 — Copy-to-clipboard + content-script insertion** · *Low* · depends on F1
  `insertIntoActiveTab` helper, hardened `handleCopy`, honest error state on clipboard
  failure, usage-count increment via `POST /{id}/copy`.
  *PRD: —*
- [x] **F5 — Cross-tab state: edit-prompt flow** · *Medium* · depends on F2, F3
  `navigateTo(tab, state?)` via AppConfig context, ComposeTab accepts `editingPrompt`,
  vitest save-branch tests.
  *PRD: —*
- [x] **F6 — "From Saved" picker** · *Low* · depends on F1
  `FromSavedPicker` overlay, offline cache + banner. (Originally in SuggestionsTab;
  pattern reused by Transform/Enhance.)
  *PRD: —*
- [x] **F7 — Category management** · *Low*
  `useCategories` hook, datalist-backed ComposeTab input, emerald filter pills in
  PromptsTab, offline-cache fallback.
  *PRD: —*
- [x] **F8 — Offline prompt cache** · *Low*
  Last-fetched prompts cached in `browser.storage.local`, loaded when backend offline
  with banner; invalidated on CRUD. (ACs met by F1/F2/F7; dead cache helpers removed.)
  *PRD: —*
- [x] **F11 — Admin / Dashboard view mode** · *Medium*
  `GET /api/v1/prompts/stats`, `usePromptStats` hook + cache, `AnalyticsPanel`,
  `AdminLayout` tabbed right column, dedicated `entrypoints/admin/` page, Settings
  "Open Admin Mode" → background `OPEN_ADMIN` → new tab; `viewMode` persisted.
  *PRD: —*

---

## EPIC-3 — Transform (AI Prompt Rewriting)  ✅

One-shot AI prompt rewriting built into the Compose tab. Streamed, combinable modes,
saved custom modes, selection-aware. Replaces the standalone Enhance tab.

- [x] **F13 — Enhance tab (standalone)** · *Medium* · depends on F6, EPIC-6 · ⛔ **Superseded by F14**
  Backend `/enhance` SSE + `EnhanceTab`. Removed in F14; the capability migrated into
  Compose as Transform. *Kept for history.*
  *PRD: —*
- [x] **F14 — Transform refactor: migrate Enhance into Compose** · *High* · depends on F13, EPIC-6
  Enhance→Transform rename across BE/FE/schema. `POST /api/v1/transform` SSE (combined
  modes → single meta-prompt) + `/transform-modes` CRUD + migration `003_transform_modes`.
  In-Compose `TransformPanel`: multi-select chips, saved custom modes, selection-aware
  transform, whole-text confirmation dialog, placeholder-removal directive.
  *PRD: —*

---

## EPIC-4 — Local AI Integration (Ollama)  ✅

Auto-detect Ollama, Jinja2 template processing, MCP server, streaming to sidebar.

- [x] Ollama detection + `/generate` SSE streaming
- [x] Jinja2 `/process-template`
- [x] **F12 — API/MCP modifier sources** · *High*
  `api`/`mcp` modifier sources wired in ComposeTab, backend `/mcp/call` route
  (read-only; writes gated on `L1BR3_MCP_ALLOW_WRITE`), graceful static-text fallback
  + amber error banners.
  *PRD: —*

---

## EPIC-5 — Optional Cloud Sync (Supabase)  🔵  (~85%)

Supabase project, auth UI, background sync, conflict resolution, Realtime push.

- [x] **F9 — Supabase Realtime sync** · *High*
  WebSocket push + 30-min fallback alarm, LWW merge, echo suppression, event buffering,
  realtime status indicators. *PRD: —*
- [x] **F10 — Sync conflict-resolution UI** · *High*
  Watermark-based conflict detection (`conflicts.ts`, `decideAction`, `enqueueConflict`),
  `ConflictDialog` side-by-side diff (keep/accept/manual-merge), `useConflicts` hook,
  amber Sidebar badge. *PRD: —*
- [ ] **F16 — Phase 5 remainder (scope via PRD)** · *TBD*
  Remaining ~15%. Candidate areas (confirm in PRD before building): optional E2E
  encryption of sync payloads with a user-controlled key; mobile/desktop surface readiness;
  sync enable/disable lifecycle polish. *PRD: —*

---

## EPIC-6 — Free Cloud AI Fallback  ✅  (~95%)

Cloudflare Worker → Groq/Gemini. Extension settings, rate limiting + quota management,
privacy-first proxy (logs counters only).

- [x] Worker proxy to Groq/Gemini free tiers
- [x] Extension cloud-AI settings (opt-in, off by default)
- [x] Rate limiting (50 req/day/user enforced at the worker)
- [ ] **F17 — Phase 6 remainder (scope via PRD)** · *TBD*
  Remaining ~5%. Candidate areas (confirm in PRD): quota/usage UX visibility, fallback
  telemetry hardening. *PRD: —*

---

## EPIC-7 — Multi-Provider Models Manager  🔵  (~40%)

Bring-your-own-key providers (OpenAI, Anthropic, OpenAI-compatible) alongside Local
(Ollama) and Free Cloud, with per-purpose Default Model Assignments. **Frontend slice
shipped; backend provider wiring + encrypted key storage pending.**

- [x] **F15 — AI Models Manager (frontend)** · *High* · depends on F14, EPIC-4, EPIC-6
  Admin "Models" view: provider cards + per-purpose Default Model Assignments
  (Chat = `/generate`, Transformation = `/transform`); Test/Models/Edit/Delete; removable
  model pills; Auto-assign; missing-required-model warning. Config in `AppConfig.ai`
  (`providers`, `assignments`), keys in `browser.storage.local`; Settings AI summary card
  with "Manage models →" deep-link; `OPEN_ADMIN { target:'models' }`.
  *PRD: —*
- [ ] **F18 — Real upstream provider classes** · *High* · depends on F15
  Backend OpenAI / Anthropic / OpenAI-compatible provider implementations behind a common
  interface (streaming, error mapping, model listing). *PRD: —*
- [ ] **F19 — Role-aware `resolve_provider`** · *High* · depends on F18
  Route Chat → Chat default model, Transformation → Transformation default model;
  resolve through provider stack (local → cloud → BYOK) honoring user assignments.
  *PRD: —*
- [ ] **F20 — Encrypted backend key storage** · *High* · depends on F15
  Move BYOK keys from `browser.storage.local` to encrypted server-side storage bound to
  `127.0.0.1`. *PRD: —*

---

## EPIC-8 — Pluggable Database Store  ⚪  (0%)

User-managed backend database engine and location. Replace the hardcoded
single-SQLite-file assumption with a pluggable store (default SQLite, plus
PostgreSQL), a Database Manager settings page mirroring the Models Manager,
and a migration wizard for switching engines without data loss.

- [ ] **F21 — Pluggable database store** · *High*
  Engine abstraction behind common interface (SQLite + PostgreSQL); Postgres
  search-index fallback for FTS5; Database Manager UI (engine select, guided
  form + connection-string, test-connection, set-active); migration wizard
  with progress + rollback.
  *PRD: docs/prds/pluggable-database-store.prd.md*

---

## PRD Backlog (next candidates)

Ordered by dependency readiness. Open a PRD (`/plan-prd`) against the first pending item
its EPIC can unblock.

1. **F21** — Pluggable database store (unblocks data portability; functional MVP prioritized, security hardening follows)
2. **F18** — Real upstream provider classes (unblocks F19; EPIC-7 backend slice)
2. **F19** — Role-aware `resolve_provider` (unblocks end-to-end BYOK)
3. **F20** — Encrypted backend key storage (security follow-up to F15)
4. **F16** — EPIC-5 remainder (confirm scope first)
5. **F17** — EPIC-6 remainder (confirm scope first)

---

## Dependency Graph

```
EPIC-1 (Backend) ── foundation for all
EPIC-4 (Ollama) ──┐
EPIC-6 (Cloud)  ──┼──► F13 (Enhance) ──► F14 (Transform)
                  │                      │
                  └──► F15 (Models FE) ──┼──► F18 (providers) ──► F19 (resolve_provider)
                                         └──► F20 (encrypted keys)

EPIC-2 (Sidebar MVP):
  F1 ◄── F2 ◄── F5
  F1 ◄── F4
  F1 ◄── F6
  F3 ◄── F5
  F7, F8, F11 parallel to F2–F4

EPIC-5 (Sync):
  F9, F10 independent
  F16 (remainder) TBD

EPIC-8 (Pluggable DB):
  F21 (pluggable store) — functional MVP; encrypted credential storage follows
```

---

## Definition of Done (per feature)

- Acceptance criteria for the feature met
- `just test` (pytest) green; new extension tests green
- `just lint` clean (ruff + tsc; ruff introduces 0 new errors)
- `just build` succeeds (Chrome build emits expected `admin.html` + `sidepanel.html`)
- Box ticked `- [x]` here + Status Summary % updated
- Linked PRD path filled in (if one exists)
