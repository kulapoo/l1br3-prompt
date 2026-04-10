# Phase 4 Plan — Local AI Integration

## Restated requirements (from `requirements.md:170-174`)

1. **Auto-detect & integrate Ollama** at `localhost:11434`
2. **Jinja2 template processing** (`POST /api/v1/process-template`)
3. **MCP server** so Claude Desktop / ChatGPT can use stored prompts as tools
4. **Streaming responses** to the sidebar (`POST /api/v1/generate`)

Plus the implicit acceptance criteria from spec §9: suggestion display still under 150 ms when AI is off, and idle backend memory still under 150 MB.

## Current state (verified, not from memory)

- Phase 1 backend exists: FastAPI mounted in `api/app/main.py:28-52`, layered Route → Service → Repository, `ApiResponse[T]` envelope at `api/app/schemas/envelope.py`, camelCase Pydantic via `to_camel` alias generator.
- **Phase 3 is in flight, not Phase 2** (memory is stale): rule-based suggestions already live at `api/app/services/suggestion_service.py` and are wired into `browser-ext/components/SuggestionsTab.tsx` via `browser-ext/lib/api.ts:9`. Phase 2 sidebar UI is also done — Tiptap editor, AppConfig, content/background scripts.
- Frontend AppConfig already has the **shape** for Phase 4 (`browser-ext/contexts/AppConfig.tsx:36-40` — `localConnected`, `cloudEnabled`, `cloudQuotaRemaining`) but nothing is wired. The Settings model dropdown at `browser-ext/components/SettingsTab.tsx:250-254` is hardcoded.
- `QuickActionSource` already declares `'ollama'` and `'mcp'` variants (`browser-ext/contexts/AppConfig.tsx:3-19`) but **execution is dead** — `ComposeTab.handleModifierAction` (`browser-ext/components/ComposeTab.tsx:139-142`) only calls `handleInsertText(action.insertText)`. Ollama- and MCP-typed modifiers silently behave like local ones today.
- `pyproject.toml` has **none of the Phase 4 deps** — no `jinja2`, no `httpx` at runtime (it's dev-only), no `mcp` SDK.
- No DB schema changes needed for Phase 4.

## Key decisions & risks

| # | Decision | Rationale |
|---|---|---|
| D1 | **httpx → Ollama directly**, no `ollama` SDK dep | One fewer dependency; Ollama's HTTP API is stable and small. Move `httpx` from `[dependency-groups].dev` to `[project].dependencies`. |
| D2 | **SSE for streaming** via `fastapi.responses.StreamingResponse` with `text/event-stream`. Frontend uses `fetch` + `ReadableStream` (not `EventSource`, since we need POST + JSON body) | Already used pattern; works in MV3 sidepanel context. Avoids WebSocket complexity. |
| D3 | **Provider abstraction** — `AIProvider` Protocol with `generate()` and `stream()` so Phase 6 (Cloudflare/Groq) can drop in without service rewrite | Spec already foreshadows this in §3 "Cloud Fallback". |
| D4 | **`SandboxedEnvironment` for Jinja2**, not the default Environment | **CRITICAL**: user prompt content is template input → SSTI is a real risk. `jinja2.sandbox.SandboxedEnvironment` blocks attribute traversal exploits like `{{ ''.__class__.__mro__ }}`. Auto-escape off (output is plain text, not HTML). |
| D5 | **MCP server runs as a separate stdio entry point**, not inside the FastAPI app | The MCP transport model is stdio-based; embedding it inside uvicorn fights the design. New module `api/app/mcp_server.py` + console script `l1br3-mcp = "app.mcp_server:main"` in `pyproject.toml`. It re-uses the same SQLAlchemy models/repositories pointed at the same SQLite file. |
| D6 | **Suggestion AI is opt-in**, not a replacement | Current rule-based path stays the default fast path. New `useAi: bool` field on `SuggestContext`; when true, the AI provider re-ranks/explains the rule-based shortlist. Keeps the <150 ms target intact when AI is off. |
| D7 | **Health endpoint `GET /api/v1/ai/status`** returns `{ ollama: { reachable, models[] }, provider: "ollama" \| null }` | Replaces the hardcoded model list in SettingsTab. Same endpoint feeds the green/red dot. |
| D8 | **Cancel on disconnect** for streaming | `request.is_disconnected()` checked in the async generator; without this, a closed sidepanel leaves the Ollama call hanging until completion. |
| D9 | **No new DB migrations** | AI/model selection lives in extension `localStorage` (already how AppConfig persists). No backend table needed. |

**Risks I will call out in code comments**

- **R1 — SSTI via Jinja2**: mitigated by D4. Add a unit test that asserts `{{ "".__class__.__mro__ }}` is rejected.
- **R2 — Ollama not installed**: every AI call must degrade gracefully. `/suggest` returns rule-based results; `/generate` returns 503 with `ApiResponse.fail("Ollama not reachable at <url>")`; frontend shows the existing amber backend-banner pattern (`SuggestionsTab.tsx:96-106`).
- **R3 — CORS preflight on streaming endpoints**: existing CORS middleware (`main.py:34-47`) allows all methods/headers, so OPTIONS will pass. SSE still needs explicit `Cache-Control: no-cache, no-transform` headers to prevent proxies/extensions from buffering.
- **R4 — Backend memory creep from leaked httpx clients**: use a single module-level `AsyncClient` with a lifespan-managed shutdown (extend `main.py:22-25` lifespan). Don't instantiate per-request.
- **R5 — MCP read-only safety**: MCP tools that read prompts are safe; tools that mutate (create/delete) should be disabled by default and gated by an env var `L1BR3_MCP_ALLOW_WRITE=1`.

---

## Step-by-step implementation

Grouped into 5 commits so each is independently reviewable.

### Step 1 — Dependencies & shared infrastructure

**Files**
- `api/pyproject.toml`
  - Add to `[project].dependencies`: `httpx>=0.28`, `jinja2>=3.1`, `mcp>=1.0` (Python MCP SDK)
  - Add to `[dependency-groups].dev`: `pytest-httpx>=0.30` (for mocking Ollama in tests)
  - Add `[project.scripts]`: `l1br3-mcp = "app.mcp_server:main"`
- `api/app/main.py` — extend lifespan to create + close a module-level `httpx.AsyncClient` and stash it on `app.state.http`.

**Why first**: every other step depends on these.

### Step 2 — Ollama provider + `/ai/status`

**New files**
- `api/app/services/ai/__init__.py`
- `api/app/services/ai/provider.py` — `AIProvider` Protocol with `async generate(prompt, *, model, options) -> str` and `async stream(prompt, *, model, options) -> AsyncIterator[str]`. Also `async health() -> ProviderStatus`.
- `api/app/services/ai/ollama.py` — `OllamaProvider` implementing the Protocol against `POST /api/generate` (with `"stream": true`). Pulls model list via `GET /api/tags`. Reads base URL from env var `L1BR3_OLLAMA_URL` (default `http://127.0.0.1:11434`).
- `api/app/schemas/ai.py` — `ProviderStatus`, `GenerateRequest` (`prompt: str`, `model: str | None = None`, `options: dict | None = None`), `AiStatusResponse` with camelCase aliasing.
- `api/app/routes/ai.py` — `GET /api/v1/ai/status` returning `ApiResponse[AiStatusResponse]`.

**Edits**
- `api/app/main.py` — `app.include_router(ai_router)` (next to the others at line 49-52).
- `browser-ext/lib/api.ts` — add `fetchAiStatus(baseUrl)`.
- `browser-ext/components/SettingsTab.tsx:250-254` — replace hardcoded `<option>` list with the result of `fetchAiStatus`. Show a "no models found" hint with install link to `https://ollama.com` when `models[]` is empty.
- `browser-ext/contexts/AppConfig.tsx` — add `ai.selectedModel: string | null` and `ai.availableModels: string[]` to `AppConfig`.

### Step 3 — `POST /api/v1/generate` (streaming) + `POST /api/v1/process-template`

**New files**
- `api/app/services/template_service.py` — wraps `jinja2.sandbox.SandboxedEnvironment(autoescape=False, undefined=jinja2.StrictUndefined)`. Two methods:
  - `find_variables(template: str) -> list[str]` using `env.parse(...)` + `meta.find_undeclared_variables` — gives the same answer as the frontend regex but handles loops/conditionals.
  - `render(template: str, variables: dict[str, str]) -> str` — raises `TemplateError` mapped to HTTP 400.
- `api/app/routes/generate.py`
  - `POST /api/v1/generate` — returns `StreamingResponse(media_type="text/event-stream")`. The async generator yields SSE frames (`data: {"chunk": "..."}\n\n`) and a final `data: {"done": true}\n\n`. Includes `request.is_disconnected()` check before each chunk write (D8).
  - `POST /api/v1/process-template` — uses `TemplateService.render`, returns `ApiResponse[{ rendered: str, variables: list[str] }]`.

**Edits**
- `api/app/main.py` — register both routers.
- `browser-ext/lib/api.ts` — add `streamGenerate(baseUrl, request, onChunk, signal)` using `fetch` + `response.body.getReader()` + manual SSE frame parsing. Also `processTemplate(baseUrl, template, variables)`.
- `browser-ext/types/index.ts` — add `GenerateRequest`, `ProcessTemplateResponse`, `AiStatus` types.

### Step 4 — Wire AI into the existing UI surfaces

**a) `SuggestionsTab` — opt-in AI re-ranking**
- `api/app/schemas/suggestion.py` — add `use_ai: bool = False` to `SuggestContext`.
- `api/app/services/suggestion_service.py` — when `ctx.use_ai`, after the existing `ranked` list is built (current line 67), call `OllamaProvider.generate()` once with a system prompt that asks for short, contextual descriptions for each shortlisted prompt, then overwrite the `description` field on each `SuggestionResponse`. Cap at top-5 to bound latency. If provider raises, log and return the rule-based result unchanged (R2).
- `browser-ext/components/SuggestionsTab.tsx` — add a small "AI" toggle next to the refresh button that flips a `useAi` state, threaded into the `SuggestContext` passed to `runSuggestions` (line 49).

