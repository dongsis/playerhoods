'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { GroupResourceEnriched } from '@/lib/api/groups'
import type { GroupResourceTag } from '@/lib/types/database'

const RESOURCE_TAGS: GroupResourceTag[] = ['Rules', 'Fees', 'Schedule', 'Venue', 'Photo', 'Other']

function IconFile({ size = 15, color = '#64748b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3.5H14L19 8.5V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 20V5A1.5 1.5 0 0 1 8.5 3.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3.5V8.5H19" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function IconLink({ size = 15, color = '#64748b' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 14L8.5 15.5A3.5 3.5 0 1 1 3.5 10.5L7 7A3.5 3.5 0 0 1 12 7.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 10L15.5 8.5A3.5 3.5 0 0 1 20.5 13.5L17 17A3.5 3.5 0 0 1 12 16.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 15.5L15.5 8.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconPin({ size = 11, color = '#4f46e5' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H15L14 10L18 14V16H13V20L11 18V16H6V14L10 10L9 4Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return null
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

type Props = {
  groupId: string
  resources: GroupResourceEnriched[]
  canManage: boolean
  onCreateLink: (data: { title: string; tag: GroupResourceTag; link_url: string }) => Promise<void>
  onCreateFile: (data: {
    title: string
    tag: GroupResourceTag
    storage_bucket: string
    storage_path: string
    public_url: string
    mime_type: string | null
    byte_size: number | null
  }) => Promise<void>
  onSetPinned: (resourceId: string, isPinned: boolean) => Promise<void>
  onSetArchived: (resourceId: string, archived: boolean) => Promise<void>
  onDelete: (resourceId: string) => Promise<void>
}

export function GroupResourcesSection({
  groupId,
  resources,
  canManage,
  onCreateLink,
  onCreateFile,
  onSetPinned,
  onSetArchived,
  onDelete,
}: Props) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'none' | 'file' | 'link'>('none')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTag, setLinkTag] = useState<GroupResourceTag>('Other')
  const [fileTitle, setFileTitle] = useState('')
  const [fileTag, setFileTag] = useState<GroupResourceTag>('Other')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isPending, startTransition] = useTransition()

  const pinnedResources = useMemo(
    () => resources.filter((resource) => resource.archived_at == null && resource.is_pinned),
    [resources],
  )
  const recentResources = useMemo(
    () => resources.filter((resource) => resource.archived_at == null && !resource.is_pinned),
    [resources],
  )
  const archivedResources = useMemo(
    () => resources.filter((resource) => resource.archived_at != null),
    [resources],
  )
  const activeCount = pinnedResources.length + recentResources.length

  const resetEditors = () => {
    setEditorMode('none')
    setLinkTitle('')
    setLinkUrl('')
    setLinkTag('Other')
    setFileTitle('')
    setFileTag('Other')
    setSelectedFile(null)
  }

  const withTransition = (work: () => Promise<void>) => {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      try {
        await work()
        router.refresh()
      } catch (actionError) {
        setError((actionError as { message?: string })?.message ?? 'Could not update resources.')
      }
    })
  }

  const handleCreateLink = () => {
    withTransition(async () => {
      await onCreateLink({
        title: linkTitle,
        tag: linkTag,
        link_url: linkUrl,
      })
      resetEditors()
      setSuccess('Link added.')
    })
  }

  const handleCreateFile = () => {
    if (!selectedFile) {
      setError('Please choose a file.')
      return
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      setError('Only PDF and jpg/png/webp files are supported.')
      return
    }

    withTransition(async () => {
      const safeName = sanitizeFilename(selectedFile.name || 'resource')
      const storagePath = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('group-resources')
        .upload(storagePath, selectedFile, { upsert: false, contentType: selectedFile.type || undefined })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('group-resources').getPublicUrl(storagePath)

      try {
        await onCreateFile({
          title: fileTitle || selectedFile.name.replace(/\.[^.]+$/, ''),
          tag: fileTag,
          storage_bucket: 'group-resources',
          storage_path: storagePath,
          public_url: `${urlData.publicUrl}?t=${Date.now()}`,
          mime_type: selectedFile.type || null,
          byte_size: selectedFile.size || null,
        })
      } catch (createError) {
        await supabase.storage.from('group-resources').remove([storagePath])
        throw createError
      }

      resetEditors()
      setSuccess('File added.')
    })
  }

  const handleDelete = (resource: GroupResourceEnriched) => {
    withTransition(async () => {
      await onDelete(resource.id)
      if (resource.storage_path) {
        await supabase.storage.from('group-resources').remove([resource.storage_path])
      }
      setSuccess('Resource deleted.')
    })
  }

  return (
    <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', gap: '0.75rem' }}>
        <div>
          <div
            style={{
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            Resources
          </div>
        </div>
        {canManage ? (
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setEditorMode((current) => current === 'file' ? 'none' : 'file')}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '999px',
                background: editorMode === 'file' ? '#eff6ff' : '#fff',
                color: '#334155',
                padding: '0.38rem 0.75rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setEditorMode((current) => current === 'link' ? 'none' : 'link')}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '999px',
                background: editorMode === 'link' ? '#eff6ff' : '#fff',
                color: '#334155',
                padding: '0.38rem 0.75rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Add link
            </button>
          </div>
        ) : null}
      </div>

      {canManage && editorMode !== 'none' ? (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            background: '#f8fafc',
            padding: '0.8rem',
            display: 'grid',
            gap: '0.6rem',
            marginBottom: '0.85rem',
          }}
        >
          {editorMode === 'file' ? (
            <>
              <input
                type="text"
                value={fileTitle}
                onChange={(event) => setFileTitle(event.target.value)}
                placeholder="Title"
                style={{ width: '100%', border: '1px solid #dbe4ee', borderRadius: '10px', padding: '0.6rem 0.7rem', fontSize: '0.84rem' }}
              />
              <select
                value={fileTag}
                onChange={(event) => setFileTag(event.target.value as GroupResourceTag)}
                style={{ width: '100%', border: '1px solid #dbe4ee', borderRadius: '10px', padding: '0.6rem 0.7rem', fontSize: '0.84rem', background: '#fff' }}
              >
                {RESOURCE_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                style={{ fontSize: '0.8rem', color: '#475569' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={resetEditors} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  Close
                </button>
                <button type="button" onClick={handleCreateFile} disabled={isPending} style={{ border: 'none', borderRadius: '999px', background: '#0f172a', color: '#fff', padding: '0.42rem 0.9rem', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  Add file
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
                placeholder="Title"
                style={{ width: '100%', border: '1px solid #dbe4ee', borderRadius: '10px', padding: '0.6rem 0.7rem', fontSize: '0.84rem' }}
              />
              <input
                type="url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://..."
                style={{ width: '100%', border: '1px solid #dbe4ee', borderRadius: '10px', padding: '0.6rem 0.7rem', fontSize: '0.84rem' }}
              />
              <select
                value={linkTag}
                onChange={(event) => setLinkTag(event.target.value as GroupResourceTag)}
                style={{ width: '100%', border: '1px solid #dbe4ee', borderRadius: '10px', padding: '0.6rem 0.7rem', fontSize: '0.84rem', background: '#fff' }}
              >
                {RESOURCE_TAGS.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" onClick={resetEditors} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  Close
                </button>
                <button type="button" onClick={handleCreateLink} disabled={isPending} style={{ border: 'none', borderRadius: '999px', background: '#0f172a', color: '#fff', padding: '0.42rem 0.9rem', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  Add link
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {(error || success) ? (
        <div style={{ marginBottom: '0.7rem', color: error ? '#dc2626' : '#16a34a', fontSize: '0.76rem' }}>
          {error ?? success}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: '0.85rem' }}>
        <ResourceBlock title={null} emptyText="No pinned resources." resources={pinnedResources} canManage={canManage} onSetPinned={onSetPinned} onSetArchived={onSetArchived} onDelete={handleDelete} />
        <ResourceBlock title={null} emptyText={activeCount === 0 ? 'No resources yet.' : 'No recent resources.'} resources={recentResources} canManage={canManage} onSetPinned={onSetPinned} onSetArchived={onSetArchived} onDelete={handleDelete} />

        <div>
          <button
            type="button"
            onClick={() => setIsArchiveOpen((current) => !current)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              color: '#94a3b8',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Archive {archivedResources.length > 0 ? `(${archivedResources.length})` : ''}
          </button>
          {isArchiveOpen ? (
            <div style={{ marginTop: '0.65rem' }}>
              <ResourceBlock title={null} emptyText="No archived resources." resources={archivedResources} canManage={canManage} onSetPinned={onSetPinned} onSetArchived={onSetArchived} onDelete={handleDelete} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ResourceBlock({
  title,
  emptyText,
  resources,
  canManage,
  onSetPinned,
  onSetArchived,
  onDelete,
}: {
  title: string | null
  emptyText: string
  resources: GroupResourceEnriched[]
  canManage: boolean
  onSetPinned: (resourceId: string, isPinned: boolean) => Promise<void>
  onSetArchived: (resourceId: string, archived: boolean) => Promise<void>
  onDelete: (resource: GroupResourceEnriched) => void
}) {
  const router = useRouter()
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleAsync = (resourceId: string, work: () => Promise<void>) => {
    setPendingResourceId(resourceId)
    startTransition(async () => {
      try {
        await work()
        router.refresh()
      } finally {
        setPendingResourceId(null)
      }
    })
  }

  return (
    <div>
      {title ? (
        <div
          style={{
            marginBottom: '0.55rem',
            color: '#94a3b8',
            fontSize: '0.68rem',
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
      ) : null}

      {resources.length === 0 ? (
        <div
          style={{
            borderRadius: '14px',
            border: '1px dashed #d1d5db',
            background: '#f8fafc',
            padding: '0.85rem',
            color: '#94a3b8',
            fontSize: '0.82rem',
          }}
        >
          {emptyText}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          {resources.map((resource) => {
            const href = resource.resource_type === 'link' ? resource.link_url : resource.public_url
            const isImage = resource.mime_type?.startsWith('image/') && resource.public_url
            const isBusy = isPending && pendingResourceId === resource.id

            return (
              <div
                key={resource.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  background: '#fff',
                  padding: '0.7rem',
                  display: 'grid',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
                  {isImage ? (
                    <img
                      src={resource.public_url ?? undefined}
                      alt=""
                      style={{ width: '2.6rem', height: '2.6rem', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
                    />
                  ) : (
                    <div style={{ width: '2.4rem', height: '2.4rem', borderRadius: '10px', display: 'grid', placeItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                      {resource.resource_type === 'link' ? <IconLink /> : <IconFile />}
                    </div>
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <a
                        href={href ?? '#'}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {resource.title}
                      </a>
                      <span style={{ borderRadius: '999px', background: '#eff6ff', color: '#4f46e5', padding: '0.08rem 0.45rem', fontSize: '0.62rem', fontWeight: 700 }}>
                        {resource.tag}
                      </span>
                      {resource.is_pinned ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', borderRadius: '999px', background: '#eef2ff', color: '#4f46e5', padding: '0.08rem 0.45rem', fontSize: '0.62rem', fontWeight: 700 }}>
                          <IconPin />
                          Pinned
                        </span>
                      ) : null}
                    </div>
                    <div style={{ marginTop: '0.18rem', color: '#94a3b8', fontSize: '0.72rem' }}>
                      {resource.resource_type === 'link' ? 'Link' : (formatBytes(resource.byte_size) ?? 'File')}
                      {resource.created_at ? ` · ${formatDate(resource.created_at)}` : ''}
                    </div>
                  </div>
                </div>

                {canManage ? (
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {resource.archived_at == null ? (
                      <button
                        type="button"
                        onClick={() => handleAsync(resource.id, () => onSetPinned(resource.id, !resource.is_pinned))}
                        disabled={isBusy}
                        style={{ border: '1px solid #dbe4ee', borderRadius: '999px', background: '#fff', color: '#334155', padding: '0.28rem 0.65rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        {resource.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleAsync(resource.id, () => onSetArchived(resource.id, resource.archived_at == null))}
                      disabled={isBusy}
                      style={{ border: '1px solid #dbe4ee', borderRadius: '999px', background: '#fff', color: '#334155', padding: '0.28rem 0.65rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {resource.archived_at == null ? 'Archive' : 'Restore'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(resource)}
                      disabled={isBusy}
                      style={{ border: '1px solid #fecaca', borderRadius: '999px', background: '#fff', color: '#dc2626', padding: '0.28rem 0.65rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
