import type { Metadata } from 'next'
import { maskEmail } from '@/lib/auth-ui'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { ChunkRecovery } from '@/app/components/ChunkRecovery'
import { SiteFooterLinks } from '@/app/components/SiteFooterLinks'
import './globals.css'

const chunkRecoveryScript = `
(() => {
  const FLAG = 'ph_chunk_recovery_once';
  const pattern = /ChunkLoadError|Loading chunk [\\w-]+ failed|Failed to fetch dynamically imported module/i;

  const shouldRecover = (value) => {
    const message =
      typeof value === 'string'
        ? value
        : value && typeof value === 'object' && 'message' in value
          ? String(value.message ?? '')
          : '';
    return pattern.test(message);
  };

  const recover = () => {
    try {
      if (window.sessionStorage.getItem(FLAG) === '1') return;
      window.sessionStorage.setItem(FLAG, '1');
    } catch {}

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('__chunk_reload', String(Date.now()));
    window.location.replace(nextUrl.toString());
  };

  window.addEventListener('error', (event) => {
    if (shouldRecover(event.error) || shouldRecover(event.message)) recover();
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldRecover(event.reason)) recover();
  });
})();
`

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
    displayLabel = (profile as Profile | null)?.display_name || maskEmail(user.email) || user.id.slice(0, 8)
  }

  return (
    <html lang="en">
      <body className="min-h-screen font-sans bg-[#F0F7FF] text-[#1E293B]">
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
        <ChunkRecovery />
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
