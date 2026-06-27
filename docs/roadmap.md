# Roadmap

> The master **EPIC register** for l1br3-prompt and the **single source of truth**
> for requirements and completion data. Every PRD (`docs/prds/*.prd.md`) opens
> against exactly one feature listed here, referenced by `Epic` + `Feature` ID.
> When a feature ships, tick its box and update the [Status Summary](#status-summary).

## Table of Contents

- [Status Summary](#status-summary)
- [Legend](#legend)
- [EPIC-1 — Local Backend Foundation](#epic-1--local-backend-foundation) ✅
- [EPIC-2 — Sidebar UI (MVP Core)](#epic-2--sidebar-ui-mvp-core) ✅
- [EPIC-3 — Transform (AI Prompt Rewriting)](#epic-3--transform-ai-prompt-rewriting) ✅
- [EPIC-4 — Local AI Integration (Ollama)](#epic-4--local-ai-integration-ollama) ✅
- [EPIC-5 — Multi-Provider Models Manager](#epic-5--multi-provider-models-manager) ✅
- [EPIC-6 — Pluggable Database Store](#epic-6--pluggable-database-store) ✅
- [Dependency Graph](#dependency-graph)
- [PRD Backlog](#prd-backlog)
- [Contributing](#contributing)
- [Definition of Done](#definition-of-done-per-feature)
- [Versioning & Releases](#versioning--releases)
- [Project Health](#project-health)
- [Non-Goals](#non-goals)
- [See also](#see-also)

---

## Status Summary

| Epic   | Title                           | Status | Completion |
| ------ | ------------------------------- | ------ | ---------- |
| EPIC-1 | Local Backend Foundation        | ✅     | 100%       |
| EPIC-2 | Sidebar UI (MVP Core)           | ✅     | 100%       |
| EPIC-3 | Transform (AI Prompt Rewriting) | ✅     | 100%       |
| EPIC-4 | Local AI Integration (Ollama)   | ✅     | 100%       |
| EPIC-5 | Multi-Provider Models Manager   | ✅     | 100%       |
| EPIC-6 | Pluggable Database Store        | ✅     | 100%       |

> EPIC-6 complete: pluggable database store (F17), encrypted credential
> storage (F18), and cross-host master-key portability (F19) all shipped.

---

## Legend

| Mark | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| ✅   | Done — meets acceptance criteria, tests green               |
| 🔵   | In Progress — some work shipped, more pending               |
| ⚪   | Not Started                                                 |
| ⛔   | Superseded — replaced by a later feature (kept for history) |

Complexity: **Low** / **Medium** / **High**

EPIC-level status lives in the [Status Summary](#status-summary) table above.
Individual features use `- [ ]` / `- [x]` checkboxes (and `⛔` when superseded).
Keep both in sync when a feature ships.

---

## EPIC-1 — Local Backend Foundation

FastAPI + SQLite + SQLAlchemy (FTS5), CRUD/search/tag/category, PyInstaller
packaging, WXT extension skeleton. Foundational — no tracked feature PRDs.

- [x] FastAPI service bound to `127.0.0.1:8000`, `ApiResponse[T]` envelope
- [x] SQLite + Alembic migrations, FTS5 search
- [x] Prompts CRUD + categories/tags endpoints
- [x] Health + AI status endpoints

---

## EPIC-2 — Sidebar UI (MVP Core)

Chrome Side Panel API + Firefox `sidebar_action`. React sidebar wired to the
backend: prompt library, search/filter, inline CRUD, rich editor, content-script
injection, admin/dashboard mode. _Glue between existing UI and backend._

- [x] **F1 — PromptsTab: replace mock data with backend** · _Medium_
      Fetch from `GET /api/v1/prompts` (React Query, `usePrompts`), debounced search,
      tag/favorite filters, loading + error/retry states, nullable `lastUsed`.
      _PRD: —_
- [x] **F2 — Prompt CRUD in UI** · _Medium_ · depends on F1
      Delete/toggle-favorite/record-copy mutations with optimistic updates,
      delete-confirm dialog, create stub wired to empty-state.
      _PRD: —_
- [x] **F3 — ComposeTab: save to backend** · _Medium_
      `useCreatePrompt`, free-text tag input, backend-offline banner, "Saved!" flash →
      auto-switch to PromptsTab, `activeTab` lifted into AppConfig.
      _PRD: —_
- [x] **F4 — Copy-to-clipboard + content-script insertion** · _Low_ · depends on F1
      `insertIntoActiveTab` helper, hardened `handleCopy`, honest error state on
      clipboard failure, usage-count increment via `POST /{id}/copy`.
      _PRD: —_
- [x] **F5 — Cross-tab state: edit-prompt flow** · _Medium_ · depends on F2, F3
      `navigateTo(tab, state?)` via AppConfig context, ComposeTab accepts
      `editingPrompt`, vitest save-branch tests.
      _PRD: —_
- [x] **F6 — "From Saved" picker** · _Low_ · depends on F1
      `FromSavedPicker` overlay, offline cache + banner. (Originally in
      SuggestionsTab; pattern reused by Transform/Enhance.)
      _PRD: —_
- [x] **F7 — Category management** · _Low_
      `useCategories` hook, datalist-backed ComposeTab input, emerald filter pills
      in PromptsTab, offline-cache fallback.
      _PRD: —_
- [x] **F8 — Offline prompt cache** · _Low_
      Last-fetched prompts cached in `browser.storage.local`, loaded when backend
      offline with banner; invalidated on CRUD. (ACs met by F1/F2/F7; dead cache
      helpers removed.)
      _PRD: —_
- [x] **F9 — Admin / Dashboard view mode** · _Medium_
      `GET /api/v1/prompts/stats`, `usePromptStats` hook + cache, `AnalyticsPanel`,
      `AdminLayout` tabbed right column, dedicated `entrypoints/admin/` page, Settings
      "Open Admin Mode" → background `OPEN_ADMIN` → new tab; `viewMode` persisted.
      _PRD: —_

---

## EPIC-3 — Transform (AI Prompt Rewriting)

One-shot AI prompt rewriting built into the Compose tab. Streamed, combinable
modes, saved custom modes, selection-aware. Replaces the standalone Enhance tab.

- [x] **F11 — Enhance tab (standalone)** · _Medium_ · depends on F6 · ⛔ **Superseded by F12**
      Backend `/enhance` SSE + `EnhanceTab`. Removed in F12; the capability migrated
      into Compose as Transform. _Kept for history._
      _PRD: —_
- [x] **F12 — Transform refactor: migrate Enhance into Compose** · _High_ · depends on F11
      Enhance→Transform rename across BE/FE/schema. `POST /api/v1/transform` SSE
      (combined modes → single meta-prompt) + `/transform-modes` CRUD + migration
      `003_transform_modes`. In-Compose `TransformPanel`: multi-select chips, saved
      custom modes, selection-aware transform, whole-text confirmation dialog,
      placeholder-removal directive.
      _PRD: —_

---

## EPIC-4 — Local AI Integration (Ollama)

Auto-detect Ollama, Jinja2 template processing, MCP server, streaming to sidebar.

- [x] Ollama detection + `/generate` SSE streaming
- [x] Jinja2 `/process-template`
- [x] **F10 — API/MCP modifier sources** · _High_
      `api`/`mcp` modifier sources wired in ComposeTab, backend `/mcp/call` route
      (read-only; writes gated on `L1BR3_MCP_ALLOW_WRITE`), graceful static-text
      fallback + amber error banners.
      _PRD: —_

---

## EPIC-5 — Multi-Provider Models Manager

Bring-your-own-key providers (OpenAI, Anthropic, OpenAI-compatible) alongside
Local (Ollama), with per-purpose Default Model Assignments. **Frontend, backend
provider wiring, role-aware routing, and encrypted server-side key storage all
shipped.**

- [x] **F13 — AI Models Manager (frontend)** · _High_ · depends on F12, EPIC-4
      Admin "Models" view: provider cards + per-purpose Default Model Assignments
      (Chat = `/generate`, Transformation = `/transform`); Test/Models/Edit/Delete;
      removable model pills; Auto-assign; missing-required-model warning. Config in
      `AppConfig.ai` (`providers`, `assignments`), keys in `browser.storage.local`;
      Settings AI summary card with "Manage models →" deep-link; `OPEN_ADMIN { target:
'models' }`.
      _PRD: [multi-provider-models-manager.prd.md](prds/multi-provider-models-manager.prd.md)_
- [x] **F14 — Real upstream provider classes** · _High_ · depends on F13
      Backend OpenAI / Anthropic / OpenAI-compatible provider implementations behind
      a common interface (streaming, error mapping, model listing). _PRD: —_
- [x] **F15 — Role-aware `resolve_provider`** · _High_ · depends on F14
      Route Chat → Chat default model, Transformation → Transformation default model;
      resolve through provider stack (local → BYOK) honoring user assignments.
      _PRD: —_
- [x] **F16 — Encrypted backend key storage** · _High_ · depends on F13
      Move BYOK keys from `browser.storage.local` to encrypted server-side storage
      bound to `127.0.0.1`. _PRD: —_

---

## EPIC-6 — Pluggable Database Store

User-managed backend database engine and location. The hardcoded
single-SQLite-file assumption is replaced with a pluggable store (default SQLite
and PostgreSQL), a Database Manager settings page mirroring the Models Manager,
and a streaming migration wizard. **Functional MVP shipped (F17); encrypted
credential storage shipped (F18); cross-host master-key portability shipped
(F19).**

- [x] **F17 — Pluggable database store** · _High_
      Engine abstraction behind a common interface (SQLite and PostgreSQL); Postgres
      search-index fallback for FTS5; Database Manager UI (engine select, guided form
      and connection-string, test-connection, set-active); migration wizard with
      streaming progress + rollback-on-failure.
      _PRD: [pluggable-database-store.prd.md](prds/pluggable-database-store.prd.md)_
- [x] **F18 — Encrypted DB credential storage** · _High_ · depends on F17
      Encrypt DB connection credentials at rest; redact secrets in error paths and
      migration logs. Security-hardening follow-up to F17 (mirrors F16's role in
      EPIC-5). Whole-URL Fernet encryption in `connection_store` (reuses F16's
      master key); transparent F17-plaintext upgrade; boot fallback to SQLite +
      `undecryptable` flag; sidebar banner + connection-card flag.
      _PRD: [encrypted-db-credential-storage.prd.md](prds/encrypted-db-credential-storage.prd.md)_
- [x] **F19 — Cross-host master-key portability** · _Medium_ · depends on F18
      Resolve the `ai_providers.encrypted_api_key` ciphertext portability gap surfaced
      during F17/F18: migrating a DB to a host whose `~/.l1br3/master.key` differs
      leaves every BYOK key undecryptable. Master-key export/import flow: scrypt +
      Fernet passphrase-protected JSON bundle, three endpoints under
      `/api/v1/security/master-key/`, MasterKeyPanel in the Database Manager with
      export/import modals + overwrite confirmation + env-override refusal.
      _PRD: [cross-host-master-key-portability.prd.md](prds/cross-host-master-key-portability.prd.md)_

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
  F17 (pluggable store) ──► F18 (encrypted DB credentials) ──► F19 (cross-host key portability)
```

---

## PRD Backlog

Ordered by dependency readiness. The next pending item its EPIC can unblock.

_All roadmap features shipped — backlog empty. (F17 pluggable database store,
F18 encrypted DB credentials, F19 cross-host master-key portability.)_

---

## Contributing

Contributions follow a gated, plan-driven workflow: pick work, plan it, build
with TDD, verify, then commit. (A standalone `CONTRIBUTING.md` does not yet
exist; this section is the canonical contributor guide in the meantime.)

### Finding work

Pick a pending `[ ]` item from an EPIC above, or from the [PRD Backlog](#prd-backlog).

### Opening a PRD

1. Brainstorm via the `brainstorming` skill → drafts `docs/prds/{name}.prd.md`.
2. Set the PRD front-matter to reference the roadmap:
   ```yaml
   epic: EPIC-2 # from the Status Summary table
   feature: F1 # from the EPIC checklist (or "NEW" for an unlisted feature)
   ```
3. Produce the implementation plan via the `writing-plans` skill →
   `docs/plans/{name}.plan.md`. **Wait for maintainer confirmation before
   writing code.**
4. Link the PRD next to the feature: `PRD: docs/prds/{name}.prd.md`.

> The full skill chain (brainstorm → plan → implement → review → verify → finish
> → status) is documented in
> [`.opencode/rules/workflow.md`](../.opencode/rules/workflow.md).

> **Adding a new feature?** Append it to the relevant EPIC's checklist with a new
> `F##` id before opening its PRD. The roadmap is the index — don't let PRDs
> dangle without an entry here.

### Build & verify

- **TDD** — follow the RED-GREEN-REFACTOR cycle
  (see [common/testing.md](../.opencode/rules/common/testing.md)).
- **Verify** — `just test` (both suites), `just lint`, and
  `pre-commit run --all-files` must all pass before review.
- **Commit** — Conventional Commit format (`feat(api):`, `fix(ext):`, …) is
  enforced by a `commit-msg` hook.

When a feature ships: change `- [ ]` to `- [x]`, update the Status Summary `%`,
and reconcile the EPIC mark in the same table.

### Commands (run from repo root, requires [just](https://just.systems/))

| Command        | Description                                 |
| -------------- | ------------------------------------------- |
| `just install` | Install all dependencies (uv + pnpm)        |
| `just dev`     | Run API + extension dev server concurrently |
| `just test`    | Run both test suites (api, ext)             |
| `just lint`    | `tsc --noEmit` (ext) + `ruff check` (api)   |
| `just format`  | Prettier (ext) + Ruff format (api)          |
| `just build`   | Build API (PyInstaller) + Chrome extension  |

---

## Definition of Done (per feature)

- Acceptance criteria for the feature met (not just "tests green")
- `just test` passes — **both suites**: API (`pytest`), Extension (vitest)
- `just lint` clean — `tsc --noEmit` (ext) + `ruff check .` (api); ruff introduces
  0 new errors
- `pre-commit run --all-files` passes — includes **mypy --strict**, eslint,
  prettier, ruff fix+format, detect-secrets
- `just build` succeeds — Chrome build emits expected `admin.html` +
  `sidepanel.html`
- Box ticked `- [x]` here + Status Summary `%` updated (and legend mark
  reconciled)
- Linked PRD path filled in (if one exists)

---

## Versioning & Releases

l1br3-prompt follows [Semantic Versioning](https://semver.org/). While the
project is in `0.x` (pre-1.0), minor versions may carry breaking changes; the
rules tighten at `1.0.0`.

| Milestone | Scope                                                             | Status           |
| --------- | ----------------------------------------------------------------- | ---------------- |
| `v0.1`    | Local-first MVP — EPICs 1–4 (backend, sidebar, transform, Ollama) | ✅ Shipped       |
| `v0.2`    | Provider breadth — EPIC-5 (Multi-Provider Models Manager)         | ✅ Shipped       |
| `v0.3`    | Data portability — EPIC-6 (Pluggable Database Store)              | ✅ Shipped (MVP) |

> v0.3 delivered data portability (F17), at-rest encryption (F18), and
> cross-host master-key portability (F19).

No firm calendar dates — the project ships when acceptance criteria are met and
the verify gate is green. Watch [Releases](../../releases) for tagged builds.

---

## Project Health

> Maintainers: refresh these numbers periodically.

| Metric               | Value                | Last updated |
| -------------------- | -------------------- | ------------ |
| Test suites          | 2 (api / ext)        | 2026-06-27   |
| API test count       | 332 (320 + 12 skipped) | 2026-06-27   |
| Extension test count | 154                  | 2026-06-27   |
| Latest release       | _none yet (pre-1.0)_ | 2026-06-27   |
| License              | [MIT](../LICENSE)    | —            |

---

## Non-Goals

To keep scope focused, the following are **explicitly out of scope**:

- **No telemetry.** The extension and local backend do not phone home.
- **No account required.** The core loop (CRUD, search, transform, local AI)
  works fully offline with no signup.
- **No public server.** The FastAPI backend binds `127.0.0.1` only. Do not deploy
  it behind a reverse proxy without auth hardening.
- **No mobile / native desktop shell.** The product is a browser extension
  sidebar (Chrome + Firefox); a standalone desktop app is not planned.
- **No proprietary model hosting.** AI inference runs on the user's local Ollama
  or their own BYOK provider keys. We do not host or re-sell model access.

---

## See also

- [README.md](../README.md) — project overview, setup, commands
- [docs/glossary.md](glossary.md) — domain terminology
- [PRDs](prds/) — feature requirement docs
- [LICENSE](../LICENSE) — MIT
