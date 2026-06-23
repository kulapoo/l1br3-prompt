---
name: Current Sprint Plan
description: Structured sprint plan for remaining work across Phases 2, 3, and 5 — prompt CRUD wiring, transform polish, sync improvements
type: project
originSessionId: b9b63de3-64bf-4bcc-be05-05b565b0a2a8
---
# Sprint Plan: Remaining Roadmap — Phases 2, 3 & 5 Completion

Created: 2026-04-12

## Status Summary

| Phase | Status | Completion |
|-------|--------|------------|
| 1 — Local Backend | Done | 100% |
| 2 — Sidebar UI | Done | 100% |
| 3 — Transform (AI Prompt Rewriting; was Enhance) | Done | 100% |
| 4 — Local AI (Ollama) | Done | 100% |
| 5 — Cloud Sync (Supabase) | In Progress | ~85% |
| 6 — Cloud AI Fallback | Done | ~95% |
| 7 — Multi-Provider Models Manager | In Progress (frontend slice done) | ~40% |

## Goal

Finish the browser extension MVP by wiring existing UI components to the backend, then polish transform and sync experiences. UI scaffolding and backend endpoints are both solid — what's missing is the glue between them.

---

## Sprint 1 — Must-Have: "Wire the MVP"

### F1. PromptsTab: Replace Mock Data with Backend
- Fetch real prompts from `GET /api/v1/prompts` instead of `MOCK_PROMPTS`
- Search via `?search=` query param (debounced 300ms)
- Tag filter pills from real data (not `MOCK_TAGS`)
- Favorites filter via `?favorite=true`
- Graceful fallback to `browser.storage` cache when backend offline
- **Files**: `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Medium
- **Status**: Done (2026-04-13) — React Query wired, `usePrompts` hook, debounced search, tag/favorite filters, loading skeleton, error+retry state, nullable lastUsed

### F2. Prompt CRUD in UI
- Wire Edit/Delete/Create buttons (PromptCard already renders icons)
- Edit opens ComposeTab pre-filled; Delete shows confirm + calls `DELETE /api/v1/prompts/{id}`
- `POST /{id}/copy` increments usage count on copy
- Optimistic UI updates
- **Files**: `browser-ext/components/PromptCard.tsx`, `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Medium
- **Depends on**: F1
- **Status**: Done (2026-04-14) — deleteMutation ✅, toggleFavoriteMutation ✅, recordCopyMutation ✅ (all with optimistic updates), delete confirm dialog ✅, handleCreate stub wired to empty-state button ✅; clipboard write handoff to F4, edit navigation handoff to F5

### F3. ComposeTab: Save to Backend
- Wire Save button to `POST /api/v1/prompts` (create) or `PUT /api/v1/prompts/{id}` (update)
- Tag input creates/removes tags (currently hardcoded "Code" chip)
- Success feedback + auto-switch to PromptsTab
- Validation: non-empty content required
- **Files**: `browser-ext/components/ComposeTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Medium
- **Status**: Done (2026-04-18) — useCreatePrompt hook, free-text tag input (Enter/comma), backend-offline banner, "Saved!" flash → auto-switch to PromptsTab, activeTab lifted into AppConfig context

### F4. Copy-to-Clipboard + Content Script Insertion
- Wire `handleCopy` in PromptsTab — copy to clipboard + INSERT_TEXT to active AI chat
- Visual "Copied!" feedback
- Usage count incremented via `POST /api/v1/prompts/{id}/copy`
- **Files**: `browser-ext/components/PromptsTab.tsx`, `browser-ext/components/PromptCard.tsx`
- **Complexity**: Low
- **Depends on**: F1
- **Status**: Done (2026-04-18) — insertIntoActiveTab helper extracted (lib/insertIntoActiveTab.ts), PromptsTab.handleCopy hardened with try/catch + returns Promise<boolean>, PromptCard shows honest error state (rose X) on clipboard failure, SuggestionPanel refactored to use helper, 4-case unit test added

---

## Sprint 2 — Should-Have: "Polish Suggestions & State"

### F5. Cross-Tab State: Edit Prompt Flow
- Navigation between tabs with state (Edit on PromptCard -> ComposeTab pre-filled)
- `navigateTo(tab, state?)` via context
- ComposeTab accepts optional `editingPrompt` state
- **Files**: `browser-ext/components/Sidebar.tsx`, `browser-ext/components/ComposeTab.tsx`, `browser-ext/contexts/AppConfig.tsx`
- **Complexity**: Medium
- **Depends on**: F2, F3
- **Status**: Done (2026-04-22) — navigateTo via AppConfig context, ComposeTab accepts editingPrompt, vitest scaffolded with save-branch tests

### F6. SuggestionsTab: "From Saved" Button
- Open searchable prompt picker; selecting populates input textarea
- **Files**: `browser-ext/components/SuggestionsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Low
- **Depends on**: F1
- **Status**: Done (2026-05-05) — FromSavedPicker overlay, 12 Vitest tests, offline cache + banner, all ACs met

