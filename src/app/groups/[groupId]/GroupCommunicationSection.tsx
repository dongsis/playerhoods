'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { GroupMessageEnriched } from '@/lib/api/groups'

function IconMessageCircle({ size = 12, color = '#0f172a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18L3.5 20L4.4 16.1A8 8 0 1 1 20 12A8 8 0 0 1 7 18Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconAnnouncement({ size = 11, color = '#f59e0b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13V11L19 6V18L4 13Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 14.5L10.5 18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconSend({ size = 14, color = '#cbd5e1' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 3L10 14" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M21 3L14 21L10 14L3 10L21 3Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function MessageAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string
  avatarUrl: string | null
}) {
  const initial = displayName.charAt(0).toUpperCase() || '?'

  return (
    <div
      style={{
        width: '1.85rem',
        height: '1.85rem',
        borderRadius: '0.7rem',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#eef2ff',
        color: '#4f46e5',
        fontSize: '0.74rem',
        fontWeight: 800,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}

type Props = {
  announcementText: string | null
  messages: GroupMessageEnriched[]
  viewerUserId: string | null
  canAccess: boolean
  canPost: boolean
  onPostMessage: (body: string) => Promise<void>
}

export function GroupCommunicationSection({
  announcementText,
  messages,
  viewerUserId,
  canAccess,
  canPost,
  onPostMessage,
}: Props) {
  const router = useRouter()
  const [composerValue, setComposerValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSendingMessage, startSendMessage] = useTransition()

  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messages],
  )

  if (!canAccess) {
    return (
      <section
        style={{
          background: '#fff',
          borderRadius: '22px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconMessageCircle />
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '0.74rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Discussion
          </h2>
        </div>
        <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.86rem' }}>
          Discussion is available after you join this group.
        </div>
      </section>
    )
  }

  const handleSendMessage = () => {
    const nextBody = composerValue.trim()
    if (!nextBody) return

    setError(null)
    startSendMessage(async () => {
      try {
        await onPostMessage(nextBody)
        setComposerValue('')
        router.refresh()
      } catch (messageError) {
        setError((messageError as { message?: string })?.message ?? 'Could not send message.')
      }
    })
  }

  return (
    <section
      style={{
        background: '#fff',
        minHeight: '760px',
        display: 'grid',
        gridTemplateRows: 'auto auto 1fr auto',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1.2rem 1.45rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.55rem', fontWeight: 700 }}>Discussion</h2>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '999px',
              background: '#dcfce7',
              color: '#16a34a',
              padding: '0.18rem 0.55rem',
              fontSize: '0.66rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Live
          </span>
        </div>
      </header>

      {announcementText?.trim() ? (
        <section style={{ padding: '1.2rem 1.45rem 0' }}>
          <div
            style={{
              borderRadius: '18px',
              border: '1px solid #fbbf24',
              background: '#fff9e9',
              padding: '0.9rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <IconAnnouncement />
                <span
                  style={{
                    color: '#b45309',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Announcement
                </span>
              </div>
              <div style={{ marginTop: '0.35rem', color: '#111827', fontSize: '0.98rem', lineHeight: 1.55 }}>
                {announcementText}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section
        style={{
          padding: '1rem 1.45rem 1.2rem',
          display: 'grid',
          alignContent: 'start',
          gap: '1rem',
        }}
      >
        {sortedMessages.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', paddingTop: '0.2rem' }}>
            No messages yet.
          </div>
        ) : (
          sortedMessages.map((message) => {
            const isViewer = viewerUserId != null && message.author_user_id === viewerUserId

            if (isViewer) {
              return (
                <div key={message.id} style={{ marginLeft: 'auto', maxWidth: '430px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem', marginBottom: '0.18rem' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{formatMessageTime(message.created_at)}</span>
                    <span style={{ color: '#f97316', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      You
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      borderRadius: '18px 18px 6px 18px',
                      background: '#f97316',
                      color: '#fff',
                      padding: '0.75rem 0.95rem',
                      fontSize: '0.96rem',
                      lineHeight: 1.45,
                      boxShadow: '0 18px 30px -24px rgba(249, 115, 22, 0.55)',
                    }}
                  >
                    {message.body}
                  </div>
                </div>
              )
            }

            return (
              <div key={message.id} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                <MessageAvatar displayName={message.author_name} avatarUrl={message.author_avatar_url} />
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    {message.author_name}
                  </div>
                  <div
                    style={{
                      marginTop: '0.3rem',
                      display: 'inline-block',
                      borderRadius: '18px',
                      background: '#f1f5f9',
                      border: '1px solid #dbe4ee',
                      color: '#0f172a',
                      padding: '0.8rem 1rem',
                      fontSize: '0.96rem',
                      lineHeight: 1.5,
                    }}
                  >
                    {message.body}
                  </div>
                  <div style={{ marginTop: '0.3rem', color: '#94a3b8', fontSize: '0.68rem' }}>
                    {formatMessageTime(message.created_at)}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </section>

      <footer
        style={{
          marginTop: 'auto',
          padding: '0 1.45rem 1.35rem',
        }}
      >
        <div
          style={{
            borderRadius: '18px',
            border: '1px solid #dbe4ee',
            background: '#fff',
            padding: '0.95rem 1rem',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        >
          <input
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
            placeholder={canPost ? 'Write a message...' : 'Only current members can chat.'}
            disabled={!canPost || isSendingMessage}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSendMessage()
              }
            }}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#0f172a',
              fontSize: '1rem',
            }}
          />
          <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: error ? '#dc2626' : '#94a3b8', fontSize: '0.78rem' }}>
              {error ?? 'Public group coordination only.'}
            </div>
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!canPost || !composerValue.trim() || isSendingMessage}
              style={{
                border: 'none',
                background: 'transparent',
                color: !canPost || !composerValue.trim() ? '#cbd5e1' : '#f97316',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: !canPost || !composerValue.trim() ? 'default' : 'pointer',
              }}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Send
              </span>
              <IconSend color={!canPost || !composerValue.trim() ? '#cbd5e1' : '#f97316'} />
            </button>
          </div>
        </div>
      </footer>
    </section>
  )
}
