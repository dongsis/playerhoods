'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MatchMessageEnriched } from '@/lib/api/matches'
import {
  ORGANIZER_NOTE_PRESETS,
  applyOrganizerNotePreset,
  parseOrganizerNoteSentences,
  type OrganizerNotePresetItem,
} from '../organizer-note-presets'

function IconMessageCircle({ size = 12, color = '#1E293B' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18L3.5 20L4.4 16.1A8 8 0 1 1 20 12A8 8 0 0 1 7 18Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconInfo({ size = 10, color = '#0d6efd' }: { size?: number; color?: string }) {
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

function IconEdit({ size = 10, color = '#0d6efd' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20H8L18 10C18.5 9.5 18.5 8.6 18 8.1L15.9 6C15.4 5.5 14.5 5.5 14 6L4 16V20Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  organizerNoteText: string | null
  messages: MatchMessageEnriched[]
  viewerUserId: string | null
  canAccessCommunication: boolean
  canPostCommunication: boolean
  canEditOrganizerNote: boolean
  isOrganizer: boolean
  showFormedNotice: boolean
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
  messages,
  viewerUserId,
  canAccessCommunication,
  canPostCommunication,
  canEditOrganizerNote,
  isOrganizer,
  showFormedNotice,
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
  const organizerNoteSentences = useMemo(
    () => new Set(parseOrganizerNoteSentences(noteDraft)),
    [noteDraft],
  )
  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messages],
  )
  const communicationTitle = showFormedNotice
    ? 'Match Chat'
    : isOrganizer
      ? 'Player Messages'
      : 'Message Host'
  const communicationHelper = showFormedNotice
    ? 'Confirmed players can chat together here.'
    : isOrganizer
      ? 'Before the match is formed, each player can message you directly.'
      : 'Ask a question or send an update to the organizer.'
  const inputPlaceholder = showFormedNotice ? 'Message match...' : 'Message host...'

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

  const appendOrganizerNote = (item: OrganizerNotePresetItem) => {
    setNoteDraft((prev) => applyOrganizerNotePreset(prev, item))
  }

  return (
    <section
      id="match-communication"
      style={{
        marginBottom: '1rem',
        background: '#fff',
        borderRadius: '24px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.7rem 1rem',
          borderBottom: '1px solid #F1F5F9',
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
            color: '#1E293B',
          }}
        >
          {communicationTitle}
        </h2>
      </div>

      <div
        style={{
          padding: '0.6rem 1rem',
          borderBottom: '1px solid #F1F5F9',
          color: '#64748b',
          fontSize: '0.74rem',
          fontWeight: 600,
        }}
      >
        {communicationHelper}
      </div>

      {showFormedNotice ? (
        <div
          style={{
            padding: '0.65rem 1rem',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            color: '#64748b',
            fontSize: '0.74rem',
            fontWeight: 600,
          }}
        >
          Match formed - only confirmed players can view and chat here.
        </div>
      ) : null}

      {(hasOrganizerNote || canEditOrganizerNote) ? (
        <div
          style={{
            background: hasOrganizerNote || isEditingNote ? '#eff6ff' : '#fff',
            padding: '0.7rem 1rem',
            borderBottom: '1px solid rgba(13, 110, 253, 0.12)',
          }}
        >
          {isEditingNote ? (
            <div style={{ display: 'grid', gap: '0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.32rem' }}>
                <IconInfo />
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0d6efd' }}>
                  Host Note
                </span>
              </div>
              <div style={organizerNoteComposerStyle}>
                <div style={organizerPresetWrapStyle}>
                  {ORGANIZER_NOTE_PRESETS.map((group) => (
                    <div key={group.label} style={organizerPresetGroupStyle}>
                      <span style={organizerPresetLabelStyle}>{group.label}</span>
                      <div style={organizerPresetItemsStyle}>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => appendOrganizerNote(item)}
                            style={organizerNoteSentences.has(item.full) ? organizerPresetChipActiveStyle : organizerPresetChipStyle}
                          >
                            {item.chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    rows={4}
                    placeholder="Add a short note for players..."
                    style={organizerNoteTextareaStyle}
                  />
                  {noteDraft.trim() ? (
                    <button
                      type="button"
                      onClick={() => setNoteDraft('')}
                      aria-label="Clear host note"
                      style={organizerNoteClearStyle}
                    >
                      x
                    </button>
                  ) : null}
                </div>
              </div>
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
                    background: '#0d6efd',
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
                <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0d6efd' }}>
                  Host Note
                </span>
                {canEditOrganizerNote ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingNote(true)}
                    style={{
                      marginLeft: 'auto',
                      border: 'none',
                      background: 'transparent',
                      color: '#0d6efd',
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
                border: '1px dashed #0d6efd',
                borderRadius: '999px',
                background: '#fff',
                color: '#0d6efd',
                padding: '0.38rem 0.8rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Add host note
            </button>
          )}
        </div>
      ) : null}

      <div style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.9rem' }}>
        {sortedMessages.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8' }}>No messages yet.</p>
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
                        color: isMine ? '#0d6efd' : '#1E293B',
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
                        background: isMine ? '#0d6efd' : '#F8FAFC',
                        color: isMine ? '#fff' : '#475569',
                        border: isMine ? 'none' : '1px solid #E2E8F0',
                        boxShadow: isMine ? '0 8px 18px rgba(13, 110, 253, 0.18)' : 'none',
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
        <div style={{ padding: '0.65rem 0.75rem', borderTop: '1px solid #F1F5F9', background: '#fff' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#F8FAFC',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
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
              placeholder={inputPlaceholder}
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
              <IconSend color={composerValue.trim() ? '#0d6efd' : '#CBD5E1'} />
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

const organizerNoteComposerStyle = {
  display: 'grid',
  gap: '0.7rem',
  borderRadius: '16px',
  border: '1px solid #E2E8F0',
  background: '#F8FAFC',
  padding: '0.8rem',
} as const

const organizerPresetWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.7rem 1rem',
} as const

const organizerPresetGroupStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.45rem',
  paddingRight: '0.9rem',
  borderRight: '1px solid #E2E8F0',
} as const

const organizerPresetLabelStyle = {
  fontSize: '0.66rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#94A3B8',
} as const

const organizerPresetItemsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.35rem',
} as const

const organizerPresetChipStyle = {
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  background: '#fff',
  color: '#64748B',
  padding: '0.34rem 0.55rem',
  fontSize: '0.68rem',
  fontWeight: 700,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  cursor: 'pointer',
} as const

const organizerPresetChipActiveStyle = {
  ...organizerPresetChipStyle,
  border: '1px solid rgba(13, 110, 253, 0.35)',
  background: '#eff6ff',
  color: '#0d6efd',
} as const

const organizerNoteTextareaStyle = {
  width: '100%',
  resize: 'vertical' as const,
  borderRadius: '12px',
  border: '1px solid #E2E8F0',
  background: '#fff',
  padding: '0.75rem 2.1rem 0.75rem 0.8rem',
  fontSize: '0.78rem',
  color: '#475569',
  outline: 'none',
  minHeight: '6rem',
  lineHeight: 1.55,
} as const

const organizerNoteClearStyle = {
  position: 'absolute',
  right: '0.55rem',
  top: '0.55rem',
  borderRadius: '8px',
  border: '1px solid #E2E8F0',
  background: '#fff',
  color: '#94A3B8',
  padding: '0.1rem 0.35rem',
  fontSize: '0.72rem',
  cursor: 'pointer',
} as const
