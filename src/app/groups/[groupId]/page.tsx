import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getGroup, getMyGroupMembership } from '@/lib/api/groups'
import { AcceptInviteButton } from './AcceptInviteButton'
import { LeaveGroupButton } from './LeaveGroupButton'
import { InviteUserForm } from './InviteUserForm'

interface Props {
  params: Promise<{ groupId: string }>
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

  const membership = user ? await getMyGroupMembership(supabase, groupId, user.id) : null
  const isBoundaryKeeper = user?.id === group.boundary_keeper_id
  const isPending = membership?.status === 'pending'
  const isActive = membership?.status === 'active'

  return (
    <div>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/groups">Back to Groups</Link>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1>{group.name}</h1>
        {group.description && <p>{group.description}</p>}
      </header>

      <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #ccc' }}>
        <h3>Your Status</h3>
        {!membership && <p>Not a member</p>}
        {isPending && (
          <div>
            <p>Invite pending</p>
            <AcceptInviteButton groupId={groupId} />
          </div>
        )}
        {isActive && <p>Active member</p>}
        {isBoundaryKeeper && <p><strong>(Boundary Keeper)</strong></p>}
        {(isActive || isPending) && !isBoundaryKeeper && (
          <LeaveGroupButton groupId={groupId} />
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h3>
          <Link href={`/groups/${groupId}/members`}>View Members</Link>
        </h3>
      </section>

      {isBoundaryKeeper && (
        <section style={{ padding: '1rem', border: '1px solid #ccc' }}>
          <h3>Invite User</h3>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>
            Enter the user ID (UUID) to invite them to this group.
          </p>
          <InviteUserForm groupId={groupId} />
        </section>
      )}
    </div>
  )
}
