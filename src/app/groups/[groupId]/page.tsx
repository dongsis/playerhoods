import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  getGroup,
  getGroupContacts,
  getGroupMembers,
  getInvitableUsers,
  getMyGroupMembership,
  type GroupContactWithDisplay,
  listGroupMessages,
  listGroupResources,
} from '@/lib/api/groups'
import { listSports } from '@/lib/api/sports'
import { AcceptInviteButton } from './AcceptInviteButton'
import { LeaveGroupButton } from './LeaveGroupButton'
import { Avatar } from '@/app/components/Avatar'
import { SaveContactPlayerButton } from '@/app/components/SaveContactPlayerButton'
import { getContactPlayerResolution } from '@/lib/api/roster'
import { getMyVenueIdentities } from '@/lib/api/identities'
import { GroupCommunicationSection } from './GroupCommunicationSection'
import { GroupResourcesSection } from './GroupResourcesSection'
import { AddGroupMemberPanel } from './AddGroupMemberPanel'
import { GroupSettingsPanel } from './GroupSettingsPanel'
import { GroupDetailPageShell } from './GroupDetailPageShell'
import { getGroupIconMeta } from '@/lib/group-icons'
import {
  createGroupDiscussionPhotoResourceAction,
  createGroupFileResourceAction,
  createGroupLinkResourceAction,
  deleteGroupResourceAction,
  postGroupMessageAction,
  setGroupResourceArchivedAction,
  setGroupResourcePinnedAction,
  updateGroupSettingsAction,
} from './actions'
import type { Group, GroupMemberWithProfile } from '@/lib/types/database'

interface Props {
  params: Promise<{ groupId: string }>
}

