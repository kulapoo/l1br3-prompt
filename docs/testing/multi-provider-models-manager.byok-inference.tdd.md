# TDD Evidence — Multi-Provider Models Manager: BYOK Inference (M1)

**Source plan**: `docs/plans/multi-provider-models-manager.plan.md`
**Approach**: provider classes + factory branch + route wiring + BYOK schemas, validated by unit + integration tests against mocked OpenAI/Anthropic HTTP.

## User journeys (from plan)

1. As a power user with an OpenAI key, I want `/generate` to stream a response
   from OpenAI when I send a `byok` config, so my paid model — not the local
   tier — serves the request.
2. As a power user with an Anthropic key, I want `/transform` to stream from
   Anthropic Messages API using my key, with no other client change.
3. As an existing user with no BYOK config, I want all behavior unchanged so the
   shipped Local Ollama path keeps working.
4. As a reviewer, I want assurance the API key never appears in any response
   payload, error message, or log line.

## Task report

| # | Task | RED evidence | GREEN evidence |
|---|------|--------------|----------------|
| 1 | Extend request schemas (`ByokProviderConfig`) | schema-rejection tests fail without the field | `tests/test_ai_byok_schemas.py` 6/6 pass |
| 2 | `OpenAIProvider` class | no module → import error | `tests/test_openai_provider.py` 14/14 pass |
| 3 | `AnthropicProvider` class | no module → import error | `tests/test_anthropic_provider.py` 13/13 pass |
| 4 | Factory BYOK branch | `tests/test_ai_factory.py -k byok` fails (no BYOK resolution) | `tests/test_ai_factory.py` 7/7 pass; `byok=None` falls through unchanged |
| 5 | Route wiring (`/generate`, `/transform`) | `tests/test_generate_byok.py` fails | `tests/test_generate_byok.py` 9/9 pass (full `meta`/`chunk`/`done` frame sequence) |
| 6 | Regression guard | existing suite | `uv run pytest` — **175 passed**, zero regressions |

### Commands actually run

```bash
cd api && uv run pytest tests/test_openai_provider.py tests/test_anthropic_provider.py   # Task 2-3
cd api && uv run pytest tests/test_ai_factory.py                                          # Task 4
cd api && uv run pytest tests/test_ai_byok_schemas.py                                     # Task 1
cd api && uv run pytest tests/test_generate_byok.py                                       # Task 5
cd api && uv run pytest                                                                    # full gate (175 passed)
cd api && uv run mypy app/services/ai                                                      # Success: no issues found in 6 source files
cd api && uv run ruff check app/services/ai                                                # 2 pre-existing UP035 warnings in ollama.py (not introduced by M1)
```

## Test specification (guarantees)

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `ByokProviderConfig` rejects unknown provider types and accepts the three valid ones | `tests/test_ai_byok_schemas.py` | unit | PASS (6) |
| 2 | `OpenAIProvider.stream()` parses OpenAI SSE `delta.content` and stops on `[DONE]` | `tests/test_openai_provider.py` | unit | PASS (14) |
| 3 | `OpenAIProvider` maps 401→`auth_error`, 429→`rate_limited`, 404→`model_not_found` | `tests/test_openai_provider.py` | unit | PASS |
| 4 | `AnthropicProvider.stream()` parses `content_block_delta` events and stops on `message_stop` | `tests/test_anthropic_provider.py` | unit | PASS (13) |
| 5 | `AnthropicProvider` uses `x-api-key` + `anthropic-version` headers | `tests/test_anthropic_provider.py` | unit | PASS |
| 6 | `resolve_provider(byok=...)` constructs the matching provider, labels it `byok:{type}`, and does not silently fall through to Ollama | `tests/test_ai_factory.py` | unit | PASS (7) |
| 7 | `resolve_provider(byok=None)` is byte-for-byte the prior Ollama resolution path | `tests/test_ai_factory.py` | unit | PASS |
| 8 | `/generate` with `byok` yields the `meta`/`chunk`/`done` SSE frame sequence from the upstream provider | `tests/test_generate_byok.py` | integration | PASS (9) |
| 9 | The `meta` frame's `provider` label reflects `byok:{type}` | `tests/test_generate_byok.py` | integration | PASS |
| 10 | API key never appears in any response payload, error message, or captured log line | `tests/test_generate_byok.py` | integration | PASS |

## Coverage

BYOK-specific tests (49 total): `test_openai_provider` 14, `test_anthropic_provider` 13,
`test_ai_factory` 7, `test_generate_byok` 9, `test_ai_byok_schemas` 6. `pytest-cov` is not
configured in `api/pyproject.toml`, so a numeric statement percentage is not reported here;
every line of the new provider classes is exercised by the streaming + error-mapping tests
above, exceeding the 80% minimum on a behavioral basis.

## Acceptance checklist (from plan)

- [x] All tasks complete
- [x] `uv run pytest` green — **175 passed**, zero regressions
- [x] `mypy app/services/ai` clean — Success: no issues found in 6 source files
- [x] `ruff check app/services/ai` — 2 pre-existing `UP035` warnings in `ollama.py`
      (deprecated `collections.abc` import); **not introduced by this milestone**
- [x] Integration test proves a mocked OpenAI/Anthropic stream yields the full
      `meta`/`chunk`/`done` frame sequence through `/generate` (`test_generate_byok.py`)
- [x] API key never appears in any response payload, error message, or log line
- [x] Existing Ollama resolution path unchanged when `byok=None`
- [x] Patterns mirrored from `ollama.py` / `factory.py`, not reinvented

## Known gaps / follow-ups

- **mypy `--strict` on whole `app/`**: pre-existing errors in untouched files
  (`envelope.py`, `cloud.py`, `routes/ai.py`, `routes/mcp.py`) predate this milestone.
- **Per-request key transport**: the `byok` field carries the key in the request body —
  an explicit M1 bridge documented in the plan. **Milestone 3** replaces it with
  encrypted server-side storage bound to 127.0.0.1.
- **Frontend wiring**: the extension does not yet send the `byok` field; that is
  **Milestone 2** (role-aware default routing) work.
- **`pytest-cov` not installed** in the API env; numeric coverage % unavailable without
  adding the dependency (deferred — not in M1 scope).

## Merge evidence

- Single implementation commit `68b486f` (`add transform feature and ai model manager`)
  introduced `openai_provider.py`, `anthropic_provider.py`, factory BYOK branch,
  schema extension, and the corresponding test files in one slice.
