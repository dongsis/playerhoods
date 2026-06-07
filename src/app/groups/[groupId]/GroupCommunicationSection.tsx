'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { PlayerProfileTrigger } from '@/app/components/PlayerProfileTrigger'
import type { GroupMessageEnriched, GroupResourceEnriched } from '@/lib/api/groups'

const GROUP_RESOURCE_MESSAGE_PREFIX = '[[group-resource:'
const GROUP_RESOURCE_MESSAGE_SUFFIX = ']]'

function buildGroupResourceMessage(resourceId: string) {
  return `${GROUP_RESOURCE_MESSAGE_PREFIX}${resourceId}${GROUP_RESOURCE_MESSAGE_SUFFIX}`
}

function parseGroupResourceMessage(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed.startsWith(GROUP_RESOURCE_MESSAGE_PREFIX) || !trimmed.endsWith(GROUP_RESOURCE_MESSAGE_SUFFIX)) {
    return null
  }

  const resourceId = trimmed.slice(
    GROUP_RESOURCE_MESSAGE_PREFIX.length,
    trimmed.length - GROUP_RESOURCE_MESSAGE_SUFFIX.length,
  ).trim()

  return resourceId || null
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

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

function IconPhoto({ size = 14, color = '#64748b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7.5H8L9.5 5.5H14.5L16 7.5H19.5C20.3 7.5 21 8.2 21 9V18.5C21 19.3 20.3 20 19.5 20H4.5C3.7 20 3 19.3 3 18.5V9C3 8.2 3.7 7.5 4.5 7.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke={color} strokeWidth="1.8" />
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

function SharedPhotoCard({
  resource,
  align,
}: {
  resource: GroupResourceEnriched | null
  align: 'left' | 'right'
}) {
  const href = resource?.public_url ?? resource?.link_url ?? '#'
  const hasImage = Boolean(resource?.mime_type?.startsWith('image/') && resource.public_url)

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '360px',
        textDecoration: 'none',
        borderRadius: align === 'right' ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        overflow: 'hidden',
        border: align === 'right' ? '1px solid rgba(255,255,255,0.25)' : '1px solid #dbe4ee',
        background: align === 'right' ? 'rgba(255,255,255,0.14)' : '#ffffff',
        boxShadow: align === 'right'
          ? '0 18px 30px -24px rgba(249, 115, 22, 0.55)'
          : '0 18px 30px -24px rgba(15, 23, 42, 0.18)',
      }}
    >
      {hasImage ? (
        <img
          src={resource?.public_url ?? undefined}
          alt={resource?.title ?? 'Shared photo'}
          style={{
            display: 'block',
            width: '100%',
            height: '180px',
            objectFit: 'cover',
            background: '#e2e8f0',
          }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            height: '110px',
            background: align === 'right' ? 'rgba(255,255,255,0.12)' : '#f8fafc',
            color: align === 'right' ? '#fff' : '#475569',
          }}
        >
          <IconPhoto color={align === 'right' ? '#fff' : '#64748b'} />
        </div>
      )}

      <div
        style={{
          padding: '0.75rem 0.9rem',
          background: align === 'right' ? '#f97316' : '#ffffff',
          color: align === 'right' ? '#fff' : '#0f172a',
        }}
      >
        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 }}>
          Shared photo
        </div>
        <div style={{ marginTop: '0.25rem', fontSize: '0.96rem', fontWeight: 700, lineHeight: 1.35 }}>
          {resource?.title ?? 'Open shared photo'}
        </div>
      </div>
    </a>
  )
}

type Props = {
  groupId: string
  announcementText: string | null
  messages: GroupMessageEnriched[]
  resources: GroupResourceEnriched[]
  viewerUserId: string | null
  canAccess: boolean
  canPost: boolean
  canSharePhotos: boolean
  variant?: 'desktop' | 'mobile'
  onPostMessage: (body: string) => Promise<void>
  onCreateDiscussionPhotoResource: (data: {
    title: string
    storage_bucket: string
    storage_path: string
    public_url: string
    mime_type: string | null
    byte_size: number | null
  }) => Promise<{ id: string; title: string; public_url: string | null; mime_type: string | null }>
}