### F7. Category Management
- Category dropdown in ComposeTab (from `GET /api/v1/categories`)
- Category filter in PromptsTab
- **Files**: `browser-ext/components/ComposeTab.tsx`, `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Low
- **Status**: Done (2026-05-15) — useCategories hook, datalist-backed ComposeTab input, emerald filter pills in PromptsTab, offline cache fallback; 12 tests across useCategories.test.ts, PromptsTab.test.tsx, ComposeTab.test.tsx

### F8. Offline Prompt Cache
- Cache last-fetched prompts in `browser.storage.local`
- Load from cache when backend offline with "Offline" banner
- Invalidate on CRUD operations
- **Files**: `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/storage.ts`
- **Complexity**: Low
- **Status**: Done (2026-05-18) — ACs were met by F1/F2/F7; verified end-to-end and removed dead legacy unscoped cache helpers (cachePrompts, getCachedPrompts)

---

## Sprint 3+ — Nice-to-Have

### F9. Supabase Realtime Sync
- Replace 5-min polling with Realtime WebSocket subscription
- **Complexity**: High | **Status**: Done (2026-05-27) — WebSocket push + 30-min fallback alarm, LWW merge, echo suppression, event buffering, realtime status indicators; 99 API + 108 ext tests green, tsc clean, Chrome build clean

### F10. Sync Conflict Resolution UI
- Detect concurrent edits, show merge dialog
- **Complexity**: High | **Status**: Done (2026-05-28) — watermark-based conflict detection (conflicts.ts, decideAction, enqueueConflict), ConflictDialog side-by-side diff with keep/accept/manual-merge, useConflicts hook, amber badge in Sidebar; 156 ext tests green, tsc clean, Chrome build clean

### F11. Admin/Dashboard View Mode
- Wire `AdminLayout.tsx` to viewMode config; prompt analytics
- **Complexity**: Medium | **Status**: Done (2026-05-28) — GET /api/v1/prompts/stats (7 tests), usePromptStats hook + cache, AnalyticsPanel (KPIs / top-used / stale / by-category), AdminLayout tabbed Suggest|Stats right column, dedicated `entrypoints/admin/` WXT page, Settings "Open Admin Mode" → background OPEN_ADMIN → new tab; viewMode now persisted, 'docs' literal dropped. 106 API + 156 ext tests green, Chrome build emits admin.html + sidepanel.html.

### F12. API/MCP Modifier Sources
- Wire `api` and `mcp` modifier sources in ComposeTab (line 220 TODO)
- **Complexity**: High | **Status**: Done (2026-05-29) — api/mcp modifier sources wired in ComposeTab (callApiSource/callMcpTool + shapeApiBody/shapeMcpArgs), backend /mcp/call route (read-only; writes gated on L1BR3_MCP_ALLOW_WRITE) + mcp_server READ_TOOLS/WRITE_TOOLS, graceful static-text fallback + amber error banners. Landed in 194fd1e; plan was stale. Verified: 124 API + 182 ext tests green (ComposeTab covers all 4 api/mcp success/fail cases), tsc clean, Chrome build clean.

---

### F13. Enhance Tab (replaces Suggestions)
- Replace `SuggestionsTab` with a dedicated `EnhanceTab` — a one-shot prompt-rewriting surface (the "Enhance" tab named in `requirements.md`)
- New backend `POST /api/v1/enhance` SSE endpoint: streams an AI-rewritten prompt; resolution order Ollama (local) → Cloud fallback (when `cloudEnabled`); 503 when no provider
- Enhancement modes: `summarize`, `concise`, `add_role`, `chain_of_thought`, `output_format`, `best_judgement`, plus `custom` (free-text instruction); unknown mode falls back to `best_judgement`
- `EnhanceTab.tsx`: prompt input + "From Saved" picker (reuses F6 pattern), mode chips, custom-instruction box, streamed Original/Enhanced diff, provider indicator, and Use-this / Save-as-new / Copy / Retry actions
- `streamEnhance` client in `lib/api.ts` (shares `_consumeSSE` with `streamGenerate`); `TabType` `'suggestions'` → `'enhance'`; wire Sidebar nav + AdminLayout right column
- Graceful "AI not available" banner when neither Ollama nor Cloud is reachable
- **Files**: `api/app/routes/enhance.py`, `api/app/schemas/ai.py`, `api/tests/test_enhance.py`, `browser-ext/components/EnhanceTab.tsx`, `browser-ext/lib/api.ts`, `browser-ext/types/index.ts`, `browser-ext/components/Sidebar.tsx`, `browser-ext/components/AdminLayout.tsx`
- **Complexity**: Medium | **Depends on**: F6 (From Saved picker), Phase 6 (cloud fallback)
- **Status**: Done (2026-05-31) — backend `/enhance` SSE route (Ollama→cloud→503) + `EnhanceRequest` schema + `test_enhance.py` (11 tests), `EnhanceTab.tsx` + `streamEnhance` (shares `_consumeSSE` with `streamGenerate`); SuggestionsTab→EnhanceTab cutover complete in Sidebar (Wand2 nav) + AdminLayout right column; old suggestions route/schema/service/tests + SuggestionPanel/SuggestionsTab/mockData removed; requirements.md reconciled (/suggest→/enhance). Verified: 109 API + 183 ext tests green (test_enhance 11, EnhanceTab.test 27), tsc clean, F13 files ruff-clean, Chrome build emits admin.html + sidepanel.html. Committed on `feat/f13-enhance-tab` (5967777). NOTE: earlier "13 tests / ruff unused-imports" note was stale — actual is 11 tests, ruff clean. **⚠️ SUPERSEDED by F14 (2026-06-23)** — Enhance tab removed; migrated into Compose as Transform. See F14.

### F14. Transform refactor — migrate Enhance into Compose
- **Remove** the standalone "Enhance" tab (Sidebar + AdminLayout); rename Enhance→Transform across backend, frontend, and schema
- **Migrate** enhancement into the Compose section below the editor as `TransformPanel`
- Default transformations (Summarize, Make Concise, Add Role, Chain of Thought, Specify Output Format, Best Judgement) plus free-text **Custom**; **each transformation can be combined** (multi-select → single combined meta-prompt)
- User can **save a Custom instruction as a reusable Transformation mode** (persisted to new `transform_modes` DB table; syncable via Supabase Phase 5); built-ins are non-deletable
- **Transform a text selection** in the editor (critical): replaces only the selected text; if no selection, transforms the whole editor with a **confirmation dialog** warning that `{{variables}}`, modifiers, and formatting will be removed
- Placeholders `{{...}}` are left in the LLM input (for context) but the meta-prompt instructs the AI to **remove them from the output**
- Transform button **disabled when no mode is selected**; flips to Cancel while streaming
- Backend: `POST /api/v1/transform` (SSE, replaces `/enhance`) accepts `modes: list[str]` and combines them; CRUD `GET/POST/DELETE /api/v1/transform-modes`
- **Files**: `api/migrations/versions/003_transform_modes.py`, `api/app/models/transform_mode.py`, `api/app/repositories/transform_mode_repo.py`, `api/app/schemas/transform.py`, `api/app/routes/transform.py` (replaces `enhance.py`), `api/tests/test_transform.py`; `browser-ext/components/TransformPanel.tsx`, `TransformConfirmDialog.tsx`, `hooks/useTransformModes.ts`, `lib/api.ts` (`streamTransform` + CRUD), `types/index.ts` (`TransformMode`, `TabType` drops `'enhance'`), `components/ComposeTab.tsx`, `Sidebar.tsx`, `AdminLayout.tsx`, `AdminLayout.test.tsx`; deleted `EnhanceTab.tsx`, `EnhanceTab.test.tsx`
- **Complexity**: High | **Depends on**: F13 (Enhance), Phase 6 (cloud fallback)
- **Status**: Done (2026-06-23) — full Enhance→Transform rename across BE/FE/schema. `POST /api/v1/transform` SSE + `/transform-modes` CRUD + migration 003 (`transform_modes` table) + `TransformMode` ORM/repo. Combined-modes meta-prompt (single LLM stream); `resolve_instructions` merges builtin slug ids + custom UUID ids + "custom" pseudo-id. In-Compose `TransformPanel` below editor: multi-select chips, saved custom modes, selection-aware transform, whole-text confirmation dialog. Placeholder-removal directive in meta-prompt (input preserved for context). Backend `test_transform.py` (23 tests); `TransformPanel.test.tsx` (13 tests); `AdminLayout.test.tsx` updated (Stats-only right column). Verified: 121 API + 168 ext tests green, tsc clean, ruff introduces 0 new errors.

### F15. AI Models Manager (Multi-Provider BYOK + Default Model Assignments)
- Full **Models Manager** page in Admin Mode (top-nav "Models" view): bring-your-own-key provider cards (OpenAI, Anthropic, OpenAI Compatible) alongside the existing Local (Ollama) and Free Cloud (Groq/Gemini) cards; per-purpose **Default Model Assignments** (Chat, Transformation); Test/Models/Edit/Delete per provider; removable model pills; Auto-assign Defaults; missing-required-model warning banner
- Provider configs + model assignments persisted in `browser.storage.local` via `AppConfig.ai` (new `providers: AiProviderConfig[]` + `assignments: Record<ModelRole, ModelAssignment|null>`); new `updateAi()` context helper
- **Adapted** the source layout (Open Notebook) to l1br3's real surfaces: Primary = Chat Model (required, `/generate`), Advanced = Transformation Model (required, `/transform`); dropped Embedding/TTS/STT/Tools/Large-Context roles (no such features yet) — role set is data-driven for future extension
- API keys held in `browser.storage.local` for now (same pattern as the Supabase anon key); **encrypted backend key storage + real upstream provider classes (OpenAI/Anthropic/OpenAI-compatible) + role-aware `resolve_provider` are deferred to a follow-up DB/backend sprint**
- Sidebar `SettingsTab`: old two-card AI Connection section replaced with a compact **AI Models** summary card (current defaults + provider status pills + "Manage models →" deep-link)
- `OPEN_ADMIN` message accepts `{ target: 'models' }` → admin opens at `admin.html?view=models`
- **Files**: `browser-ext/components/models/{ModelsManager,DefaultModelAssignments,ProviderCard,ProviderEditModal,providerMeta}.tsx`, `components/AdminLayout.tsx`, `components/SettingsTab.tsx`, `contexts/AppConfig.tsx`, `lib/storage.ts`, `types/index.ts`, `entrypoints/background.ts`; tests `components/models/ModelsManager.test.tsx`, `tests/background.test.ts`, `components/SettingsTab.openAdmin.test.tsx` + 8 fixture updates
- **Complexity**: High | **Depends on**: F14 (Transform), Phase 4 (Ollama), Phase 6 (Cloud)
- **Status**: Done (2026-06-23) — frontend Models Manager shipped (UI + state, local-only key storage). 178 ext tests green (8 new in ModelsManager.test, +2 across background/SettingsTab), tsc clean, Chrome build emits admin.html + sidepanel.html. Backend provider wiring + encrypted DB key storage tracked as Phase 7 remainder (future sprint).

## Dependency Graph

```
F1 (Fetch prompts) <-- F2 (CRUD) <-- F5 (Edit flow)
F1 (Fetch prompts) <-- F4 (Copy/Insert)
F1 (Fetch prompts) <-- F6 (From Saved)
F3 (Save)          <-- F5 (Edit flow)
F7 (Categories)     parallel with F2-F4
F8 (Offline cache)  parallel with F2-F4
F13 (Enhance)       <-- F14 (Transform refactor)
F14 (Transform) + Phase 4 (Ollama) + Phase 6 (Cloud) <-- F15 (Models Manager)
Sprint 3 features are independent of each other
```

## Definition of Done

- All Must-Have features pass acceptance criteria
- PromptsTab loads real data from backend
- Full prompt lifecycle: create -> edit -> copy -> delete
- API tests still passing (`just test`)
- TypeScript compiles clean (`just lint`)
- Extension builds for Chrome (`just build`)
- Sidebar < 200ms, copy latency < 50ms
