'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MatchMessageEnriched } from '@/lib/api/matches'

function IconMessageCircle({ size = 12, color = '#0f172a' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18L3.5 20L4.4 16.1A8 8 0 1 1 20 12A8 8 0 0 1 7 18Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo({ size = 10, color = '#f97316' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <path d="M12 10V16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1" fill={color} />
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

function IconEdit({ size = 10, color = '#f97316' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20H8L18 10C18.5 9.5 18.5 8.6 18 8.1L15.9 6C15.4 5.5 14.5 5.5 14 6L4 16V20Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  organizerNoteText: string | null
  organizerName: string
  messages: MatchMessageEnriched[]
  viewerUserId: string | null
  canAccessCommunication: boolean
  canPostCommunication: boolean
  canEditOrganizerNote: boolean
  onUpdateOrganizerNote: (organizerNote: string | null) => Promise<void>
  onPostMessage: (body: string) => Promise<void>
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
        width: '1.7rem',
        height: '1.7rem',
        borderRadius: '999px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#e2e8f0',
        color: '#64748b',
        fontSize: '0.66rem',
        fontWeight: 700,
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

export function MatchCommunicationSection({
  organizerNoteText,
  organizerName,
  messages,
  viewerUserId,
  canAccessCommunication,
  canPostCommunication,
  canEditOrganizerNote,
  onUpdateOrganizerNote,
  onPostMessage,
}: Props) {
  const router = useRouter()
  const [composerValue, setComposerValue] = useState('')
  const [noteDraft, setNoteDraft] = useState(organizerNoteText ?? '')
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSavingNote, startSaveNote] = useTransition()
  const [isSendingMessage, startSendMessage] = useTransition()

  const hasOrganizerNote = Boolean(organizerNoteText?.trim())
  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messages],
  )

  if (!canAccessCommunication) {
    return null
  }

  const handleSaveNote = () => {
    setError(null)
    startSaveNote(async () => {
      try {
        await onUpdateOrganizerNote(noteDraft.trim() || null)
        setIsEditingNote(false)
        router.refresh()
      } catch (saveError) {
        setError((saveError as { message?: string })?.message ?? 'Could not save note.')
      }
    })
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
        marginBottom: '1rem',
        background: '#fff',
        borderRadius: '20px',
        border: '1px solid #eef2f7',
        boxShadow: '0 4px 18px rgba(15, 23, 42, 0.03)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.7rem 1rem',
          borderBottom: '1px solid #f8fafc',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
      >
        <IconMessageCircle />
        <h2
          style={{
            margin: 0,
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#0f172a',
          }}
        >
          Communication
        </h2>
      </div>

      {(hasOrganizerNote || canEditOrganizerNote) ? (
        <div
          style={{
            background: hasOrganizerNote || isEditingNote ? '#fff7ed' : '#fff',
            padding: '0.7rem 1rem',
            borderBottom: '1px solid rgba(251,146,60,0.12)',
          }}
        >
          {isEditingNote ? (
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem' }}>
                <IconInfo />
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f97316' }}>
                  Organizer Note
                </span>
              </div>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={3}
                placeholder="Add a short note for players..."
                style={{
                  width: '100%',
                  resize: 'vertical',
                  borderRadius: '12px',
                  border: '1px solid #fed7aa',
                  background: '#fff',
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.78rem',
                  color: '#475569',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setNoteDraft(organizerNoteText ?? '')
                    setIsEditingNote(false)
                  }}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '999px',
                    background: '#fff',
                    color: '#64748b',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={isSavingNote}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    background: '#f97316',
                    color: '#fff',
                    padding: '0.35rem 0.9rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: isSavingNote ? 'wait' : 'pointer',
                  }}
                >
                  {isSavingNote ? 'Saving...' : 'Save note'}
                </button>
              </div>
            </div>
          ) : hasOrganizerNote ? (
            <div style={{ display: 'grid', gap: '0.18rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <IconInfo />
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f97316' }}>
                  Organizer Note
                </span>
                <span style={{ fontSize: '0.58rem', color: '#fdba74', fontWeight: 600 }}>
                  Pinned by {organizerName}
                </span>
                {canEditOrganizerNote ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingNote(true)}
                    style={{
                      marginLeft: 'auto',
                      border: 'none',
                      background: 'transparent',
                      color: '#fb923c',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <IconEdit />
                    Edit
                  </button>
                ) : null}
              </div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#475569', fontStyle: 'italic', lineHeight: 1.55 }}>
                &ldquo;{organizerNoteText}&rdquo;
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingNote(true)}
              style={{
                border: '1px dashed #fdba74',
                borderRadius: '999px',
                background: '#fff',
                color: '#f97316',
                padding: '0.38rem 0.8rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Add organizer note
            </button>
          )}
        </div>
      ) : null}

      <div style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.9rem' }}>
        {sortedMessages.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>No messages yet.</p>
        ) : (
          sortedMessages.map((message) => {
            const isMine = viewerUserId !== null && message.author_user_id === viewerUserId

            return (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: isMine ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMine ? 'row-reverse' : 'row',
                    alignItems: 'flex-start',
                    gap: '0.55rem',
                    maxWidth: '92%',
                  }}
                >
                  {!isMine ? (
                    <MessageAvatar displayName={message.author_name} avatarUrl={message.author_avatar_url} />
                  ) : null}

                  <div style={{ display: 'grid', gap: '0.15rem', justifyItems: isMine ? 'end' : 'start' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.32rem',
                        flexDirection: isMine ? 'row-reverse' : 'row',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.58rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: isMine ? '#f97316' : '#0f172a',
                        }}
                      >
                        {isMine ? 'You' : message.author_name}
                      </span>
                      <span style={{ fontSize: '0.55rem', color: '#cbd5e1', fontStyle: 'italic' }}>
                        {formatMessageTime(message.created_at)}
                      </span>
                    </div>

                    <div
                      style={{
                        borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        padding: '0.5rem 0.7rem',
                        background: isMine ? '#f97316' : '#f8fafc',
                        color: isMine ? '#fff' : '#475569',
                        border: isMine ? 'none' : '1px solid #e2e8f0',
                        boxShadow: isMine ? '0 8px 18px rgba(249,115,22,0.18)' : 'none',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.76rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {message.body}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {canPostCommunication ? (
        <div style={{ padding: '0.65rem 0.75rem', borderTop: '1px solid #f8fafc', background: '#fff' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #f1f5f9',
              padding: '0.45rem 0.6rem',
            }}
          >
            <input
              type="text"
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Chat..."
              disabled={isSendingMessage}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.76rem',
                color: '#475569',
              }}
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={isSendingMessage || !composerValue.trim()}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: isSendingMessage || !composerValue.trim() ? 'not-allowed' : 'pointer',
              }}
              aria-label="Send message"
            >
              <IconSend color={composerValue.trim() ? '#f97316' : '#cbd5e1'} />
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: '0 1rem 0.85rem', color: '#b42318', fontSize: '0.74rem' }}>
          {error}
        </div>
      ) : null}
    </section>
  )
}
