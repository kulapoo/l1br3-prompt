# Glossary

Common terms and acronyms used in l1br3-prompt.

## Acronyms

| Term | Meaning | Context |
|------|---------|---------|
| **MVP** | Minimum Viable Product | Phase 2: Sidebar UI |
| **WXT** | Cross-browser extension framework | Frontend tooling |
| **MCP** | Model Context Protocol | Integration with MCP-compatible AI assistants |
| **FTS5** | Full-Text Search | SQLite search capability |
| **LLM** | Large Language Model | Ollama + BYOK providers (OpenAI, …) |
| **AI** | Artificial Intelligence | Transform/generation engines |
| **BYOK** | Bring Your Own Key | User-supplied provider API keys |

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

**Transform (in Compose)**
- AI-powered prompt rewriting built into the Compose tab (`TransformPanel`)
- Requires Ollama (local) or a configured BYOK provider
- Selectable modes (summarize, concise, etc) + custom instructions; modes can be combined
- User can save custom modes; transforms editor selection or whole text

**Settings Tab**
- Backend/AI configuration
- AI model selection + provider management

## Technical Terms

**Sidebar**
- 400px right panel in browser extension
- Simulated in admin mode at full width
- Uses Chrome Side Panel API (Chrome) or sidebar_action (Firefox)

**Admin Mode**
- Full-width 3-column layout for testing/development
- Prompts | Compose | Stats columns
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
- Optional: Ollama local AI / BYOK providers

**Ollama**
- Local LLM runner (localhost:11434)
- User installs separately
- Enables free local AI
- Models: Mistral, Llama2, Neural-Chat, etc

## Component Architecture

**AppConfigProvider**
- React Context holding global state
- View mode, backend status, AI settings
- Replaces external state library

**Tab Components**
- ComposeTab (incl. TransformPanel), PromptsTab, SettingsTab
- Shared between sidebar and admin modes
- Use AppConfig context for state

**Mock Data**
- Current placeholder data (src/mockData.ts)
- Replaced by API calls post-MVP
- Types defined in src/types.ts
