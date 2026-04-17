'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { inviteGroupToMatch, type MatchGroupInvite } from '@/lib/api/matches'
import type { Group } from '@/lib/types/database'

interface Props {
  matchId: string
  groups: Group[]
  invitedGroups: MatchGroupInvite[]
}

export function InviteGroupForm({ matchId, groups, invitedGroups }: Props) {
  const router = useRouter()
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const availableGroups = useMemo(() => {
    const invitedIds = new Set(invitedGroups.map((group) => group.group_id))
    return groups.filter((group) => !invitedIds.has(group.id))
  }, [groups, invitedGroups])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!groupId) return
    setLoading(true)
    setError(null)
    setSuccess(null)
    const supabase = createSupabaseBrowserClient()
    try {
      const invite = await inviteGroupToMatch(supabase, matchId, groupId)
      setSuccess(invite?.group_name ?? 'Group invited.')
      setGroupId('')
      router.refresh()
    } catch (submitError) {
      setError((submitError as { message?: string })?.message ?? 'Failed to invite Shared Group')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      <p style={{ color: '#667085', fontSize: '0.75rem', margin: 0 }}>
        {invitedGroups.length > 0 ? `${invitedGroups.length} Shared Groups invited` : 'No Shared Groups invited'}
      </p>

      {invitedGroups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {invitedGroups.map((group) => (
            <span
              key={group.group_id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '999px',
                background: '#eff6ff',
                color: '#1d4ed8',
                padding: '0.24rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              {group.group_name}
            </span>
          ))}
        </div>
      )}

      {availableGroups.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.85rem', margin: 0 }}>
          No Shared Groups available.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              required
              style={{ padding: '0.4rem 0.5rem', flex: 1, minWidth: '180px', fontSize: '0.9rem' }}
            >
              <option value="">Select a Shared Group</option>
              {availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button type="submit" disabled={loading || !groupId} style={{ padding: '0.4rem 0.8rem' }}>
              {loading ? 'Inviting...' : 'Invite'}
            </button>
          </div>
        </form>
      )}

      {error && <p style={{ color: 'red', fontSize: '0.8rem', margin: 0 }}>{error}</p>}
      {success && <p style={{ color: 'green', fontSize: '0.8rem', margin: 0 }}>Invited {success}.</p>}
    </div>
  )
}
