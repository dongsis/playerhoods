'use client'

import { useState, useTransition } from 'react'
import type { Group, GroupMember } from '@/lib/types/database'

interface Props {
  membership: GroupMember & { group: Group }
  // User's global display_name — shown as fallback when no alias is set
  userDisplayName: string
  onSetAlias: (groupId: string, alias: string) => Promise<void>
}

/**
 * One row in the "Group Aliases" section of the identity page.
 * v1.5 display priority (within this group context):
 *   personal_remark (set by viewer) > group_display_name (this field) > display_name
 */
export function GroupAliasRow({ membership, userDisplayName, onSetAlias }: Props) {
  const { group, group_display_name } = membership
  const [editing, setEditing] = useState(false)
  const [alias, setAlias] = useState(group_display_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // effective name this user appears as within the group (from their perspective, no personal_remark)
  const effectiveName = group_display_name || userDisplayName

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await onSetAlias(group.id, alias.trim())
        setEditing(false)
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to save alias')
      }
    })
  }

  const handleClear = () => {
    setError(null)
    startTransition(async () => {
      try {
        await onSetAlias(group.id, '')
        setAlias('')
      } catch (err: unknown) {
        setError((err as { message?: string })?.message ?? 'Failed to clear alias')
      }
    })
  }

  const handleCancel = () => {
    setAlias(group_display_name ?? '')
    setEditing(false)
    setError(null)
  }

  return (
    <div style={{ padding: '0.75rem 0', borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{group.name}</div>

          {/* Effective name callout */}
          <div style={{ fontSize: '0.8rem', color: '#555', marginTop: '0.15rem' }}>
            Appears as:{' '}
            <strong style={{ color: group_display_name ? '#333' : '#888' }}>
              {effectiveName}
            </strong>
            {group_display_name ? (
              <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: '#2d8a4e', background: '#f0fdf4', padding: '0 0.3rem', borderRadius: '3px' }}>
                alias
              </span>
            ) : (
              <span style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: '#aaa' }}>
                (global name)
              </span>
            )}
          </div>

          {group.description && (
            <div style={{ fontSize: '0.75rem', color: '#bbb', marginTop: '0.1rem' }}>
              {group.description}
            </div>
          )}
        </div>

        {!editing && (
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            <button
              onClick={() => { setEditing(true); setError(null); setAlias(group_display_name ?? '') }}
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
            >
              {group_display_name ? 'Edit alias' : 'Set alias'}
            </button>
            {group_display_name && (
              <button
                onClick={handleClear}
                disabled={isPending}
                style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', color: '#c00', background: 'none', border: '1px solid #c00', borderRadius: '3px', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={alias}
            onChange={e => setAlias(e.target.value)}
            maxLength={32}
            autoFocus
            placeholder={`Alias within "${group.name}" (max 32 chars)`}
            style={{ padding: '0.3rem 0.5rem', flex: 1, minWidth: '160px', fontSize: '0.9rem' }}
          />
          <span style={{ fontSize: '0.72rem', color: '#aaa', whiteSpace: 'nowrap' }}>
            {alias.trim().length}/32
          </span>
          <button
            type="submit"
            disabled={isPending}
            style={{ padding: '0.3rem 0.7rem', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {isPending ? '...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            style={{ fontSize: '0.85rem', padding: '0.3rem 0.5rem' }}
          >
            Cancel
          </button>
        </form>
      )}

      {error && <p style={{ color: 'red', fontSize: '0.8rem', margin: '0.25rem 0 0' }}>{error}</p>}
    </div>
  )
}
