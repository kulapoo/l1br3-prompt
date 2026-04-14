# Product Capability Planning

Translate phase requirements, roadmap items, or feature discussions into
implementation-ready capability plans that expose constraints, invariants,
interfaces, and unresolved decisions before work starts.

## When to Use

- A phase exists in `requirements.md` but implementation constraints are implicit
- A feature touches both backend (`api/`) and frontend (`browser-ext/`)
- Product intent is clear but architecture, data, or lifecycle implications are fuzzy
- Hidden assumptions surface during review or implementation

## Workflow

### 1. Restate the Capability

Answer: **who** benefits, **what** changes, **what outcome** they get.

Reference `requirements.md` for the canonical product spec. Cross-check with
`.claude/memories/phase-status.md` for current state.

### 2. Resolve Constraints

For each capability, enumerate:

| Category | Questions to Answer |
|---|---|
| **Business Rules** | What is always true? What is never allowed? |
| **Scope** | What is this capability? What is it NOT? |
| **Data Ownership** | Which model owns this data? Where is it stored (SQLite, browser.storage, Supabase)? |
| **Lifecycle** | Created when? Updated how? Deleted/archived when? Sync behavior? |
| **Failure Modes** | What happens when backend is offline? When Ollama is unavailable? When sync conflicts? |
| **Rollout** | Phase dependency? Feature flag needed? Migration required? |

### 3. Define Implementation Contract

Produce an SRS-style plan covering:

- **Actors**: User, background script, content script, API server, Ollama, Supabase
- **Surfaces**: Sidebar tab, API endpoint, storage layer, sync channel
- **States/Transitions**: What states does the entity go through?
- **Interfaces**: API routes (method + path + schema), React components (props), hooks (signature)
- **Data**: Schema changes (SQLAlchemy models, Pydantic schemas, TypeScript types)
- **Security**: Input validation, localhost binding, encryption at rest, RLS policies
- **Observability**: What should be logged? What errors surface to the user?
- **Open Questions**: Anything that needs a product decision before implementation

### 4. Translate to Execution

Decide the handoff:
- **Ready for /plan**: Constraints resolved, interfaces defined, proceed to implementation planning
- **Needs review**: Constraints mostly resolved, but some trade-offs need discussion
- **Needs clarification**: Open questions block implementation — list them explicitly

## Output Format

```markdown
# Capability: [Name]

## CAPABILITY
[One-paragraph restatement: who, what, outcome]

## CONSTRAINTS
- [Fixed rule or boundary — always true]
- [Fixed rule or boundary — never allowed]

## IMPLEMENTATION CONTRACT

### Actors
- [Actor]: [Role in this capability]

### Surfaces
- [API endpoint / UI component / storage layer]

### States & Transitions
- [State 1] → [State 2]: [trigger]

### Interfaces
- `POST /api/v1/...` — [purpose] (request/response schema)
- `<ComponentName prop={...} />` — [purpose]

### Data
- [Model/table changes]
- [New TypeScript types]

### Security
- [Validation rules]
- [Access control]

### Observability
- [What to log]

## NON-GOALS
- [What this capability explicitly does NOT cover]

## OPEN QUESTIONS
- [Blocker or product decision needed]

## HANDOFF
- [Ready for /plan | Needs review | Needs clarification]
- [Which agent/command takes it next]
```

## Rules

1. Do not invent product truth — mark unresolved questions explicitly
2. Separate user-visible promises from implementation details
3. Call out what is fixed (constraint) vs. preference (could change) vs. open (needs decision)
4. Always check both backend and frontend impact
5. Reference the ApiResponse envelope (`{ success, data, error, metadata }`) for API interfaces
6. Respect the local-first principle — cloud features must degrade gracefully
