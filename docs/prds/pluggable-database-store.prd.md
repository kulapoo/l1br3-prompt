# Pluggable Database Store

```yaml
epic: EPIC-6
feature: F17
```

## Problem
All user data (prompts, tags, categories, transform modes) is locked into a single hardcoded SQLite file at `~/.l1br3/l1br3.db`, with no way to relocate or rehost it. Users who want **flexibility and portability** — to back prompts up with the rest of their data, run against an existing DB, or move between machines — have no path. The cost: data lock-in and an inability to integrate l1br3-prompt into a user's existing data infrastructure.

## Evidence
- User quote: *"user wants flexibility and portability"* — direct request, flagged critical.

## Users
- **Primary**: any l1br3-prompt user — data portability is a universal need, not a power-user niche.
- **Not for**: users who never leave the default install (the default SQLite file remains the shipped zero-config path).

## Hypothesis
We believe **letting users configure the backend's database engine and location** will **solve the data-portability/flexibility problem** for **all users**. We'll know we're right when **a user can switch from the default SQLite file to their own DB (e.g. PostgreSQL) and access all existing prompts without data loss**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Switch-and-retain | 100% of prompts present after migration to a new engine | migration-end row-count assertion |
| Default zero-config preserved | fresh install works with no DB config | install smoke test |
| Migration reliability | <1% migration failures | `/migrate` endpoint telemetry |

## Scope
**MVP**
- Database Manager settings page (mirrors AI Models Manager pattern): engine selector, per-engine connection fields, test-connection, set-active.
- Default engine: **SQLite** (current behavior preserved as shipped default).
- Common engine interface with two implementations: **SQLite** + **PostgreSQL** (the priority second engine).
- Migration wizard: on active-DB switch, copy prompts/tags/categories/transform-modes/search-index to the new target — streaming progress, rollback-on-failure.
- Remove hardcoded `~/.l1br3/l1br3.db` assumption from `api/app/db/engine.py` and call sites.
- Postgres-compatible search fallback (e.g. `tsvector`) when engine ≠ SQLite (FTS5 is SQLite-only).
- Connection UX: guided form (host/port/db/user/pass) + advanced "paste connection string" mode.

**Out of scope**
- wa-sqlite / in-browser SQLite store (separate PRD if ever needed).
- Real-time multi-write replication across DBs.
- Us-hosted cloud DB — bring-your-own only.
- MySQL (deferred — revisit after Postgres lands).
- Encrypted backend credential storage (deferred — security hardening follows the functional MVP; tracked as a follow-up).
- Changes to `browser.storage.local` caches (transient; unchanged).

## Delivery Milestones
| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Engine abstraction | Backend reads/writes through a common interface; SQLite impl behind it; default unchanged | completed | `docs/plans/pluggable-database-store.engine-abstraction.plan.md` (evidence: `docs/testing/pluggable-database-store.engine-abstraction.tdd.md`) |
| 2 | PostgreSQL engine | Second concrete impl; search-index fallback for FTS5 | completed | `docs/plans/pluggable-database-store.postgres-engine.plan.md` (evidence: `docs/testing/pluggable-database-store.postgres-engine.tdd.md`) |
| 3 | Database Manager UI | Settings page mirroring Models Manager: engine select, form/connection-string, test, set-active | completed | `docs/plans/pluggable-database-store.database-manager-ui.plan.md` (evidence: `docs/testing/pluggable-database-store.database-manager-ui.tdd.md`) |
| 4 | Migration wizard | On switch, copy all data to new target with progress + rollback | pending | — |
| 5 | Encrypted credential storage (follow-up) | DB credentials encrypted at rest; secret-redaction in error paths | pending | — |

## Open Questions
- [ ] Connection-test UX: how long to timeout, how to surface auth/network errors safely (no secret leakage)?
- [ ] Rollback semantics: if migration partially fails on a large dataset, restore-from-source or mark target dirty?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| FTS5 → Postgres search parity gap | High | High | Validate `tsvector` recall against current FTS5 results before shipping; keep SQLite as default |
| Migration data loss on partial failure | Medium | Critical | Transactional copy + atomic swap of active DB + rollback-on-any-error |
| Credential leakage in error messages | Medium | High | Redact secrets in all error paths; security-review the DB-config + migration flows before ship |
| Alembic migrations on non-SQLite | Medium | High | Test migration suite against Postgres early in M1 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
