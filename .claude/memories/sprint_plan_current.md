---
name: Current Sprint Plan
description: Structured sprint plan for remaining work across Phases 2, 3, and 5 — prompt CRUD wiring, suggestions polish, sync improvements
type: project
originSessionId: b9b63de3-64bf-4bcc-be05-05b565b0a2a8
---
# Sprint Plan: Remaining Roadmap — Phases 2, 3 & 5 Completion

Created: 2026-04-12

## Status Summary

| Phase | Status | Completion |
|-------|--------|------------|
| 1 — Local Backend | Done | 100% |
| 2 — Sidebar UI | In Progress | ~95% |
| 3 — Context-Aware Suggestions | In Progress | ~70% |
| 4 — Local AI (Ollama) | Done | 100% |
| 5 — Cloud Sync (Supabase) | In Progress | ~85% |
| 6 — Cloud AI Fallback | Done | ~95% |

## Goal

Finish the browser extension MVP by wiring existing UI components to the backend, then polish suggestion and sync experiences. UI scaffolding and backend endpoints are both solid — what's missing is the glue between them.

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
- **Status**: Not started

### F6. SuggestionsTab: "From Saved" Button
- Open searchable prompt picker; selecting populates input textarea
- **Files**: `browser-ext/components/SuggestionsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Low
- **Depends on**: F1
- **Status**: Not started

### F7. Category Management
- Category dropdown in ComposeTab (from `GET /api/v1/categories`)
- Category filter in PromptsTab
- **Files**: `browser-ext/components/ComposeTab.tsx`, `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/api.ts`
- **Complexity**: Low
- **Status**: Not started

### F8. Offline Prompt Cache
- Cache last-fetched prompts in `browser.storage.local`
- Load from cache when backend offline with "Offline" banner
- Invalidate on CRUD operations
- **Files**: `browser-ext/components/PromptsTab.tsx`, `browser-ext/lib/storage.ts`
- **Complexity**: Low
- **Status**: Not started

---

## Sprint 3+ — Nice-to-Have

### F9. Supabase Realtime Sync
- Replace 5-min polling with Realtime WebSocket subscription
- **Complexity**: High | **Status**: Not started

### F10. Sync Conflict Resolution UI
- Detect concurrent edits, show merge dialog
- **Complexity**: High | **Status**: Not started

### F11. Admin/Dashboard View Mode
- Wire `AdminLayout.tsx` to viewMode config; prompt analytics
- **Complexity**: Medium | **Status**: Not started

### F12. API/MCP Modifier Sources
- Wire `api` and `mcp` modifier sources in ComposeTab (line 220 TODO)
- **Complexity**: High | **Status**: Not started

---

## Dependency Graph

```
F1 (Fetch prompts) <-- F2 (CRUD) <-- F5 (Edit flow)
F1 (Fetch prompts) <-- F4 (Copy/Insert)
F1 (Fetch prompts) <-- F6 (From Saved)
F3 (Save)          <-- F5 (Edit flow)
F7 (Categories)     parallel with F2-F4
F8 (Offline cache)  parallel with F2-F4
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
