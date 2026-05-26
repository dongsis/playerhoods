import type { Metadata } from 'next'
import { maskEmail } from '@/lib/auth-ui'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { SiteFooterLinks } from '@/app/components/SiteFooterLinks'
import { getSiteOrigin } from '@/lib/site-url'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: 'PlayerHoods',
  description: 'Find tennis and pickleball venues, matches, and players with PlayerHoods.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'PlayerHoods',
    description: 'Find tennis and pickleball venues, matches, and players with PlayerHoods.',
    siteName: 'PlayerHoods',
    type: 'website',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  let displayLabel = ''
  if (user) {
    const supabase = await createSupabaseServerClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    displayLabel = (profile as Profile | null)?.display_name || maskEmail(user.email) || user.id.slice(0, 8)
  }

  return (
    <html lang="en">
      <body className="min-h-screen font-sans bg-[#F0F7FF] text-[#1E293B]">
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <SiteFooterLinks />
        </div>
        {user && (
          <div
            style={{
              position: 'fixed',
              bottom: '0.85rem',
              right: '0.85rem',
              background: 'rgba(255,255,255,0.92)',
              color: '#64748B',
              fontSize: '0.72rem',
              padding: '0.45rem 0.75rem',
              zIndex: 9999,
              border: '1px solid #E2E8F0',
              borderRadius: '999px',
              boxShadow: '0 12px 24px rgba(15,23,42,0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {displayLabel}
          </div>
        )}
      </body>
    </html>
  )
}
