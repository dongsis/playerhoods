'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

type AutoRefreshProps = {
  intervalMs?: number
}

export function AutoRefresh({ intervalMs = 5000 }: AutoRefreshProps) {
  const router = useRouter()

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      router.refresh()
    }, intervalMs)

    return () => window.clearInterval(intervalId)
  }, [intervalMs, router])

  return null
}