export function GroupCommunicationSection({
  groupId,
  announcementText,
  messages,
  resources,
  viewerUserId,
  canAccess,
  canPost,
  canSharePhotos,
  variant = 'desktop',
  onPostMessage,
  onCreateDiscussionPhotoResource,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSendingMessage, startSendMessage] = useTransition()
  const [isSharingPhoto, startSharePhoto] = useTransition()

  const sortedMessages = useMemo(
    () => [...messages].sort((left, right) => left.created_at.localeCompare(right.created_at)),
    [messages],
  )
  const resourceMap = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources],
  )
  const isMobile = variant === 'mobile'

  if (!canAccess) {
    return (
      <section
        style={{
          background: '#fff',
          minHeight: isMobile ? '100%' : undefined,
          borderRadius: isMobile ? 0 : '22px',
          border: isMobile ? 'none' : '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid #f1f5f9', display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconMessageCircle />
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '0.74rem', fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            Discussion
          </h2>
        </div>
        <div style={{ padding: isMobile ? '1.25rem 1rem' : '1rem', color: '#94a3b8', fontSize: '0.86rem' }}>
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

  const handlePhotoSelected = (file: File | null) => {
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only jpg, png, and webp images are supported in chat.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setError(null)
    startSharePhoto(async () => {
      const supabase = createSupabaseBrowserClient()
      const safeName = sanitizeFilename(file.name || 'photo')
      const storagePath = `${groupId}/discussion/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      let resourceCreated = false

      try {
        const { error: uploadError } = await supabase.storage
          .from('group-resources')
          .upload(storagePath, file, { upsert: false, contentType: file.type || undefined })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage.from('group-resources').getPublicUrl(storagePath)
        const resource = await onCreateDiscussionPhotoResource({
          title: file.name.replace(/\.[^.]+$/, '') || 'Shared photo',
          storage_bucket: 'group-resources',
          storage_path: storagePath,
          public_url: `${urlData.publicUrl}?t=${Date.now()}`,
          mime_type: file.type || null,
          byte_size: file.size || null,
        })
        resourceCreated = true

        await onPostMessage(buildGroupResourceMessage(resource.id))
        router.refresh()
      } catch (shareError) {
        if (!resourceCreated) {
          await supabase.storage.from('group-resources').remove([storagePath])
        }
        setError((shareError as { message?: string })?.message ?? 'Could not share photo.')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    })
  }

  return (
    <section
      style={{
        background: '#fff',
        minHeight: isMobile ? 0 : '760px',
        height: isMobile ? '100%' : undefined,
        overflow: isMobile ? 'hidden' : undefined,
        display: 'grid',
        gridTemplateRows: isMobile ? 'auto minmax(0, 1fr) auto' : 'auto auto 1fr auto',
      }}
    >
      <header
        style={{
          display: isMobile ? 'none' : 'flex',
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
        <section style={{ padding: isMobile ? '0.85rem 1rem 0' : '1.2rem 1.45rem 0' }}>
          <div
            style={{
              borderRadius: isMobile ? '14px' : '18px',
              border: '1px solid #fbbf24',
              background: '#fff9e9',
              padding: isMobile ? '0.72rem 0.8rem' : '0.9rem 1rem',
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
          minHeight: 0,
          overflowY: isMobile ? 'auto' : undefined,
          padding: isMobile ? '1rem 1rem 1.1rem' : '1rem 1.45rem 1.2rem',
          display: 'grid',
          alignContent: 'start',
          gap: isMobile ? '0.85rem' : '1rem',
        }}
      >
        {sortedMessages.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.9rem', paddingTop: isMobile ? '2rem' : '0.2rem', textAlign: isMobile ? 'center' : 'left' }}>
            <div>No messages yet.</div>
            {isMobile ? <div style={{ marginTop: '0.25rem' }}>Start the group discussion.</div> : null}
          </div>
        ) : (
          sortedMessages.map((message) => {
            const isViewer = viewerUserId != null && message.author_user_id === viewerUserId
            const resourceId = parseGroupResourceMessage(message.body)
            const linkedResource = resourceId ? (resourceMap.get(resourceId) ?? null) : null

            if (isViewer) {
              return (
                <div key={message.id} style={{ marginLeft: 'auto', maxWidth: isMobile ? '82%' : '430px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.35rem', marginBottom: '0.18rem' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>{formatMessageTime(message.created_at)}</span>
                    <span style={{ color: '#f97316', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      You
                    </span>
                  </div>
                  {resourceId ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <SharedPhotoCard resource={linkedResource} align="right" />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'inline-block',
                        borderRadius: '18px 18px 6px 18px',
                        background: '#f97316',
                        color: '#fff',
                        padding: '0.75rem 0.95rem',
                        fontSize: '0.96rem',
                        lineHeight: 1.45,
                        wordBreak: 'break-word',
                        boxShadow: '0 18px 30px -24px rgba(249, 115, 22, 0.55)',
                      }}
                    >
                      {message.body}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div key={message.id} style={{ display: 'flex', gap: isMobile ? '0.65rem' : '0.85rem', alignItems: 'flex-start' }}>
                <MessageAvatar displayName={message.author_name} avatarUrl={message.author_avatar_url} />
                <div style={{ minWidth: 0, maxWidth: isMobile ? 'calc(100% - 2.7rem)' : undefined }}>
                  <PlayerProfileTrigger
                    targetUserId={message.author_user_id}
                    className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-[#94a3b8] transition hover:text-[#0d6efd]"
                    label={`View details for ${message.author_name}`}
                  >
                    <span>{message.author_name}</span>
                  </PlayerProfileTrigger>
                  {resourceId ? (
                    <div style={{ marginTop: '0.3rem' }}>
                      <SharedPhotoCard resource={linkedResource} align="left" />
                    </div>
                  ) : (
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
                        wordBreak: 'break-word',
                      }}
                    >
                      {message.body}
                    </div>
                  )}
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
          padding: isMobile ? '0.7rem 0.75rem max(0.75rem, env(safe-area-inset-bottom))' : '0 1.45rem 1.35rem',
          borderTop: isMobile ? '1px solid #e2e8f0' : undefined,
          background: '#fff',
        }}
      >
        {isMobile ? (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
              }}
            >
              <input
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                placeholder={canPost ? 'Write a message...' : 'Only current members can chat.'}
                disabled={!canPost || isSendingMessage || isSharingPhoto}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    handleSendMessage()
                  }
                }}
                style={{
                  minWidth: 0,
                  flex: 1,
                  border: '1px solid #dbe4ee',
                  borderRadius: '999px',
                  background: '#f8fafc',
                  color: '#0f172a',
                  padding: '0.72rem 0.9rem',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
              {canSharePhotos ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handlePhotoSelected(event.target.files?.[0] ?? null)}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!canPost || isSendingMessage || isSharingPhoto}
                    aria-label={isSharingPhoto ? 'Sharing photo' : 'Share photo'}
                    style={{
                      width: '2.3rem',
                      height: '2.3rem',
                      borderRadius: '999px',
                      border: '1px solid #dbe4ee',
                      background: '#fff',
                      color: !canPost || isSendingMessage || isSharingPhoto ? '#cbd5e1' : '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: !canPost || isSendingMessage || isSharingPhoto ? 'default' : 'pointer',
                    }}
                  >
                    <IconPhoto color={!canPost || isSendingMessage || isSharingPhoto ? '#cbd5e1' : '#64748b'} />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!canPost || !composerValue.trim() || isSendingMessage || isSharingPhoto}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  background: !canPost || !composerValue.trim() || isSharingPhoto ? '#e2e8f0' : '#f97316',
                  color: !canPost || !composerValue.trim() || isSharingPhoto ? '#94a3b8' : '#fff',
                  padding: '0.68rem 0.82rem',
                  fontSize: '0.78rem',
                  fontWeight: 900,
                  cursor: !canPost || !composerValue.trim() || isSharingPhoto ? 'default' : 'pointer',
                }}
              >
                Send
              </button>
            </div>
            {error ? (
              <div style={{ marginTop: '0.45rem', color: '#dc2626', fontSize: '0.74rem', lineHeight: 1.35 }}>
                {error}
              </div>
            ) : null}
          </div>
        ) : (
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
              disabled={!canPost || isSendingMessage || isSharingPhoto}
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
            <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ color: error ? '#dc2626' : '#94a3b8', fontSize: '0.78rem' }}>
                {error ?? (canSharePhotos ? 'Public group coordination only. Photos upload as shared resources.' : 'Public group coordination only.')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                {canSharePhotos ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => handlePhotoSelected(event.target.files?.[0] ?? null)}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canPost || isSendingMessage || isSharingPhoto}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: !canPost || isSendingMessage || isSharingPhoto ? '#cbd5e1' : '#64748b',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: !canPost || isSendingMessage || isSharingPhoto ? 'default' : 'pointer',
                      }}
                    >
                      <IconPhoto color={!canPost || isSendingMessage || isSharingPhoto ? '#cbd5e1' : '#64748b'} />
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        {isSharingPhoto ? 'Sharing...' : 'Photo'}
                      </span>
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!canPost || !composerValue.trim() || isSendingMessage || isSharingPhoto}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: !canPost || !composerValue.trim() || isSharingPhoto ? '#cbd5e1' : '#f97316',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: !canPost || !composerValue.trim() || isSharingPhoto ? 'default' : 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Send
                  </span>
                  <IconSend color={!canPost || !composerValue.trim() || isSharingPhoto ? '#cbd5e1' : '#f97316'} />
                </button>
              </div>
            </div>
          </div>
        )}
      </footer>
    </section>
  )
}
