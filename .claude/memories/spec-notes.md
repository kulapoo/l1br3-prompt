# Specification Notes

Key architectural notes and decision points from l1br3-prompt-Specification.md.

## Core Philosophy

**Local-first, privacy-first, free forever**
- All data stored on user's machine
- No telemetry without explicit consent
- All features available with free local tools (Ollama, SQLite)
- Optional cloud sync and AI are off by default

## Technical Highlights

**Backend (Python 3.11+)**
- FastAPI for REST + WebSocket
- SQLite + SQLAlchemy + Alembic
- Pydantic v2 for validation
- Jinja2 for template rendering
- Single executable via PyInstaller

**Frontend (Browser Extension)**
- WXT for cross-browser (Chrome/Firefox)
- React + TypeScript + Tailwind
- IndexedDB for offline support
- Side Panel API (Chrome) + sidebar_action (Firefox)

**Optional Cloud Services**
- Supabase: Auth (Google/GitHub), PostgreSQL (500 MB free), Storage (1 GB free)
- Groq/Gemini: Free APIs via Cloudflare Worker proxy
- Rate limiting: 50 requests/day per user (cloud AI)

## API Design Pattern

**Consistent response envelope:**
```json
{
  "success": true/false,
  "data": {...},
  "error": null or error message,
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/prompts` | Create prompt |
| `GET /api/v1/prompts` | List (paginated, searchable) |
| `GET /api/v1/prompts/{id}` | Get single |
| `PUT /api/v1/prompts/{id}` | Update |
| `DELETE /api/v1/prompts/{id}` | Delete |
| `POST /api/v1/suggest` | Get AI suggestions |
| `POST /api/v1/generate` | Generate AI response |
| `WS /ws` | Real-time updates |

## Performance Targets (MVP)

- Sidebar open: < 200ms
- Prompt copy: < 50ms  
- Suggestion display: < 150ms
- Idle memory: < 150 MB

## Security Checklist

- [ ] No hardcoded secrets
- [ ] All inputs validated (Pydantic)
- [ ] SQL injection prevention (SQLAlchemy ORM)
- [ ] XSS prevention (sanitized HTML in UI)
- [ ] CSRF protection
- [ ] Auth/authz verified
- [ ] Rate limiting on all endpoints
- [ ] Error messages don't leak data

## Sync Protocol (Post-MVP)

- Last-write-wins conflict resolution
- Version vectors in each record
- Client-side encryption with user-controlled key
- Realtime WebSocket for live updates
