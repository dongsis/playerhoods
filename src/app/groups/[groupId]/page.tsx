import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getGroup, getMyGroupMembership, getGroupMembers, getInvitableUsers } from '@/lib/api/groups'
import { AcceptInviteButton } from './AcceptInviteButton'
import { LeaveGroupButton } from './LeaveGroupButton'
import { InviteUserForm } from './InviteUserForm'
import type { GroupMemberWithProfile, Group } from '@/lib/types/database'

interface Props {
  params: Promise<{ groupId: string }>
}

function MemberRow({ member, group }: { member: GroupMemberWithProfile; group: Group }) {
  const name = member.profile?.display_name || member.user_id
  const isBK = member.user_id === group.boundary_keeper_id
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f5f5f5', fontSize: '0.9rem' }}>
      <span>
        <strong>{name}</strong>
        {isBK && <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#666' }}>(Boundary Keeper)</span>}
      </span>
      {member.accepted_at && (
        <span style={{ color: '#aaa', fontSize: '0.78rem' }}>
          joined {new Date(member.accepted_at).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}

export default async function GroupDetailPage({ params }: Props) {
  const { groupId } = await params
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  let group
  try {
    group = await getGroup(supabase, groupId)
  } catch {
    notFound()
  }

  const isBoundaryKeeper = user?.id === group.boundary_keeper_id

  const [membership, members, invitableUsers] = await Promise.all([
    user ? getMyGroupMembership(supabase, groupId, user.id) : Promise.resolve(null),
    getGroupMembers(supabase, groupId),
    isBoundaryKeeper ? getInvitableUsers(supabase, groupId) : Promise.resolve([]),
  ])

  const isPending = membership?.status === 'pending'
  const isActive  = membership?.status === 'active'

  const activeMembers  = members.filter(m => m.status === 'active')
  const pendingMembers = members.filter(m => m.status === 'pending')
  const removedMembers = members.filter(m => m.status === 'removed')

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1rem' }}>
      <nav style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
        <Link href="/groups">← Groups</Link>
      </nav>

      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.25rem' }}>{group.name}</h1>
        {group.description && <p style={{ margin: 0, color: '#555', fontSize: '0.9rem' }}>{group.description}</p>}
      </header>

      {/* Your status */}
      <section style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #e0e0e0', borderRadius: '6px' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>Your Status</h3>
        {!membership && <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>Not a member</p>}
        {isPending && (
          <div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Invite pending — accept to join</p>
            <AcceptInviteButton groupId={groupId} />
          </div>
        )}
        {isActive && <p style={{ margin: 0, fontSize: '0.85rem' }}>Active member</p>}
        {isBoundaryKeeper && (
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', fontWeight: 600 }}>Boundary Keeper</p>
        )}
        {(isActive || isPending) && !isBoundaryKeeper && (
          <div style={{ marginTop: '0.5rem' }}>
            <LeaveGroupButton groupId={groupId} />
          </div>
        )}
      </section>

      {/* Members — inline */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Members</h2>

        {/* Active */}
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2d8a4e' }}>
            Active ({activeMembers.length})
          </h4>
          {activeMembers.length === 0
            ? <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>None.</p>
            : activeMembers.map(m => <MemberRow key={m.id} member={m} group={group} />)
          }
        </div>

        {/* Pending */}
        {pendingMembers.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706' }}>
              Pending ({pendingMembers.length})
            </h4>
            {pendingMembers.map(m => (
              <div key={m.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid #f5f5f5', fontSize: '0.9rem' }}>
                <strong>{m.profile?.display_name || m.user_id}</strong>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.78rem', color: '#aaa' }}>
                  invited {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Removed — collapsed */}
        {removedMembers.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Removed ({removedMembers.length})
            </summary>
            <div style={{ paddingLeft: '0.5rem', marginTop: '0.3rem' }}>
              {removedMembers.map(m => (
                <div key={m.id} style={{ padding: '0.3rem 0', fontSize: '0.85rem', color: '#999' }}>
                  {m.profile?.display_name || m.user_id}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Invite (Boundary Keeper only) */}
      {isBoundaryKeeper && (
        <section style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Invite User</h3>
          <InviteUserForm groupId={groupId} invitableUsers={invitableUsers} />
        </section>
      )}
    </div>
  )
}
