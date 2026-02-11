import type { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'

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

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: '1rem' }}>
        {user && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#222', color: '#aaa', fontSize: '0.75rem', padding: '0.25rem 0.5rem', zIndex: 9999, fontFamily: 'monospace' }}>
            uid: {user.id} | {user.email}
          </div>
        )}
        {children}
      </body>
    </html>
  )
}
