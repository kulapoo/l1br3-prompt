# Glossary

Common terms and acronyms used in l1br3-prompt.

## Acronyms

| Term | Meaning | Context |
|------|---------|---------|
| **MVP** | Minimum Viable Product | Phase 2: Sidebar UI |
| **WXT** | Cross-browser extension framework | Frontend tooling |
| **MCP** | Model Context Protocol | Integration with Claude/ChatGPT |
| **FTS5** | Full-Text Search | SQLite search capability |
| **E2E** | End-to-End | Encryption (optional cloud sync) |
| **RLS** | Row-Level Security | Supabase PostgreSQL feature |
| **LLM** | Large Language Model | Ollama, Groq, Gemini |
| **AI** | Artificial Intelligence | Suggestion/generation engines |

## Product Terms

**Prompt**
- A text template that users compose and reuse
- Can include `{{variable}}` placeholders
- Can have modifiers (concise, step-by-step, etc)
- Stored locally in SQLite

**Compose Tab**
- UI for creating/editing prompts
- Rich text editor (Tiptap)
- Variable detection and form generation
- Live preview with substitution

**Prompts Tab**
- Browsable library of stored prompts
- Search, filter by tag/category
- Inline edit/delete/favorite
- Copy to clipboard or inject into page

**Enhance / Suggestions Tab**
- AI-powered suggestions for improvement
- Requires Ollama (local) or cloud AI fallback
- Shows multiple suggestion panels
- User can accept, edit, or ignore

**Settings Tab**
- Backend/AI configuration
- Cloud sync auth (Google/GitHub)
- AI model selection
- Rate limiting status

## Technical Terms

**Sidebar**
- 400px right panel in browser extension
- Simulated in admin mode at full width
- Uses Chrome Side Panel API (Chrome) or sidebar_action (Firefox)

**Admin Mode**
- Full-width 3-column layout for testing/development
- Prompts | Compose | Suggestions columns
- Slide-over Settings panel

**View Mode**
- Controlled by `AppConfig.viewMode`
- `sidebar` — 400px extension panel
- `admin` — full-width layout
- `docs` — spec viewer

**Modifier**
- Predefined prompt variations (concise, verbose, step-by-step)
- Can source from local config, API, MCP, or Ollama
- Automatically appended to prompt content

**Quick Action**
- User-configurable prompt shortcuts
- Can be inline or AI-generated
- Support for local, API, MCP, Ollama sources

**Variable**
- Placeholder in template: `{{variable_name}}`
- Auto-detected by compose editor
- Generated form field for user input
- Substituted before sending prompt

**Backend**
- Python FastAPI service (localhost:8000)
- SQLite database (local)
- Optional: Supabase cloud sync
- Optional: Ollama/Groq/Gemini AI

**Ollama**
- Local LLM runner (localhost:11434)
- User installs separately
- Enables free local AI suggestions
- Models: Mistral, Llama2, Neural-Chat, etc

## Sync Concepts

**Version Vector**
- Tracks changes across replicas
- Enables conflict detection
- `(user_id, updated_at)` tuple in l1br3-prompt

**Last-Write-Wins (LWW)**
- Conflict resolution strategy
- Newer timestamp wins
- Simple but effective for prompts

**Conflict Resolution**
- Merging divergent local/cloud changes
- Happens on sync
- User notified of conflicts (future phase)

## Component Architecture

**AppConfigProvider**
- React Context holding global state
- View mode, backend status, AI settings, sync state
- Replaces external state library

**Tab Components**
- ComposeTab, PromptsTab, SuggestionsTab, SettingsTab
- Shared between sidebar and admin modes
- Use AppConfig context for state

**Mock Data**
- Current placeholder data (src/mockData.ts)
- Replaced by API calls post-MVP
- Types defined in src/types.ts
