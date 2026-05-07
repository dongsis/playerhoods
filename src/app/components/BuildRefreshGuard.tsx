'use client'

import { useEffect, useRef, useState } from 'react'

const RELOAD_FLAG = 'ph_build_refresh_once'

export function BuildRefreshGuard({ buildId }: { buildId: string }) {
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const refreshingRef = useRef(false)
  const hasCheckedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function checkBuildVersion() {
      if (refreshingRef.current) return

      try {
        const response = await fetch('/api/runtime', {
          cache: 'no-store',
          headers: {
            'cache-control': 'no-store',
          },
        })

        if (!response.ok) return
        const data = (await response.json()) as { buildId?: string }
        if (cancelled || !data.buildId || data.buildId === buildId) return

        setNeedsRefresh(true)

        try {
          if (window.sessionStorage.getItem(RELOAD_FLAG) === data.buildId) return
          window.sessionStorage.setItem(RELOAD_FLAG, data.buildId)
        } catch {
          // Ignore storage failures and continue with refresh.
        }

        refreshingRef.current = true
        window.location.reload()
      } catch {
        // Ignore transient connectivity errors.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkBuildVersion()
      }
    }
    
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true
      void checkBuildVersion()
    }

    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [buildId])

  if (!needsRefresh) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 'auto 1rem 1rem auto',
        zIndex: 9998,
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#fff',
        padding: '0.75rem 0.95rem',
        borderRadius: '16px',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.24)',
        fontSize: '0.82rem',
      }}
    >
      Updating to the latest version…
    </div>
  )
}
