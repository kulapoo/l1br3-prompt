# Supabase Cloud Sync Setup

Cloud sync is **optional and off by default**. All prompts stay on your machine unless you enable it.

## Why your own Supabase project?

l1br3-prompt is local-first. You bring your own free Supabase project so your prompts never go through a shared server. The free tier supports ~50,000 prompts and 50,000 monthly active users.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project** → choose a name, password, and region.
3. Wait ~2 minutes for provisioning.

---

## 2. Run the database schema

1. In your Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/schema.sql`](../supabase/schema.sql).
3. Click **Run**.

---

## 3. Enable OAuth providers

In your Supabase dashboard → **Authentication** → **Providers**:

### Google
1. Enable **Google**.
2. Create a Google OAuth app at [console.cloud.google.com](https://console.cloud.google.com):
   - Authorized redirect URIs: copy the **Callback URL** shown in Supabase.
3. Paste the **Client ID** and **Client Secret** back into Supabase.

### GitHub (alternative)
1. Enable **GitHub**.
2. Create a GitHub OAuth app at [github.com/settings/applications/new](https://github.com/settings/applications/new):
   - Authorization callback URL: copy the **Callback URL** shown in Supabase.
3. Paste the **Client ID** and **Client Secret** back into Supabase.

---

## 4. Add the extension redirect URI

The browser extension uses PKCE OAuth via `browser.identity.launchWebAuthFlow`. You need to whitelist the extension's redirect URI in Supabase.

1. In Supabase → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add:
   - **Chrome**: `https://<YOUR_EXTENSION_ID>.chromiumapp.org/`
   - **Firefox**: `moz-extension://<YOUR_EXTENSION_ID>/`

To find your extension ID:
- Chrome: open `chrome://extensions` → find **l1br3-prompt** → copy the ID.
- Firefox: open `about:debugging#/runtime/this-firefox` → find the extension.

> The Settings tab in the extension shows your redirect URI dynamically — just copy it from there.

---

## 5. Get your project credentials

In Supabase → **Project Settings** → **API**:

| Value | Where to find it |
|-------|-----------------|
| **Project URL** | `https://xxxxxxxxxxxx.supabase.co` |
| **Anon/public key** | Under "Project API keys" → `anon` `public` |

These are **safe to use client-side** — Row Level Security enforces data isolation.

---

## 6. Configure the extension

1. Open the l1br3-prompt sidebar → **Settings** → **Cloud Sync**.
2. Paste your **Project URL** and **Anon key**.
3. Click **Sign in with Google** (or GitHub).
4. Toggle **Sync enabled** on.

Your prompts will sync automatically every 5 minutes and whenever you open a new tab.

---

## Manual sync

Click **Sync now** in Settings → Cloud Sync to trigger an immediate sync.

---

## Conflict resolution

l1br3-prompt uses **last-write-wins** based on `updated_at` timestamp. If you edit the same prompt on two devices before syncing, the most recently modified version wins. No data is lost — the older version is overwritten.

---

## Disabling sync

Toggle **Sync enabled** off in Settings. Your local prompts are unaffected. To sign out, click **Sign out** — this clears the stored session but does not delete your Supabase data.
