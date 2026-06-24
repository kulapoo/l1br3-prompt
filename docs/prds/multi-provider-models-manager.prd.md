# Multi-Provider Models Manager — Backend Slice (EPIC-5)

## Problem
Power users who already hold paid OpenAI/Anthropic/OpenAI-compatible API keys
cannot use those models from the extension. The Models Manager UI shipped (F13)
lets them add providers and assign Chat/Transformation defaults, but selecting a
BYOK provider has no effect: `/generate` and `/transform` still resolve to Local
(Ollama), and keys never leave `browser.storage.local`. The cost of leaving this
unsolved is a shipped feature that silently does nothing — a broken-promise
regression that erodes trust in the product's other claims.

## Evidence
- Structural signal: F13 (frontend) is marked complete in `docs/roadmap.md` while
  F14/F15/F16 (the backend it depends on) are all pending — a shipped UI with no
  backing implementation.
- Assumption — needs validation via user research or analytics: that users
  actually attempt to configure BYOK providers in the shipped UI and are blocked.
  No user quotes, tickets, or metrics are available.

## Users
- **Primary**: Power users / developers who already pay for OpenAI or Anthropic
  (or run an OpenAI-compatible endpoint) and want their paid models — not the
  rate-limited local tier — to power chat and transformation.
- **Secondary**: Users on locked-down networks where only one provider is
  reachable and they need to point the extension at it.
- **Not for**: Casual users served entirely by Local Ollama; they should notice
  no change.

## Hypothesis
We believe **real backend provider classes, role-aware routing, and encrypted
server-side key storage** will **let users run `/generate` and `/transform`
against their own provider keys** for **power users who hold paid provider API
keys**. We'll know we're right when **a user can add a BYOK provider in the
Models Manager, assign it as the Chat or Transformation default, and a
`/generate` or `/transform` request streams a response from that provider using
their stored key — with the key never leaving the local backend bound to
127.0.0.1**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| End-to-end BYOK request success | ≥95% of configured-provider requests stream to completion | backend request log / SSE done-frame count |
| Key storage security | Zero plaintext keys at rest or in transit beyond 127.0.0.1 | code review + secret scan; key never appears in API response payloads |
| Routing correctness | Chat default and Transformation default resolve independently and correctly | integration tests covering each assignment permutation |
| Regression-free | Local Ollama paths unchanged for users with no BYOK config | existing `/generate` and `/transform` test suite stays green |

## Scope
**MVP**
- Real provider classes for OpenAI, Anthropic, and OpenAI-compatible endpoints
  behind a common interface: streaming, error mapping, model listing.
- Role-aware `resolve_provider`: route `/generate` (Chat) and `/transform`
  (Transformation) through the user's per-purpose default assignments, falling
  through the provider stack (local → BYOK) honoring user config.
- Encrypted backend key storage bound to 127.0.0.1: move BYOK keys out of
  `browser.storage.local` into server-side encrypted storage.

**Out of scope**
- Usage metering, spend tracking, per-provider quotas.
- Fine-tuned / custom model management UI beyond listing.
- OAuth-based key rotation/revocation flows (manual paste only).
- Token-level cost attribution in streamed responses.
- Routing a single request across multiple providers in parallel.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | BYOK inference works end-to-end | A user with an OpenAI/Anthropic key gets a streamed `/generate` or `/transform` response from their provider | complete | `docs/plans/multi-provider-models-manager.plan.md` (evidence: `docs/testing/multi-provider-models-manager.byok-inference.tdd.md`) |
| 2 | Role-aware default routing | Chat default and Transformation default resolve independently; changing an assignment changes which provider serves each purpose | in-progress | `docs/plans/multi-provider-models-manager.role-routing.plan.md` |
| 3 | Encrypted server-side key storage | BYOK keys live encrypted on the backend bound to 127.0.0.1 and never appear in plaintext in any response or log | pending | — |

## Open Questions
- [ ] **Encryption key source** — the project requires "encrypted server-side key storage bound to 127.0.0.1" but not the key-derivation source. Options: machine-bound secret, user passphrase, OS keychain. Decision changes the F16 design materially.
- [ ] **Fallback policy** — when no BYOK assignment exists for a purpose, should local Ollama be the implicit fallback, or should the absence be a hard error forcing the user to choose?
- [ ] **OpenAI-compatible model listing** — pull from `/v1/models` when available, or manual entry only? Some compatible servers (e.g. vLLM, LM Studio) implement it, others don't.
- [ ] **Request path** — do BYOK requests go browser→provider directly, or browser→API(127.0.0.1)→provider? The latter centralizes CORS/key exposure and reuses the existing SSE frame contract; the former avoids proxying. This shapes F14 and F16 together.
- [ ] **Error mapping contract** — what subset of provider errors (rate limits, auth failures, model-decommissioned) surface to the UI vs. get normalized to a generic frame?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Encryption scheme choice is wrong and must be reworked after F16 ships | Medium | High | Resolve open question #1 in `/plan` before implementation; prototype key derivation early |
| Provider SSE formats diverge enough to break the common interface | Medium | High | Define the common streaming contract first; validate against all three providers before declaring F14 done |
| Key leakage via logs / error messages / debug payloads | Low | Critical | Secret-scan + explicit review that keys never appear in ApiResponse payloads or server logs; covered as a success metric |
| Existing Local Ollama users regress | Low | High | Keep non-BYOK resolution path unchanged; guard with the existing `/generate` + `/transform` test suite |
| Scope creep into metering / OAuth / multi-device sync | Medium | Medium | Explicit out-of-scope list above; defer to future epics |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
