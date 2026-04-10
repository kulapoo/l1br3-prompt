import { createClient, SupabaseClient, Session } from '@supabase/supabase-js'

export type OAuthProvider = 'google' | 'github'

/** Create a Supabase client from user-supplied credentials. */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false, // we manage session storage ourselves via browser.storage.local
      autoRefreshToken: false,
    },
  })
}

/**
 * Sign in with OAuth using browser.identity.launchWebAuthFlow (PKCE).
 *
 * Returns the Supabase session on success, throws on failure.
 *
 * The redirect URI shown to the user in Settings is:
 *   Chrome: https://<extension-id>.chromiumapp.org/
 *   Firefox: moz-extension://<extension-id>/
 * Users must add this URI to Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export async function signInWithOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider
): Promise<Session> {
  const redirectUri = getRedirectUri()

  // Generate PKCE code_verifier + code_challenge
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Get the authorization URL from Supabase
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      queryParams: {
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
    },
  })

  if (error || !data.url) {
    throw new Error(error?.message ?? 'Failed to get OAuth URL from Supabase')
  }

  // Open the OAuth flow in a browser popup via the identity API
  const callbackUrl = await browser.identity.launchWebAuthFlow({
    url: data.url,
    interactive: true,
  })

  if (!callbackUrl) {
    throw new Error('OAuth flow was cancelled or returned no URL')
  }

  // Extract the authorization code from the redirect URL
  const url = new URL(callbackUrl)
  const code = url.searchParams.get('code')
  if (!code) {
    throw new Error('No authorization code in OAuth callback URL')
  }

  // Exchange code + verifier for a session
  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)
  if (sessionError || !sessionData.session) {
    throw new Error(sessionError?.message ?? 'Failed to exchange code for session')
  }

  return sessionData.session
}

/** Sign out and invalidate the session on the Supabase side. */
export async function signOut(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}

/** Return the extension's OAuth redirect URI for display in Settings. */
export function getRedirectUri(): string {
  const id = browser.runtime.id
  // Chrome uses chromiumapp.org; Firefox uses moz-extension://
  if (navigator.userAgent.includes('Firefox')) {
    return `moz-extension://${id}/`
  }
  return `https://${id}.chromiumapp.org/`
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64urlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(new Uint8Array(digest))
}

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
