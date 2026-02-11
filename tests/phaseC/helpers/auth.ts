import type { Page } from '@playwright/test'

type SupabaseSession = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at?: number
  user: any
}

function mustGetEnv(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

async function signInWithPassword(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<SupabaseSession> {
  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Auth sign-in failed (${res.status}): ${text}`)
  }

  return (await res.json()) as SupabaseSession
}

/**
 * Auth for Phase C:
 * - inject cookie (SSR/middleware reads)
 * - inject localStorage (browser client reads)
 */
export async function authAs(page: Page, role: 'ORG' | 'P1'): Promise<void> {
  const supabaseUrl = mustGetEnv('SUPABASE_URL')
  const anonKey = mustGetEnv('SUPABASE_ANON_KEY')
  const origin = mustGetEnv('PHASEC_BASE_URL') // e.g. http://localhost:3001

  const email = role === 'ORG' ? mustGetEnv('TEST_ORG_EMAIL') : mustGetEnv('TEST_P1_EMAIL')
  const password = role === 'ORG' ? mustGetEnv('TEST_ORG_PASSWORD') : mustGetEnv('TEST_P1_PASSWORD')

  const session = await signInWithPassword(supabaseUrl, anonKey, email, password)

  // Supabase v2 storage key = sb-<projectRef>-auth-token
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`

  const payload = {
    currentSession: session,
    expiresAt: session.expires_at ?? null,
  }

  // cookie stores encoded JSON
  const cookieValue = encodeURIComponent(JSON.stringify(payload))

  // 1) cookie for SSR/middleware
  const { hostname } = new URL(origin)

await page.context().addCookies([
  {
    name: storageKey,
    value: cookieValue,
    domain: hostname,
    path: '/',
    httpOnly: false,
    secure: false, // localhost http
    sameSite: 'Lax',
  },
])


  // 2) localStorage for client
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ storageKey, payload }) => {
      localStorage.setItem(storageKey, JSON.stringify(payload))
    },
    { storageKey, payload }
  )

  // 3) reload so app reads auth state
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.goto('/matches/new', { waitUntil: 'domcontentloaded' })
if (page.url().includes('/login')) {
  throw new Error(`Auth cookie injection failed; redirected to /login. Current URL: ${page.url()}`)
}

}
