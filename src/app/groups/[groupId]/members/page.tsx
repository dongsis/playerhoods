import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGroup, getGroupMembers } from '@/lib/api/groups'

interface Props {
  params: Promise<{ groupId: string }>
}

export default async function GroupMembersPage({ params }: Props) {
  const { groupId } = await params
  const supabase = await createSupabaseServerClient()

  let group
  try {
    group = await getGroup(supabase, groupId)
  } catch {
    notFound()
  }

  const members = await getGroupMembers(supabase, groupId)

  // Group members by status
  const pendingMembers = members.filter((m) => m.status === 'pending')
  const activeMembers = members.filter((m) => m.status === 'active')
  const removedMembers = members.filter((m) => m.status === 'removed')

  return (
    <div>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href={`/groups/${groupId}`}>Back to {group.name}</Link>
      </nav>

      <h1>Members of {group.name}</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Active ({activeMembers.length})</h2>
        {activeMembers.length === 0 ? (
          <p>No active members</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {activeMembers.map((member) => (
              <li key={member.id} style={{ padding: '0.5rem', border: '1px solid #ccc', marginBottom: '0.25rem' }}>
                <strong>{member.profile?.display_name || member.user_id}</strong>
                {member.user_id === group.boundary_keeper_id && (
                  <span style={{ marginLeft: '0.5rem', color: '#666' }}>(Boundary Keeper)</span>
                )}
                <br />
                <small>Joined: {member.accepted_at ? new Date(member.accepted_at).toLocaleDateString() : 'N/A'}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>Pending ({pendingMembers.length})</h2>
        {pendingMembers.length === 0 ? (
          <p>No pending invites</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {pendingMembers.map((member) => (
              <li key={member.id} style={{ padding: '0.5rem', border: '1px solid #f0ad4e', marginBottom: '0.25rem' }}>
                <strong>{member.profile?.display_name || member.user_id}</strong>
                <br />
                <small>Invited: {new Date(member.created_at).toLocaleDateString()}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details style={{ marginBottom: '2rem' }}>
        <summary style={{ cursor: 'pointer' }}>Removed ({removedMembers.length})</summary>
        {removedMembers.length === 0 ? (
          <p>No removed members</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '0.5rem' }}>
            {removedMembers.map((member) => (
              <li key={member.id} style={{ padding: '0.5rem', border: '1px solid #d9534f', marginBottom: '0.25rem', opacity: 0.6 }}>
                <strong>{member.profile?.display_name || member.user_id}</strong>
                <br />
                <small>Removed: {member.removed_at ? new Date(member.removed_at).toLocaleDateString() : 'N/A'}</small>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  )
}
