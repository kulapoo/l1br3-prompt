# Supabase Sync Skill

Supabase provides free-tier PostgreSQL, Auth, Realtime, and Storage for l1br3-prompt cloud sync.

## Quick Reference

### Setup
```bash
# Install client
pip install supabase

# Initialize
from supabase import create_client

url = "https://your-project.supabase.co"
key = "your-anon-key"
supabase = create_client(url, key)
```

### Authentication
```python
# Google OAuth
response = supabase.auth.sign_in_with_oauth({
    "provider": "google",
    "options": {
        "redirectTo": "http://localhost:3000/auth/callback"
    }
})

# GitHub OAuth
response = supabase.auth.sign_in_with_oauth({
    "provider": "github",
    "options": {
        "redirectTo": "http://localhost:3000/auth/callback"
    }
})

# Get session
session = supabase.auth.get_session()
user_id = session.user.id
```

### Database Operations
```python
# Create
data = supabase.table("prompts").insert({
    "user_id": user_id,
    "title": "My Prompt",
    "content": "..."
}).execute()

# Read
response = supabase.table("prompts").select("*").eq("user_id", user_id).execute()
prompts = response.data

# Update
supabase.table("prompts").update({"title": "New Title"}).eq("id", 1).execute()

# Delete
supabase.table("prompts").delete().eq("id", 1).execute()
```

### Realtime Subscriptions
```python
def callback(payload):
    print(f"Change: {payload}")

channel = supabase.realtime.on(
    "postgres_changes",
    {
        "event": "*",
        "schema": "public",
        "table": "prompts",
        "filter": f"user_id=eq.{user_id}"
    },
    callback
).subscribe()
```

### Conflict Resolution (Last-Write-Wins)
```python
# Store version vectors in each row
class SyncPrompt(BaseModel):
    id: str
    user_id: str
    title: str
    content: str
    version: int           # Increment on change
    synced_at: datetime
    updated_at: datetime   # Track last update time

# When syncing, compare updated_at timestamps
async def merge_prompt(local: SyncPrompt, remote: SyncPrompt):
    if remote.updated_at > local.updated_at:
        return remote  # Use remote (newer)
    return local       # Keep local (newer)
```

### E2E Encryption
```python
from cryptography.fernet import Fernet
import base64

# Client-side key management
key = Fernet.generate_key()  # Store securely in browser

cipher = Fernet(key)

# Encrypt before sending to Supabase
encrypted = cipher.encrypt(json.dumps(prompt_data).encode()).decode()

# Decrypt after receiving
decrypted = json.loads(cipher.decrypt(encrypted.encode()).decode())
```

## Schema Design

```sql
-- Users (managed by Supabase Auth)
-- table: auth.users (id, email, created_at, etc)

-- Prompts table
CREATE TABLE prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  tags text[],
  is_favorite boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  version integer DEFAULT 1,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id, id)
);

CREATE INDEX prompts_user_id_idx ON prompts(user_id);
CREATE INDEX prompts_updated_at_idx ON prompts(user_id, updated_at);

-- Enable RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their prompts"
  ON prompts FOR ALL
  USING (auth.uid() = user_id);
```

## Free Tier Limits
- Database: 500 MB
- Storage: 1 GB
- API requests: Generous free tier
- Users: 50,000 MAU

## Resources
- [Supabase Docs](https://supabase.com/docs)
- [Auth Guide](https://supabase.com/docs/guides/auth)
- [Realtime](https://supabase.com/docs/guides/realtime)
- [Database Guide](https://supabase.com/docs/guides/database)
