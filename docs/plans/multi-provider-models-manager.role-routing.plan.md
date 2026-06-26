# Plan: Multi-Provider Models Manager — Role-Aware Default Routing (Milestone 2)

**Source PRD**: `docs/prds/multi-provider-models-manager.prd.md`
**Selected Milestone**: #2 — Role-aware default routing (roadmap F15)
**Complexity**: Medium

## Summary

Make `/generate` (Chat role) and `/transform` (Transformation role) resolve independently through
the user's per-purpose Default Model Assignment that F13 already stores in `AppConfig.ai.assignments`.
A new pure frontend resolver maps `assignments[role]` → the M1 BYOK wire shape (`byok` + `model`),
so the backend contract from Milestone 1 is reused unchanged. No backend edits, no migration.

## Decision on PRD Open Question (locked for this plan)

| OQ | Decision | Rationale |
|---|---|---|
| #2 Fallback policy | **Implicit Ollama fallback** when an assignment is missing, points at a provider that is absent / disabled / unkeyed | Reuses M1's existing `byok=None` → Ollama path for free; never hard-fails the user |
| #4 Request path | Inherited from M1: browser → API (127.0.0.1) → provider | No change |

**Architecture decision (confirmed with user): Option A — frontend resolves the role.** The
assignment data is already owned by the frontend (`browser.storage.local` via F13). M3 will later
swap only the `apiKey` source for encrypted server storage; the routing layer introduced here is
untouched by M3.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Assignment shape | `browser-ext/types/index.ts:108` | `ModelAssignment = { providerId; model }`; providerId is `'ollama'` or a BYOK provider UUID |
| BYOK wire shape | `api/app/schemas/ai.py:26` | `ByokProviderConfig` (camelCase `apiKey`/`baseUrl`); frontend must emit identical shape |
| Pure util + colocated test | `browser-ext/lib/storage.ts` + `lib/storage.test.ts` | Pure helper, vitest globals, `.test.ts` sibling |
| SSE call site | `browser-ext/components/ComposeTab.tsx:210` | `streamGenerate({ prompt, model }, onChunk, signal, { onMeta })` |
| Transform call site | `browser-ext/components/TransformPanel.tsx:58` | `streamTransform({ prompt, modes, instruction }, ...)` |
| AppConfig update | `browser-ext/contexts/AppConfig.tsx:175` | Read `assignments` / `providers` from `config.ai` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `browser-ext/lib/roleRouter.ts` | CREATE | Pure `resolveRoleProvider(role, providers, assignments, opts)` → `{ byok?, model } \| null` |
| `browser-ext/lib/roleRouter.test.ts` | CREATE | Unit tests covering every assignment permutation + fallback paths |
| `browser-ext/types/index.ts` | UPDATE | Add `ByokRequestConfig`; widen `GenerateRequest.byok?`; widen `AppConfig.ai.activeProvider` to `string \| null` |
| `browser-ext/lib/api.ts` | UPDATE | Extend `streamTransform` body type with `byok?` / `model?`; widen `onMeta` provider type to `string` |
| `browser-ext/components/ComposeTab.tsx` | UPDATE | Resolve role='chat' before `streamGenerate`; forward `byok` + `model`; drop `as 'ollama' \| null` cast |
| `browser-ext/components/TransformPanel.tsx` | UPDATE | Resolve role='transform' before `streamTransform`; forward `byok` + `model` |

**No backend changes. No migration. No new API endpoints.**

## Tasks

### Task 1: Resolver utility (RED → GREEN)
- **Action**: Create `lib/roleRouter.ts`. Export `resolveRoleProvider(role, providers, assignments, { fallbackModel })`.
  - `a = assignments[role]`
  - `a == null` → `{ byok: undefined, model: fallbackModel }` (Ollama fallback).
  - `a.providerId === 'ollama'` → `{ byok: undefined, model: a.model }`.
  - Provider not found / `!enabled` / no `apiKey` → Ollama fallback `{ byok: undefined, model: fallbackModel }`.
  - Else → `{ byok: { type, apiKey, baseUrl, model: a.model }, model: a.model }`.
- **Mirror**: pure helpers in `lib/storage.ts`.
- **Validate**: `cd browser-ext && pnpm test -t roleRouter`.

### Task 2: Type widening
- **Action**: Add `ByokRequestConfig` (`type`, `apiKey`, `baseUrl?`, `model?`) to `types/index.ts`.
  Add `byok?: ByokRequestConfig | null` to `GenerateRequest`. Widen `AppConfig.ai.activeProvider`
  from `'ollama' | null` to `string | null`. Widen `onMeta` provider type in `lib/api.ts` from
  `'ollama' | string` to `string`. Extend `streamTransform` body type with `byok?` and `model?`.
- **Validate**: `cd browser-ext && npx tsc --noEmit`.

### Task 3: Wire ComposeTab (chat role)
- **Action**: Resolve role='chat' via the new resolver; pass `{ prompt, model: resolved.model, byok: resolved.byok }` to `streamGenerate`. Keep `config.ai.selectedModel` as the fallback model only.
- **Validate**: `cd browser-ext && pnpm test -t ComposeTab`.

### Task 4: Wire TransformPanel (transform role)
- **Action**: Resolve role='transform'; pass `byok` + `model` into `streamTransform`.
- **Validate**: `cd browser-ext && pnpm test -t TransformPanel`.

### Task 5: Regression guard
- **Action**: Confirm backend suite is unchanged (`cd api && uv run pytest`); confirm existing extension tests stay green.
- **Validate**: `cd browser-ext && pnpm test && npx tsc --noEmit && npm run lint`.

## Validation

```bash
# Frontend gate
cd browser-ext && pnpm test
cd browser-ext && npx tsc --noEmit
cd browser-ext && npm run lint

# Backend regression (no M2 edits — must stay green unchanged)
cd api && uv run pytest
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `activeProvider` widening breaks consumers | Low | Only `AppConfig.tsx` + the two call sites read it; covered in Task 2 |
| User assigns BYOK but key is empty (e.g. during the future M3 migration) | Medium | Resolver falls back to Ollama and emits a console warning rather than sending a keyless BYOK request |
| Resolver drifts from the M1 backend contract | Low | Emits exactly the M1 `ByokProviderConfig` shape (camelCase); `test_generate_byok.py` already pins the contract |
| FE-only routing feels under-built for a "milestone" | Low | M2's deliverable is correct *independent* resolution; validated by exhaustive resolver unit tests + call-site tests |

## Acceptance
- [ ] Chat and Transformation assignments resolve independently (unit tests cover all permutations)
- [ ] Changing an assignment changes the `meta.provider` frame on the next request
- [ ] Missing assignment / missing provider / disabled provider / empty key → Ollama fallback, never a hard failure
- [ ] `pnpm test`, `tsc --noEmit`, `npm run lint` green; `cd api && uv run pytest` green (unchanged)
- [ ] No backend edits, no migration

---
*Status: COMPLETED. Follows M1 (`docs/plans/multi-provider-models-manager.plan.md`). Verified: `pnpm test` (116), `tsc --noEmit`, `uv run pytest` (175) all green. Next: M3 — encrypted server-side key storage.*