**b) `ComposeTab` — Ollama-source modifiers actually do something**
- `browser-ext/components/ComposeTab.tsx:139-142` — `handleModifierAction` becomes async. Switch on `action.source.type`:
  - `'local'` → existing behavior (insert static text).
  - `'ollama'` → call `streamGenerate({ prompt: composePromptFor(action, editor.getText()), model: config.ai.selectedModel })`. Pipe chunks into the editor via `editor.chain().focus().insertContent(chunk).run()`. Show a small "Generating…" pill while streaming; cancel on a second click.
  - `'mcp'`, `'api'` → out of scope for Phase 4 (leave as no-ops with a TODO comment that points to Phase 5/6).
- New helper `browser-ext/lib/compose.ts` — `composePromptFor(action, editorText)` builds the system+user prompt. Single function, easy to unit-test.

**c) Live preview uses backend template processing for non-trivial templates**
- `browser-ext/components/ComposeTab.tsx:118-129` — `generatePreview` currently does in-browser regex substitution. Keep that as the fast path for the "no Jinja control structures" case. If the template contains `{% ` or `{# `, fall back to a debounced `processTemplate()` call. This keeps the preview snappy for the common case while unlocking loops/conditionals.

### Step 5 — MCP server

**New files**
- `api/app/mcp_server.py` — entry point. Uses the `mcp` Python SDK's `Server` class with stdio transport. Tools exposed:
  - `list_prompts(query?: str, tag?: str)` — read-only, returns `[{id, title, content, tags, category}]`
  - `get_prompt(id: str)` — read-only
  - `render_prompt(id: str, variables: dict)` — read-only, calls `TemplateService`
  - `create_prompt(...)` — gated behind `L1BR3_MCP_ALLOW_WRITE=1` (R5)
  - `delete_prompt(id)` — same gate
  - `main()` function that opens a session against the same SQLite DB as the FastAPI app (reuses `app.db.engine.SessionLocal`).
