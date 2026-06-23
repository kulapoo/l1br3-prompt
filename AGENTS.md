# AGENTS.md

High-signal operating notes for OpenCode sessions. For architecture, file trees,
and phase status see `CLAUDE.md` and `README.md`; for the gated dev process
(`/plan → /tdd → /verify → /checkpoint`) see `.opencode/rules/workflow.md`
(auto-loaded via `opencode.jsonc`).

## Packages & toolchains

Three independently-versioned packages. Do not cross-wire tooling:

| Package | Manager | Run | Entry |
|---|---|---|---|
| `api/` | **uv** (Python 3.12+) | `uv run ...` | `app.main:app`, binds `127.0.0.1:8000` only |
| `browser-ext/` | **pnpm** (`pnpm-lock.yaml` is the lockfile of record) | see below | WXT entrypoints in `entrypoints/` |
| `workers/cloud-ai/` | **pnpm** | `pnpm ...` | Cloudflare Worker, `src/index.ts` |

**browser-ext gotcha:** `pnpm-lock.yaml` is committed, but the Justfile drives
dev/build/install through `npm`. To stay consistent, use **pnpm** for installs
and tests (`pnpm install`, `pnpm test`); `npm run dev`/`build` also work because
they read the same `package.json`. WXT entrypoints: `sidepanel`, `background`,
`content`, and `admin` (the dashboard view — not listed in CLAUDE.md).

## Commands (`just` from repo root)

- `just dev` — API + extension concurrently. `just dev-api` / `just dev-ext` / `just dev-ext-ff` for one.
- `just test` — runs all three suites. Subcommands: `test-api`, `test-worker`, `test-ext`.
- `just lint` — **see warning below**, not a full check.
- `just format` — Prettier (ext) + Ruff format (api).
- `just build` — API via PyInstaller (`api/build.sh` → `dist/l1br3`) + Chrome ext. Firefox: `just build-ext-ff`.

### `just lint` is NOT a complete gate

`just lint` runs only `tsc --noEmit` (ext) and `ruff check .` (api). It does
**not** run mypy, eslint, or prettier — those run exclusively through
`pre-commit` (`.pre-commit-config.yaml`: ruff fix+format, eslint, prettier,
**mypy --strict**, detect-secrets, conventional commit-msg). Before claiming
"clean," either run `pre-commit run --all-files` or invoke the missing tools
directly: `cd api && uv run mypy app`; `cd browser-ext && npm run lint`.

Focused test runs:

- API one test: `cd api && uv run pytest tests/test_prompts.py -k test_name`
- API one file: `cd api && uv run pytest tests/test_transform.py`
- Ext: `cd browser-ext && pnpm test -t "name"` (vitest, jsdom, setup in `tests/setup.ts`)
- Worker: `cd workers/cloud-ai && pnpm test` (Miniflare; providers mocked via `vi.stubGlobal('fetch')`, no real keys)

## Database & migrations (api/)

- **Migrations auto-run on app startup** (`app/main.py` lifespan → `alembic upgrade head`), skipped when `L1BR3_TESTING=1`.
- `alembic.ini` has an empty `sqlalchemy.url`; `migrations/env.py` pulls it from `app.db.engine.DATABASE_URL`.
- DB path: `L1BR3_DB_PATH` env, default `~/.l1br3/l1br3.db`.
- Create a migration (not in Justfile): `cd api && uv run alembic revision --autogenerate -m "desc"`.
- **Tests bypass Alembic entirely.** `tests/conftest.py` builds tables from models (`Base.metadata.create_all`) and **manually** creates the `prompts_fts` FTS5 virtual table + triggers. Changing the `prompts` model means updating both a migration **and** the FTS SQL in `conftest.py`.

## Environment variables

| Var | Effect |
|---|---|
| `L1BR3_TESTING=1` | Skip auto-migrations (set automatically by conftest) |
| `L1BR3_DB_PATH` | SQLite location (default `~/.l1br3/l1br3.db`) |
| `L1BR3_SQL_ECHO=1` | Log all SQL from the engine |
| `L1BR3_CLOUD_AI_URL` | Point API at your Cloudflare Worker (default may not exist yet — see `workers/cloud-ai/README.md`) |

Worker secrets (`GROQ_API_KEY`, `GEMINI_API_KEY`) are set via `wrangler secret put`,
never in `wrangler.toml`. The committed `wrangler.toml` has **placeholder KV
namespace IDs** — replace after `wrangler kv namespace create` before deploy.

## API wire conventions

- All responses use the `ApiResponse[T]` envelope: `{ success, data, error, metadata }`.
- `/generate` and `/transform` are **SSE** streams (`{meta}/{chunk}/{done}/{error}` frames). Test with a streaming client, not plain `client.post`.
- CORS is restricted to `chrome-extension://*`, `moz-extension://*`, and `localhost:{4173,5173}`. Server binds `127.0.0.1` only — never expose publicly.

## Style (deviates from defaults)

Configured in `api/pyproject.toml` (ruff/black, line-length **120**,
`skip-string-normalization` → double quotes) and root `.prettierrc`
(printWidth **120**, `semi: false`, `singleQuote: false` → double quotes).

- **120 columns** everywhere (not the usual 80/88).
- **No semicolons, double quotes** in TS — do not reformat existing code to single quotes.
- Python: double quotes, 4-space indent; `list[T]` over `List[T]`. mypy `--strict` in pre-commit.

## Commits

Conventional Commit format is **enforced** by a `commit-msg` hook
(`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`).
Use `feat(ext):`, `feat(api):`, etc. for scope. Never commit secrets —
`detect-secrets` runs with a baseline.
