import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'
import { formatTimeWindow } from '@/lib/format-time'
import type { MatchListItem, MatchParticipantEnriched } from '@/lib/api/matches'
import type { DashboardPageViewModel } from '../dashboard/dashboard.view-model'

type Props = {
  viewModel: DashboardPageViewModel
}

type BoardColumn = {
  title: string
  count: number
  items: MatchListItem[]
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Date TBD'
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getProfileName(viewModel: DashboardPageViewModel) {
  return (
    viewModel.profile.display_name?.trim()
    || viewModel.profile.first_name?.trim()
    || viewModel.userEmail
    || 'Player'
  )
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'P'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function getAcceptedParticipants(item: MatchListItem) {
  return item.participants.filter((participant) =>
    participant.removed_at === null
    && participant.org_approved_at !== null
    && participant.participant_accepted_at !== null,
  )
}

function getWaitingParticipants(item: MatchListItem) {
  return item.participants.filter((participant) =>
    participant.removed_at === null
    && participant.org_approved_at !== null
    && participant.participant_accepted_at === null
    && participant.user_id !== item.match.organizer_id,
  )
}

function getHostName(item: MatchListItem) {
  return (
    item.participants.find((participant) => participant.user_id === item.match.organizer_id)?.display_name
    ?? 'Host'
  )
}

function getMatchTone(item: MatchListItem) {
  if (item.match.status === 'cancelled') return 'border-[#F3B4A2] bg-[#FFF7F3] text-[#8A2D13]'
  if (item.isFormed || item.match.formed_at) return 'border-[#9FD8B4] bg-[#F2FBF4] text-[#155F36]'
  if (item.confirmedCount > 0) return 'border-[#E8C77D] bg-[#FFF9E8] text-[#76510D]'
  return 'border-[#CAD6E8] bg-[#F6F9FD] text-[#344A67]'
}

function getMatchStatusLabel(item: MatchListItem) {
  if (item.match.status === 'cancelled') return 'Cancelled'
  if (item.isFormed || item.match.formed_at) return 'Game on'
  if (item.confirmedCount > 0) return `${item.confirmedCount}/${item.match.required_count} confirmed`
  return 'Open'
}

function ParticipantRail({ participants, organizerId }: { participants: MatchParticipantEnriched[]; organizerId: string }) {
  const visible = participants.slice(0, 5)
  const overflow = participants.length - visible.length

  if (participants.length === 0) {
    return <span className="text-[12px] font-semibold text-[#8A98A8]">No confirmed players yet</span>
  }

  return (
    <div className="flex items-center">
      {visible.map((participant, index) => (
        <span
          key={participant.id}
          title={participant.display_name}
          className={[
            'grid h-8 w-8 place-items-center rounded-full border-2 border-white text-[11px] font-black shadow-sm',
            participant.user_id === organizerId ? 'bg-[#0B1F44] text-[#D9FF3F]' : 'bg-[#E5EEF7] text-[#193452]',
            index === 0 ? '' : '-ml-2',
          ].join(' ')}
        >
          {getInitials(participant.display_name)}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="-ml-2 grid h-8 min-w-[2rem] place-items-center rounded-full border-2 border-white bg-[#D9FF3F] px-2 text-[10px] font-black text-[#0B1F44] shadow-sm">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

function MatchRow({ item, compact = false }: { item: MatchListItem; compact?: boolean }) {
  const accepted = getAcceptedParticipants(item)
  const waiting = getWaitingParticipants(item)
  const timeWindow = formatTimeWindow(
    item.match.start_at_utc,
    item.match.match_date,
    item.match.start_time,
    item.match.duration_minutes,
    item.venueTimezone,
  )

  return (
    <Link
      href={`/matches/${item.match.id}`}
      className={[
        'group block rounded-lg border bg-white p-4 shadow-[0_10px_30px_rgba(11,31,68,0.06)] transition hover:-translate-y-0.5 hover:border-[#0B1F44] hover:shadow-[0_18px_40px_rgba(11,31,68,0.12)]',
        compact ? 'p-3' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${getMatchTone(item)}`}>
              {getMatchStatusLabel(item)}
            </span>
            <span className="text-[11px] font-black uppercase text-[#7888A0]">
              {item.sportName ?? 'Sport'} / {item.match.game_type ?? 'match'}
            </span>
          </div>
          <h3 className="mt-3 text-[18px] font-black leading-tight text-[#071A33]">
            {formatDate(item.match.match_date)}
          </h3>
          <p className="mt-1 text-[14px] font-black text-[#0B1F44]">{timeWindow || 'Time TBD'}</p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[#5A6C84]">
            {item.venueName ?? 'Venue TBD'}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#D9E2EF] px-3 py-1 text-[11px] font-black uppercase text-[#0B1F44] transition group-hover:bg-[#D9FF3F]">
          Open
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#E7EDF5] pt-3">
        <ParticipantRail participants={accepted} organizerId={item.match.organizer_id} />
        <div className="text-right">
          <p className="text-[11px] font-black uppercase text-[#8A98A8]">Host</p>
          <p className="max-w-[120px] truncate text-[13px] font-black text-[#0B1F44]">{getHostName(item)}</p>
        </div>
      </div>
      {waiting.length > 0 ? (
        <p className="mt-3 rounded-md bg-[#FFF5E5] px-3 py-2 text-[12px] font-bold text-[#8A4B00]">
          {waiting.length} player{waiting.length === 1 ? '' : 's'} need to confirm again.
        </p>
      ) : null}
    </Link>
  )
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'blue' | 'green' | 'yellow' | 'clay'
}) {
  const toneClass = {
    blue: 'border-[#B8C7DA] bg-[#F6FAFF]',
    green: 'border-[#A8D8BA] bg-[#F4FCF6]',
    yellow: 'border-[#DCE98F] bg-[#FBFFE8]',
    clay: 'border-[#E8B7A6] bg-[#FFF6F1]',
  }[tone]

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-[11px] font-black uppercase text-[#6A7890]">{label}</p>
      <p className="mt-2 text-[30px] font-black leading-none text-[#071A33]">{value}</p>
      <p className="mt-2 text-[12px] font-bold text-[#5A6C84]">{detail}</p>
    </div>
  )
}

function BoardColumnView({ column }: { column: BoardColumn }) {
  return (
    <section className="min-w-[260px] rounded-lg border border-[#D8E1ED] bg-[#F8FBFF] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[12px] font-black uppercase text-[#0B1F44]">{column.title}</h2>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-[#6A7890]">{column.count}</span>
      </div>
      <div className="space-y-3">
        {column.items.length > 0 ? (
          column.items.map((item) => <MatchRow key={item.match.id} item={item} compact />)
        ) : (
          <div className="rounded-lg border border-dashed border-[#C9D4E2] bg-white px-4 py-6 text-[13px] font-bold text-[#8A98A8]">
            Nothing here right now.
          </div>
        )}
      </div>
    </section>
  )
}

export function Dashboard2PageView({ viewModel }: Props) {
  const profileName = getProfileName(viewModel)
  const activeMatches = viewModel.items.filter((item) => item.match.status !== 'cancelled')
  const hostedMatches = activeMatches.filter((item) => item.match.organizer_id === viewModel.userId)
  const readyMatches = activeMatches.filter((item) => item.confirmedCount >= item.match.required_count)
  const openMatches = activeMatches.filter((item) => item.confirmedCount < item.match.required_count)
  const reconfirmMatches = activeMatches.filter((item) => getWaitingParticipants(item).length > 0)
  const savedPlayers = viewModel.inviteCircle.length
  const groupCount = viewModel.playersData.groups.length
  const venueCount = viewModel.myVenueMemberships.length || viewModel.myVenuePrefs.length
  const nextMatch = activeMatches[0] ?? null
  const boardColumns: BoardColumn[] = [
    { title: 'Host desk', count: hostedMatches.length, items: hostedMatches.slice(0, 4) },
    { title: 'Needs players', count: openMatches.length, items: openMatches.slice(0, 4) },
    { title: 'Reconfirm', count: reconfirmMatches.length, items: reconfirmMatches.slice(0, 4) },
  ]

  return (
    <main
      className="min-h-screen bg-[#EAF1F8] text-[#071A33]"
      style={{ fontFamily: '"Bahnschrift", "Aptos", "Segoe UI", sans-serif' }}
    >
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[256px_1fr]">
        <aside className="border-r border-[#CFDAE8] bg-[#071A33] px-5 py-6 text-white">
          <BrandLogo variant="stacked" href="/dashboard2" className="rounded-lg bg-white/95 p-2" />
          <div className="mt-8 rounded-lg border border-white/15 bg-white/[0.08] p-4">
            <p className="text-[11px] font-black uppercase text-[#D9FF3F]">Signed in</p>
            <h1 className="mt-2 break-words text-[24px] font-black leading-tight">{profileName}</h1>
            <p className="mt-2 break-all text-[12px] font-semibold text-[#B7C7DA]">{viewModel.userEmail}</p>
          </div>

          <nav className="mt-8 space-y-2 text-[14px] font-black">
            {[
              ['Match cockpit', '#matches'],
              ['Playerhood', '#playerhood'],
              ['Groups', '#groups'],
              ['Venues', '#venues'],
              ['Current dashboard', '/dashboard'],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-[#DCE8F6] transition hover:border-[#D9FF3F] hover:bg-[#D9FF3F] hover:text-[#071A33]"
              >
                <span>{label}</span>
                <span className="text-[12px]">›</span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="text-[11px] font-black uppercase text-[#9FB0C4]">Privacy posture</p>
            <p className="mt-2 text-[18px] font-black text-white">
              {viewModel.profile.discovery_volume ?? 'recommended'}
            </p>
            <p className="mt-2 text-[12px] font-semibold text-[#B7C7DA]">
              {viewModel.profile.accepting_new_invites ? 'Accepting new invites' : 'Not accepting new invites'}
            </p>
          </div>
        </aside>

        <div className="px-5 py-6 md:px-8 xl:px-10">
          <header className="flex flex-col gap-4 border-b border-[#CFDAE8] pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase text-[#60728B]">PlayerHoods dashboard2</p>
              <h2 className="mt-2 max-w-[780px] text-[40px] font-black leading-[1.05] text-[#071A33]">
                Match operations, built around who is ready to play.
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/matches" className="rounded-lg bg-[#0B1F44] px-5 py-3 text-[13px] font-black uppercase text-white shadow-[0_12px_24px_rgba(11,31,68,0.18)]">
                Open matches
              </Link>
              <Link href="/dashboard" className="rounded-lg border border-[#B9C7D8] bg-white px-5 py-3 text-[13px] font-black uppercase text-[#0B1F44]">
                Classic dashboard
              </Link>
            </div>
          </header>

          <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Active matches" value={String(activeMatches.length)} detail={`${hostedMatches.length} hosted by you`} tone="blue" />
            <MetricTile label="Ready" value={String(readyMatches.length)} detail="At or above required count" tone="green" />
            <MetricTile label="Saved players" value={String(savedPlayers)} detail="Private Playerhood list" tone="yellow" />
            <MetricTile label="Unread inbox" value={String(viewModel.inboxUnreadCount)} detail="Requests and match notes" tone="clay" />
          </section>

          <section id="matches" className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <div className="rounded-lg border border-[#C9D4E2] bg-white p-4 shadow-[0_18px_50px_rgba(11,31,68,0.08)]">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase text-[#60728B]">Match board</p>
                  <h2 className="mt-1 text-[22px] font-black">Three lanes that matter today</h2>
                </div>
                <Link href="/matches" className="rounded-lg border border-[#D4DEEA] px-4 py-2 text-[12px] font-black uppercase text-[#0B1F44]">
                  Manage
                </Link>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {boardColumns.map((column) => <BoardColumnView key={column.title} column={column} />)}
              </div>
            </div>

            <aside className="rounded-lg border border-[#C9D4E2] bg-[#071A33] p-4 text-white shadow-[0_18px_50px_rgba(11,31,68,0.16)]">
              <p className="text-[11px] font-black uppercase text-[#D9FF3F]">Next signal</p>
              {nextMatch ? (
                <div className="mt-4">
                  <p className="text-[14px] font-black text-[#BFD0E3]">{formatDate(nextMatch.match.match_date)}</p>
                  <h2 className="mt-2 text-[28px] font-black leading-tight">
                    {formatTimeWindow(
                      nextMatch.match.start_at_utc,
                      nextMatch.match.match_date,
                      nextMatch.match.start_time,
                      nextMatch.match.duration_minutes,
                      nextMatch.venueTimezone,
                    ) || 'Time TBD'}
                  </h2>
                  <p className="mt-3 text-[15px] font-semibold text-[#DCE8F6]">{nextMatch.venueName ?? 'Venue TBD'}</p>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/10 p-3">
                      <p className="text-[11px] font-black uppercase text-[#9FB0C4]">Confirmed</p>
                      <p className="mt-1 text-[24px] font-black text-[#D9FF3F]">
                        {nextMatch.confirmedCount}/{nextMatch.match.required_count}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/10 p-3">
                      <p className="text-[11px] font-black uppercase text-[#9FB0C4]">Court</p>
                      <p className="mt-1 text-[14px] font-black text-white">{nextMatch.courtState.badgeLabel}</p>
                    </div>
                  </div>
                  <Link href={`/matches/${nextMatch.match.id}`} className="mt-5 inline-flex w-full justify-center rounded-lg bg-[#D9FF3F] px-4 py-3 text-[13px] font-black uppercase text-[#071A33]">
                    Open next match
                  </Link>
                </div>
              ) : (
                <p className="mt-4 text-[14px] font-semibold text-[#BFD0E3]">No active matches yet.</p>
              )}
            </aside>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-3">
            <div id="playerhood" className="rounded-lg border border-[#C9D4E2] bg-white p-4">
              <p className="text-[11px] font-black uppercase text-[#60728B]">Playerhood</p>
              <h2 className="mt-1 text-[22px] font-black">Saved players</h2>
              <div className="mt-4 space-y-2">
                {viewModel.inviteCircle.slice(0, 7).map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-lg border border-[#E1E8F1] px-3 py-2">
                    <span className="truncate text-[14px] font-black">{player.target_display_name ?? 'Saved player'}</span>
                    <span className="rounded-full bg-[#F4F7FB] px-2 py-1 text-[10px] font-black uppercase text-[#60728B]">{player.source}</span>
                  </div>
                ))}
                {viewModel.inviteCircle.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#C9D4E2] px-4 py-6 text-[13px] font-bold text-[#8A98A8]">
                    No saved players yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div id="groups" className="rounded-lg border border-[#C9D4E2] bg-white p-4">
              <p className="text-[11px] font-black uppercase text-[#60728B]">Groups</p>
              <h2 className="mt-1 text-[22px] font-black">{groupCount} active groups</h2>
              <div className="mt-4 space-y-2">
                {viewModel.playersData.groups.slice(0, 6).map(({ group, members }) => (
                  <div key={group.id} className="rounded-lg border border-[#E1E8F1] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[14px] font-black">{group.name}</span>
                      <span className="text-[11px] font-black text-[#60728B]">{members.length} players</span>
                    </div>
                    <p className="mt-2 truncate text-[12px] font-semibold text-[#7B8CA4]">
                      {members.map((member) => member.displayName).filter(Boolean).slice(0, 5).join(', ') || 'No roster names yet'}
                    </p>
                  </div>
                ))}
                {groupCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#C9D4E2] px-4 py-6 text-[13px] font-bold text-[#8A98A8]">
                    No groups yet.
                  </p>
                ) : null}
              </div>
            </div>

            <div id="venues" className="rounded-lg border border-[#C9D4E2] bg-white p-4">
              <p className="text-[11px] font-black uppercase text-[#60728B]">Venues</p>
              <h2 className="mt-1 text-[22px] font-black">{venueCount} places in play</h2>
              <div className="mt-4 space-y-2">
                {[...viewModel.myVenueMemberships.map((row) => row.venue), ...viewModel.myVenuePrefs].slice(0, 6).map((venue) => (
                  <div key={venue.id} className="rounded-lg border border-[#E1E8F1] px-3 py-3">
                    <p className="truncate text-[14px] font-black">{venue.name}</p>
                    <p className="mt-1 truncate text-[12px] font-semibold text-[#7B8CA4]">
                      {[venue.city, venue.province].filter(Boolean).join(', ') || venue.location_text || 'Location TBD'}
                    </p>
                  </div>
                ))}
                {venueCount === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#C9D4E2] px-4 py-6 text-[13px] font-bold text-[#8A98A8]">
                    No venues saved yet.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
