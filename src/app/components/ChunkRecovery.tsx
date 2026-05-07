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

function isStaticAssetLoadFailure(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const asset = target as Partial<HTMLScriptElement & HTMLLinkElement>
  const tagName = String(asset.tagName ?? '').toUpperCase()
  if (tagName !== 'SCRIPT' && tagName !== 'LINK') return false

  const src = String(asset.src ?? '')
  const href = String(asset.href ?? '')
  return src.includes('/_next/static/') || href.includes('/_next/static/')
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
      if (
        shouldRecoverFromChunkError(event.error) ||
        shouldRecoverFromChunkError(event.message) ||
        isStaticAssetLoadFailure(event.target)
      ) {
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
