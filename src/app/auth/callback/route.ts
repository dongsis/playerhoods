import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Auth callback for magic link / OTP. Exchanges code for session, redirects to next. */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
              })
            } catch {
              // Server Component / Route Handler may not allow cookie writes
            }
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  const redirectTo = next.startsWith('/') ? new URL(next, requestUrl.origin) : new URL('/dashboard', requestUrl.origin)
  return NextResponse.redirect(redirectTo)
}
