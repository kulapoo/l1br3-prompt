# Roadmap

> The master **EPIC register** for l1br3-prompt. Every PRD (`docs/prds/*.prd.md`)
> opens against exactly one feature listed here. **Status lives in this file** —
> PRDs reference it by `Epic` + `Feature` ID; when a PRD lands or a feature ships,
> tick the matching box and update the Status Summary table below.
>
> This file is the **single source of truth** for requirements and completion data.

## Table of Contents

- [How to use this doc](#how-to-use-this-doc)
- [Legend](#legend)
- [Status Summary](#status-summary)
- [Versioning & Releases](#versioning--releases)
- [Contributing](#contributing)
- [Project Health](#project-health)
- [Non-Goals](#non-goals)
- [EPIC-1 — Local Backend Foundation](#epic-1--local-backend-foundation--) _✅_
- [EPIC-2 — Sidebar UI (MVP Core)](#epic-2--sidebar-ui-mvp-core--) _✅_
- [EPIC-3 — Transform (AI Prompt Rewriting)](#epic-3--transform-ai-prompt-rewriting--) _✅_
- [EPIC-4 — Local AI Integration (Ollama)](#epic-4--local-ai-integration-ollama--) _✅_
- [EPIC-5 — Multi-Provider Models Manager](#epic-5--multi-provider-models-manager---)
- [EPIC-6 — Pluggable Database Store](#epic-6--pluggable-database-store---)
- [PRD Backlog](#prd-backlog-next-candidates)
- [Dependency Graph](#dependency-graph)
- [Definition of Done](#definition-of-done-per-feature)

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
| ✅ | Done — meets acceptance criteria, tests green (100%) |
| 🔵 | In Progress — some work shipped, more pending |
| ⚪ | Not Started |
| ⛔ | Superseded — replaced by a later feature (kept for history) |

Complexity: **Low** / **Medium** / **High**

> Per-feature status is tracked two complementary ways: the EPIC row uses an emoji
> mark above; individual features use `- [ ]` / `- [x]` checkboxes (and `⛔` when
> superseded). They should agree — update both when a feature ships.

---

## Status Summary

| Epic | Title | Status | Completion |
|------|-------|--------|------------|
| EPIC-1 | Local Backend Foundation | ✅ | 100% |
| EPIC-2 | Sidebar UI (MVP Core) | ✅ | 100% |
| EPIC-3 | Transform (AI Prompt Rewriting) | ✅ | 100% |
| EPIC-4 | Local AI Integration (Ollama) | ✅ | 100% |
| EPIC-5 | Multi-Provider Models Manager | 🔵 | ~40% |
| EPIC-6 | Pluggable Database Store | ⚪ | 0% |

---

## Versioning & Releases

l1br3-prompt follows [Semantic Versioning](https://semver.org/). While the project
is in `0.x` (pre-1.0),minor versions may carry breaking changes; the rules tighten
at `1.0.0`.

| Milestone | Scope | Status |
|-----------|-------|--------|
| `v0.1` | Local-first MVP — EPICs 1–4 (backend, sidebar, transform, Ollama) | ✅ Shipped |
| `v0.2` | Provider breadth — EPIC-5 (Multi-Provider Models Manager) | 🔵 Frontend slice shipped |
| `v0.3` | Data portability — EPIC-6 (Pluggable Database Store) | ⚪ Planned |

No firm calendar dates — the project ships when acceptance criteria are met and
`/verify` passes. Watch [Releases](../../releases) for tagged builds.

---

## Contributing

Contributions are welcome. The project uses a gated, plan-driven workflow:

1. **Find work** — pick a pending `[ ]` item from an EPIC below, or from the
   [PRD Backlog](#prd-backlog-next-candidates).
2. **Plan first** — run `/plan-prd "<idea>"` to draft a PRD at `docs/prds/`, then
   `/plan` to produce an implementation plan. Wait for maintainer confirmation
   before writing code.
3. **TDD** — follow the RED-GREEN-REFACTOR cycle (see
   [common/testing.md](../.opencode/rules/common/testing.md)).
4. **Verify** — `just test` (both suites), `just lint`, and
   `pre-commit run --all-files` must all pass before review.
5. **Commit** — Conventional Commit format (`feat(api):`, `fix(ext):`, …) is
   enforced by a `commit-msg` hook.

> **Note:** A standalone `CONTRIBUTING.md` does not yet exist; this section is the
> canonical contributor guide in the meantime. TODO: extract it.

Useful commands (run from repo root, requires [just](https://just.systems/)):

| Command | Description |
|---|---|
| `just install` | Install all dependencies (uv + pnpm) |
| `just dev` | Run API + extension dev server concurrently |
| `just test` | Run both test suites (api, ext) |
| `just lint` | `tsc --noEmit` (ext) + `ruff check` (api) |
| `just format` | Prettier (ext) + Ruff format (api) |
| `just build` | Build API (PyInstaller) + Chrome extension |

---

## Project Health

> Maintainers: refresh these numbers periodically.

| Metric | Value | Last updated |
|--------|-------|--------------|
| Test suites | 2 (api / ext) | — |
| API test count | _TBD_ | — |
| Extension test count | _TBD_ | — |
| Latest release | _none yet (pre-1.0)_ | — |
| License | [MIT](../LICENSE) | — |

---

## Non-Goals

To keep scope focused and contributor expectations clear, the following are
**explicitly out of scope** for l1br3-prompt:

- **No telemetry.** The browser extension and local backend do not phone home.
- **No account required.** The core loop (CRUD, search, transform, local AI)
  works fully offline with no signup.
- **No public server.** The FastAPI backend binds `127.0.0.1` only — never
  exposed publicly. Do not deploy it behind a reverse proxy without auth hardening.
- **No mobile / native desktop shell.** The product is a browser extension
  sidebar (Chrome + Firefox). A standalone desktop app is not planned.
- **No proprietary model hosting.** AI inference runs on the user's local Ollama
  or their own BYOK provider keys. We do not host or re-sell model access.

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
- [x] **F9 — Admin / Dashboard view mode** · *Medium*
  `GET /api/v1/prompts/stats`, `usePromptStats` hook + cache, `AnalyticsPanel`,
  `AdminLayout` tabbed right column, dedicated `entrypoints/admin/` page, Settings
  "Open Admin Mode" → background `OPEN_ADMIN` → new tab; `viewMode` persisted.
  *PRD: —*

---

## EPIC-3 — Transform (AI Prompt Rewriting)  ✅

One-shot AI prompt rewriting built into the Compose tab. Streamed, combinable modes,
saved custom modes, selection-aware. Replaces the standalone Enhance tab.

- [x] **F11 — Enhance tab (standalone)** · *Medium* · depends on F6 · ⛔ **Superseded by F12**
  Backend `/enhance` SSE + `EnhanceTab`. Removed in F12; the capability migrated into
  Compose as Transform. *Kept for history.*
  *PRD: —*
- [x] **F12 — Transform refactor: migrate Enhance into Compose** · *High* · depends on F11
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
- [x] **F10 — API/MCP modifier sources** · *High*
  `api`/`mcp` modifier sources wired in ComposeTab, backend `/mcp/call` route
  (read-only; writes gated on `L1BR3_MCP_ALLOW_WRITE`), graceful static-text fallback
  + amber error banners.
  *PRD: —*

---

## EPIC-5 — Multi-Provider Models Manager  🔵  (~40%)

Bring-your-own-key providers (OpenAI, Anthropic, OpenAI-compatible) alongside Local
(Ollama), with per-purpose Default Model Assignments. **Frontend slice shipped;
backend provider wiring + encrypted key storage pending.**

- [x] **F13 — AI Models Manager (frontend)** · *High* · depends on F12, EPIC-4
  Admin "Models" view: provider cards + per-purpose Default Model Assignments
  (Chat = `/generate`, Transformation = `/transform`); Test/Models/Edit/Delete; removable
  model pills; Auto-assign; missing-required-model warning. Config in `AppConfig.ai`
  (`providers`, `assignments`), keys in `browser.storage.local`; Settings AI summary card
  with "Manage models →" deep-link; `OPEN_ADMIN { target:'models' }`.
  *PRD: [multi-provider-models-manager.prd.md](prds/multi-provider-models-manager.prd.md)*
- [ ] **F14 — Real upstream provider classes** · *High* · depends on F13
  Backend OpenAI / Anthropic / OpenAI-compatible provider implementations behind a common
  interface (streaming, error mapping, model listing). *PRD: —*
- [ ] **F15 — Role-aware `resolve_provider`** · *High* · depends on F14
  Route Chat → Chat default model, Transformation → Transformation default model;
  resolve through provider stack (local → BYOK) honoring user assignments.
  *PRD: —*
- [ ] **F16 — Encrypted backend key storage** · *High* · depends on F13
  Move BYOK keys from `browser.storage.local` to encrypted server-side storage bound to
  `127.0.0.1`. *PRD: —*

---

## EPIC-6 — Pluggable Database Store  ⚪  (0%)

User-managed backend database engine and location. Replace the hardcoded
single-SQLite-file assumption with a pluggable store (default SQLite, plus
PostgreSQL), a Database Manager settings page mirroring the Models Manager,
and a migration wizard for switching engines without data loss.

- [ ] **F17 — Pluggable database store** · *High*
  Engine abstraction behind common interface (SQLite + PostgreSQL); Postgres
  search-index fallback for FTS5; Database Manager UI (engine select, guided
  form + connection-string, test-connection, set-active); migration wizard
  with progress + rollback.
  *PRD: [pluggable-database-store.prd.md](prds/pluggable-database-store.prd.md)*

---

## PRD Backlog (next candidates)

Ordered by dependency readiness. Open a PRD (`/plan-prd`) against the first pending item
its EPIC can unblock.

1. **F17** — Pluggable database store (unblocks data portability; functional MVP prioritized, security hardening follows)
2. **F14** — Real upstream provider classes (unblocks F15; EPIC-5 backend slice)
3. **F15** — Role-aware `resolve_provider` (unblocks end-to-end BYOK)
4. **F16** — Encrypted backend key storage (security follow-up to F13)

---

## Dependency Graph

```
Foundation
  EPIC-1 (Backend) ── foundation for all

Local AI
  EPIC-4 (Ollama) ──► F11 (Enhance, ⛔) ──► F12 (Transform)
                                        │
                                        └──► F13 (Models FE) ──► F14 (providers) ──► F15 (resolve_provider)
                                                                └──► F16 (encrypted keys)

Sidebar (EPIC-2)
  F1 ◄── F2 ◄── F5
  F1 ◄── F4
  F1 ◄── F6
  F3 ◄── F5
  F7, F8, F9 parallel to F2–F4

Pluggable DB (EPIC-6)
  F17 (pluggable store) — functional MVP; encrypted credential storage follows
```

---

## Definition of Done (per feature)

- Acceptance criteria for the feature met (not just "tests green")
- `just test` passes — **both suites**: API (`pytest`), Extension (vitest)
- `just lint` clean — `tsc --noEmit` (ext) + `ruff check .` (api); ruff introduces
  0 new errors
- `pre-commit run --all-files` passes — includes **mypy --strict**, eslint, prettier,
  ruff fix+format, detect-secrets
- `just build` succeeds — Chrome build emits expected `admin.html` + `sidepanel.html`
- Box ticked `- [x]` here + Status Summary % updated (and legend mark reconciled)
- Linked PRD path filled in (if one exists)

---

## See also

- [README.md](../README.md) — project overview, setup, commands
- [docs/glossary.md](glossary.md) — domain terminology
- [PRDs](prds/) — feature requirement docs
- [LICENSE](../LICENSE) — MIT
