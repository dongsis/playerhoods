'use client'

import { useState } from 'react'

type ShareLinkResponse = {
  shareText?: string
  shareUrl?: string
  error?: string
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the textarea fallback for older browsers or denied clipboard access.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

export function InvitationShareLinkSection({ invitationId }: { invitationId: string }) {
  const [isCopying, setIsCopying] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleCopy = async () => {
    setIsCopying(true)
    setStatusMessage(null)
    setErrorMessage(null)

    try {
      const response = await fetch(`/invitations/${encodeURIComponent(invitationId)}/share-link`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      })
      const payload = (await response.json().catch(() => ({}))) as ShareLinkResponse

      if (!response.ok) {
        throw new Error(payload.error ?? 'Share link is not available right now.')
      }

      const shareText = payload.shareText?.trim()
      if (!shareText) {
        throw new Error('Share link is not available right now.')
      }

      const copied = await copyTextToClipboard(shareText)
      setStatusMessage(copied ? 'Copied' : 'Share link ready. Copy the link if your browser asks.')
    } catch (error) {
      setErrorMessage((error as { message?: string })?.message ?? 'Share link is not available right now.')
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <section className="invitation-account-card invitation-account-card-soft">
      <h2>Help fill this match</h2>
      <p>Know someone who might want to play?</p>
      <p>
        Share the public match link. They&apos;ll request a spot with their own mobile number, and the host can decide whether to add them.
      </p>
      <div className="invitation-actions">
        <button
          type="button"
          onClick={handleCopy}
          disabled={isCopying}
          className="invitation-form-button invitation-form-button-accept"
        >
          {isCopying ? 'Preparing...' : 'Copy Share Link'}
        </button>
      </div>
      <p className="invitation-form-copy">
        Your invitation link is personal. Use Copy Share Link if you want to pass the match along.
      </p>
      {statusMessage ? (
        <div className="invitation-status-alert invitation-status-notice">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="invitation-status-alert invitation-status-error">
          {errorMessage}
        </div>
      ) : null}
    </section>
  )
}