- `api/tests/test_mcp_server.py` — instantiate the server in-process and call each tool function directly (don't need to spin stdio); assert read-only tools work, write tools raise without the env var.
- `api/README.md` — add a "Use with Claude Desktop" section showing the JSON snippet for `claude_desktop_config.json` that points at `l1br3-mcp`.

**Why last**: it depends on `TemplateService` from Step 3 and on the DB layer being stable. It does **not** depend on the FastAPI app being running, which is the whole point of D5.

---

## Test plan

| # | Test | Where |
|---|---|---|
| T1 | `OllamaProvider.health()` returns `reachable=False` cleanly when port is closed | `api/tests/test_ai_provider.py` (new) — `pytest-httpx` MockTransport |
| T2 | `OllamaProvider.stream()` yields chunks in order, surfaces `httpx.HTTPError` as `ProviderError` | same |
| T3 | `TemplateService.render` substitutes simple `{{var}}`, supports loops, raises on undefined var (StrictUndefined) | `api/tests/test_template_service.py` (new) |
| T4 | **SSTI test** — `TemplateService.render("{{ ''.__class__.__mro__[1].__subclasses__() }}", {})` raises `SecurityError` | same — this is the most important one |
| T5 | `POST /api/v1/process-template` returns 400 on bad template, 200 on good | `api/tests/test_generate.py` (new) |
| T6 | `POST /api/v1/generate` streams SSE frames; closing the client mid-stream stops the generator | same — use `httpx.AsyncClient` against the FastAPI test app |
| T7 | `POST /api/v1/suggest` with `useAi=true` falls back to rule-based when provider raises | `api/tests/test_suggestions.py` (extend existing) |
| T8 | `GET /api/v1/ai/status` shape | `api/tests/test_ai_routes.py` (new) |
| T9 | MCP `list_prompts` returns DB rows; `create_prompt` raises without `L1BR3_MCP_ALLOW_WRITE` | `api/tests/test_mcp_server.py` (new) |
| T10 | Frontend `streamGenerate` parses multi-frame SSE correctly, including frames split across reads | `browser-ext/lib/__tests__/api.test.ts` (new — Vitest) |

All backend tests use the existing `L1BR3_TESTING=1` conftest pattern (`api/app/main.py:14-15`).

---

## Out of scope (deferred to later phases)

- **Cloud AI fallback** (Groq/Gemini via Cloudflare Worker) — Phase 6. The `AIProvider` Protocol from Step 2 is the seam where it will plug in.
- **WebSocket `/ws`** — spec §5 lists it but Phase 4 only needs streaming, which SSE handles. WebSocket can wait until there's a real bidirectional need (probably Phase 5 sync events).
- **MCP tool execution from inside the extension** — Phase 4 makes l1br3 *expose* an MCP server; *consuming* MCP tools from the QuickAction `'mcp'` source type is its own design (would need an MCP client in the backend).
- **Persisting AI/model selection in the backend** — stays in extension storage for now; revisit when sync (Phase 5) lands.
- **Rate limiting** — `.claude/rules/security.md` requires it on all endpoints, but Ollama is local and cost-free, so per-IP rate limiting on `/generate` is low-value. Add only when cloud AI lands in Phase 6.

---

## Open questions before implementation

1. **MCP SDK choice** — `mcp>=1.0` (the official Python SDK) vs. rolling our own minimal stdio handler. Default: official SDK.
2. **`useAi` toggle UX** — small toggle in `SuggestionsTab` vs. global default in Settings.
3. **Template fallback threshold** — regex preview for simple `{{var}}` and switch to backend for `{%`/`{#` vs. always backend for consistency.
