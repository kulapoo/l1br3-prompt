# AGENTS.md

Quick-start guide for AI agents working in this repo. Pair with `CLAUDE.md` (architecture overview) and `requirements.md` (full product spec) — this file captures only what those get wrong or omit.

`l1br3-prompt` is a local-first prompt manager: a Python/FastAPI backend (`api/`) + a WXT/React browser extension (`browser-ext/`) + an optional Cloudflare Worker (`workers/cloud-ai/`) that proxies free cloud AI. Backend binds `127.0.0.1:8000` only — never expose it.

## Commands

`just` is the task runner. Run everything from the repo root.

| Recipe | What it actually does |
|--------|----------------------|
| `just dev` | API + extension dev servers (backgrounded, then `wait`) |
| `just test` | **All three** suites: `test-api` + `test-worker` + `test-ext` |
| `just test-api` | `cd api && uv run pytest` |
| `just test-worker` | `cd workers/cloud-ai && pnpm test` (vitest, Cloudflare pool) |
| `just test-ext` | `cd browser-ext && pnpm test` (vitest) |
| `just lint` | `lint-ext` (tsc `--noEmit`) **then** `lint-api` (ruff). **Not** eslint. |
| `just format` | Prettier (ext) + `ruff format` (api) |
| `just build` | `build-api` (PyInstaller → single binary via `api/build.sh`) + `build-ext` (Chrome). **Excludes the worker.** |
| `just deploy-worker` | `wrangler deploy` the Cloudflare Worker |
| `just clean` | Wipe `api/dist`, `api/build`, `browser-ext/.output`, `browser-ext/.wxt` |

Run a single API test: `cd api && uv run pytest tests/test_prompts.py::TestClass::test_method -v`.

Verification order before marking work done: `just test` → `just lint` → `just build` (the `/verify` slash command runs this loop).

## Package managers — do not mix

| Dir | Manager | Notes |
|-----|---------|-------|
| `api/` | `uv` | `uv sync`, `uv run ...`. Python 3.12+. |
| `browser-ext/` | **pnpm** | `pnpm-lock.yaml` is present; there is no `package-lock.json`. |
| `workers/cloud-ai/` | pnpm | Requires `@cloudflare/vitest-pool-workers`. |

Gotcha: the Justfile and older docs call `npm run ...` for `browser-ext`. Those happen to work (they invoke `package.json` scripts), but **use `pnpm install`** — running `npm install` would create a conflicting lockfile. The `package.json` name is still `wxt-react-starter` (boilerplate leftover), not a bug.

## Backend (`api/`)

- **Migrations auto-run on FastAPI startup** via Alembic (`lifespan` in `app/main.py`), **unless `L1BR3_TESTING=1`**. Tests set that flag and manage schema themselves (`tests/conftest.py`) — do not assume `alembic upgrade` runs under pytest.
- **Lint = ruff only.** `pyproject.toml` configures black, isort, and pylint too, but neither the Justfile nor pre-commit invokes them. Ruff handles both lint and format. Line length **120**.
- **Two console scripts**: `l1br3-api` (`app.main:run`) and `l1br3-mcp` (`app.mcp_server:main`). There is an MCP server exposed via `routes/mcp.py` and `app/mcp_server.py` — undocumented in CLAUDE.md.
- **Shared `httpx.AsyncClient`** is created in `app.state.http` during lifespan (10 max connections). Inject/reuse it for outbound calls (Ollama, cloud AI); don't spin up ad-hoc clients.
- All HTTP responses use the `ApiResponse[T]` envelope: `{ success, data, error, metadata }`.
- CORS allowlist (`app/main.py`) covers `chrome-extension://*`, `moz-extension://*`, and localhost ports 5173/4173. Match these when running dev servers.

## Browser extension (`browser-ext/`)

- **WXT generates code** into `.wxt/` (types, entrypoint glue). `postinstall` runs `wxt prepare`. Never hand-edit `.wxt/` or `.output/`.
- **`just lint-ext` = `tsc --noEmit`.** To run eslint: `cd browser-ext && pnpm lint`. To typecheck only: `pnpm compile`.
- Load unpacked from `browser-ext/.output/chrome-mv3-dev` (dev) or `chrome-mv3` (build). Side-panel shortcut: `Ctrl+Shift+Y`.
- Global state lives in `contexts/AppConfig.tsx` (React Context, persisted to `browser.storage.local`). Reach for that before adding new state.

## Workflow conventions

- **The sprint plan is the source of truth** for feature status. Use `/sprint-update` to mutate it — never hand-edit `sprint_plan_current.md`. Check with `/sprint-status` before starting work. Full pipeline: `/sprint-plan → /capability → /plan → /tdd → /verify → /sprint-update`.
- **Commit messages must be Conventional Commits** (`feat:`, `fix:`, etc.) — enforced by `conventional-pre-commit` on the `commit-msg` stage.
- **`detect-secrets` pre-commit hook expects `.secrets.baseline` at repo root, which is currently missing.** First commit will fail until you generate it: `detect-secrets scan > .secrets.baseline`. Pre-commit also runs `mypy --strict` and rejects files >500 KB.
- `.claude/rules/` (`code-style.md`, `api-design.md`, `security.md`, `workflow.md`, plus `python/` and `typescript/` subdirs) holds the real style rules.

## Known doc inaccuracies

- CLAUDE.md, README.md, and CONTRIBUTING.md all describe `just test` as "API tests (pytest)". It runs **all three** suites (see Justfile line 32). Some also claim the extension has "no runtime test suite" — it does (`browser-ext` vitest via `just test-ext`).
- `opencode.jsonc` lists `.opencode/rules/*.md` in `instructions` and `.claude/docs/` as a reference — **neither path exists**. Effective style/workflow rules live in `.claude/rules/`.