function getAvatarLabel(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

function MemberListItem({
  member,
  group,
  currentUserId,
}: {
  member: GroupMemberWithProfile
  group: Group
  currentUserId: string | null
}) {
  const name = member.profile?.display_name || member.user_id
  const avatarUrl = member.profile?.avatar_url ?? null
  const isKeeper = member.user_id === group.boundary_keeper_id
  const isCurrentUser = currentUserId === member.user_id

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.55rem',
        padding: '0.18rem 0',
      }}
    >
      <div style={{ position: 'relative', width: '1.8rem', height: '1.8rem', flexShrink: 0 }}>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: '50%',
            transform: 'translate(-40%, -50%)',
            width: '0.38rem',
            height: '0.38rem',
            borderRadius: '999px',
            background: isCurrentUser || isKeeper ? '#22c55e' : '#cbd5e1',
            border: '2px solid #fff',
          }}
        />
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            style={{
              width: '1.8rem',
              height: '1.8rem',
              borderRadius: '999px',
              objectFit: 'cover',
              background: '#eef2f7',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '1.8rem',
              height: '1.8rem',
              borderRadius: '999px',
              background: '#1E3A5F',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
            }}
          >
            {getAvatarLabel(name)}
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#0f172a', fontSize: '0.98rem', fontWeight: 600 }}>{name}</span>
          {isCurrentUser ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '999px',
                background: '#eef2ff',
                color: '#4f46e5',
                padding: '0.08rem 0.45rem',
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              You
            </span>
          ) : null}
        </div>
        {isKeeper ? (
          <div
            style={{
              marginTop: '0.1rem',
              color: '#4f46e5',
              fontSize: '0.66rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Coordinator
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ContactListItem({
  groupId,
  contact,
  currentPersonId,
}: {
  groupId: string
  contact: Pick<GroupContactWithDisplay, 'group_contact_id' | 'guest_id' | 'display_name' | 'person_id'>
  currentPersonId: string | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.55rem',
        padding: '0.18rem 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
        <div style={{ position: 'relative', width: '1.8rem', height: '1.8rem', flexShrink: 0 }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translate(-40%, -50%)',
              width: '0.38rem',
              height: '0.38rem',
              borderRadius: '999px',
              background: '#cbd5e1',
              border: '2px solid #fff',
            }}
          />
          <Avatar
            src={null}
            displayName={contact.display_name}
            size="md"
            fallback="contact"
            className="h-[1.8rem] w-[1.8rem]"
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#0f172a', fontSize: '0.98rem', fontWeight: 600 }}>{contact.display_name}</span>
          </div>
        </div>
      </div>
      <SaveContactPlayerButton
        guestId={contact.guest_id}
        source="group_contact"
        groupId={groupId}
        hidden={Boolean(currentPersonId && contact.person_id === currentPersonId)}
        compact
        saveLabel="Save player"
      />
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

  const [membership, members, groupContacts, sportRow, sports, myIdentities, groupVenueRow, mePersonRow] = await Promise.all([
    user ? getMyGroupMembership(supabase, groupId, user.id) : Promise.resolve(null),
    getGroupMembers(supabase, groupId),
    getGroupContacts(supabase, groupId),
    group.primary_sport_id
      ? supabase.from('sports').select('display_name').eq('id', group.primary_sport_id).single()
      : Promise.resolve({ data: null, error: null }),
    listSports(supabase),
    user ? getMyVenueIdentities(supabase, user.id) : Promise.resolve([]),
    group.venue_id
      ? supabase.from('venues').select('id, name').eq('id', group.venue_id).single()
      : Promise.resolve({ data: null, error: null }),
    user
      ? supabase.from('people').select('person_id').eq('linked_user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const isBoundaryKeeper = user?.id === group.boundary_keeper_id
  const isPending = membership?.status === 'pending'
  const isActive = membership?.status === 'active'
  const canManageMembership = Boolean(isActive)
  const activeMembers = members.filter((member) => member.status === 'active')
  const sportName = sportRow?.data?.display_name ?? null
  const groupVenueName = ((groupVenueRow.data as { id: string; name: string } | null)?.name) ?? null
  const myPersonId = ((mePersonRow.data as { person_id: string } | null)?.person_id) ?? null
  const invitableUsers = canManageMembership ? await getInvitableUsers(supabase, groupId) : []
  const availableContactPlayers = canManageMembership
    ? await getContactPlayerResolution(supabase)
    : []
  const existingGroupContactIds = new Set(groupContacts.map((contact) => contact.guest_id))
  const addableContactPlayers = availableContactPlayers
    .filter((contact) => !existingGroupContactIds.has(contact.guest_id))
    .map((contact) => ({
      guest_id: contact.guest_id,
      display_name: contact.display_name,
    }))
  const totalListedPeople = activeMembers.length + groupContacts.length
  const groupIcon = getGroupIconMeta(group.icon_key)

  const announcementText = group.description?.trim() || null
  const canAccessDiscussion = Boolean(isActive)
  const canPostDiscussion = Boolean(isActive)
  const [groupMessages, groupResources] = canAccessDiscussion
    ? await Promise.all([
        listGroupMessages(supabase, groupId, group.boundary_keeper_id),
        listGroupResources(supabase, groupId),
      ])
    : [[], []]

  return (
    <GroupDetailPageShell>
    <div style={{ maxWidth: '1320px', padding: '1rem 1.25rem 1.5rem 0' }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <Link
          href="/groups"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: '#64748b',
            textDecoration: 'none',
            fontSize: '0.84rem',
            fontWeight: 700,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }}>{'<'}</span>
          Groups
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gap: '0',
          gridTemplateColumns: '300px minmax(0, 1fr)',
          border: '1px solid #E2E8F0',
          borderRadius: '28px',
          background: '#fff',
          overflow: 'hidden',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
        }}
      >
        <aside
          style={{
            borderRight: '1px solid #E2E8F0',
            padding: '1.15rem 0.9rem 1rem',
            background: '#fff',
            display: 'grid',
            alignContent: 'start',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.8rem' }}>
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: '2.75rem',
                    height: '2.75rem',
                    borderRadius: '18px',
                    border: '1px solid #E2E8F0',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                  }}
                >
                  {groupIcon.emoji}
                </div>
                <div style={{ minWidth: 0 }}>
                <h1 style={{ margin: 0, color: '#1E293B', fontSize: '2rem', lineHeight: 1.04, fontWeight: 800 }}>
                  {group.name}
                </h1>
                <p style={{ margin: '0.5rem 0 0', color: '#94a3b8', fontSize: '0.92rem' }}>
                  {activeMembers.length} members · {sportName ?? 'Sport to be assigned'}
                </p>
                </div>
              </div>
            </div>
          </div>

          {isPending ? (
            <div
              style={{
                borderRadius: '18px',
                border: '1px solid #e0e7ff',
                background: '#f8faff',
                padding: '0.9rem',
              }}
            >
              <div style={{ color: '#475467', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '0.65rem' }}>
                Invite pending. Accept to join this Shared Group.
              </div>
              <AcceptInviteButton groupId={groupId} />
            </div>
          ) : null}

          {isBoundaryKeeper ? (
            <GroupSettingsPanel
              groupName={group.name}
              description={group.description}
              primarySportId={group.primary_sport_id}
              venueId={group.venue_id}
              openToClubMembers={group.open_to_club_members}
              sports={sports}
              venues={myIdentities.map((identity) => identity.venue)}
              onSave={updateGroupSettingsAction.bind(null, groupId)}
            />
          ) : null}

          {canManageMembership ? (
            <AddGroupMemberPanel
              groupId={groupId}
              invitableUsers={invitableUsers}
              contacts={addableContactPlayers}
            />
          ) : null}

          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <div
                style={{
                  color: '#94a3b8',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                Members
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontWeight: 700 }}>
                {totalListedPeople} TOTAL
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.3rem' }}>
              {totalListedPeople === 0 ? (
                <div style={{ color: '#98a2b3', fontSize: '0.88rem' }}>No players yet.</div>
              ) : (
                <>
                  {activeMembers.map((member) => (
                    <MemberListItem
                      key={member.id}
                      member={member}
                      group={group}
                      currentUserId={user?.id ?? null}
                    />
                  ))}
                  {groupContacts.map((contact) => (
                    <ContactListItem
                      key={contact.group_contact_id}
                      groupId={groupId}
                      contact={contact}
                      currentPersonId={myPersonId}
                    />
                  ))}
                </>
              )}
            </div>
          </section>

          <GroupResourcesSection
            groupId={groupId}
            resources={groupResources}
            canManage={isBoundaryKeeper}
            onCreateLink={createGroupLinkResourceAction.bind(null, groupId)}
            onCreateFile={createGroupFileResourceAction.bind(null, groupId)}
            onSetPinned={setGroupResourcePinnedAction.bind(null, groupId)}
            onSetArchived={setGroupResourceArchivedAction.bind(null, groupId)}
            onDelete={deleteGroupResourceAction.bind(null, groupId)}
          />

          {isActive && !isBoundaryKeeper ? (
            <div style={{ paddingTop: '0.4rem' }}>
              <LeaveGroupButton groupId={groupId} />
            </div>
          ) : null}
        </aside>

        <main style={{ background: '#fff' }}>
          <GroupCommunicationSection
            announcementText={announcementText}
            messages={groupMessages}
            resources={groupResources}
            viewerUserId={user?.id ?? null}
            canAccess={canAccessDiscussion}
            canPost={canPostDiscussion}
            canSharePhotos={canPostDiscussion}
            groupId={groupId}
            onPostMessage={postGroupMessageAction.bind(null, groupId)}
            onCreateDiscussionPhotoResource={createGroupDiscussionPhotoResourceAction.bind(null, groupId)}
          />
        </main>
      </div>
    </div>
    </GroupDetailPageShell>
  )
}
