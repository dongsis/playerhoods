import type { Metadata } from 'next'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import './globals.css'

export const metadata: Metadata = {
  title: 'Playerhoods',
  description: 'Tennis match organization platform',
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
    displayLabel = (profile as Profile | null)?.display_name || user.email || user.id.slice(0, 8)
  }

  return (
    <html lang="en">
      <body className="font-sans bg-gray-50 text-gray-900" style={{ margin: 0 }}>
        {user && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#222', color: '#aaa', fontSize: '0.75rem', padding: '0.25rem 0.5rem', zIndex: 9999, fontFamily: 'monospace' }}>
            {displayLabel} | {user.email}
          </div>
        )}
        {children}
      </body>
    </html>
  )
}
