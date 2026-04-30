'use client'

import { useEffect } from 'react'

const RECOVERY_FLAG = 'ph_chunk_recovery_once'

function shouldRecoverFromChunkError(value: unknown): boolean {
  const message =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'message' in value
        ? String((value as { message?: unknown }).message ?? '')
        : ''

  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(message)
}

export function ChunkRecovery() {
  useEffect(() => {
    const recover = () => {
      try {
        if (window.sessionStorage.getItem(RECOVERY_FLAG) === '1') return
        window.sessionStorage.setItem(RECOVERY_FLAG, '1')
      } catch {
        // Ignore storage failures and still attempt a single hard reload.
      }

      window.location.reload()
    }

    const handleError = (event: ErrorEvent) => {
      if (shouldRecoverFromChunkError(event.error) || shouldRecoverFromChunkError(event.message)) {
        recover()
      }
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (shouldRecoverFromChunkError(event.reason)) {
        recover()
      }
    }

    try {
      window.sessionStorage.removeItem(RECOVERY_FLAG)
    } catch {
      // Ignore storage failures.
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return null
}
