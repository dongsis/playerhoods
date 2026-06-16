import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { getAdminReportsData, formatReportTime, type AdminReportsData } from '@/lib/api/admin-reports'
import { isSuperAdmin } from '@/lib/api/venues'
import { createSupabaseServerClient, createSupabaseServiceRoleClient, getUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams?: {
    days?: string
  }
}

function parseDays(value: string | undefined) {
  const days = Number(value)
  if (!Number.isFinite(days)) return 30
  return Math.max(7, Math.min(90, Math.round(days)))
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatGeneratedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function RangeLink({ days, active }: { days: number; active: boolean }) {
  return (
    <Link
      href={`/admin/reports?days=${days}`}
      className={[
        'rounded-full px-3 py-1.5 text-[12px] font-black transition',
        active
          ? 'bg-[#0d6efd] text-white shadow-[0_10px_22px_rgba(13,110,253,0.2)]'
          : 'border border-[#D9E6F8] bg-white text-[#64748B] hover:border-[#0d6efd]/40 hover:text-[#0d6efd]',
      ].join(' ')}
    >
      {days} days
    </Link>
  )
}

function StatCard({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">{label}</div>
      <div className="mt-1 text-[24px] font-black leading-none tracking-[-0.02em] text-[#0F172A]">{value}</div>
      {note ? <div className="mt-1 text-[11px] font-semibold text-[#64748B]">{note}</div> : null}
    </div>
  )
}

function UnavailableState() {
  return (
    <section className="ph-card px-6 py-8">
      <div className="ph-kicker mb-2">Reports unavailable</div>
      <h1 className="ph-title">Admin reports need service-role access.</h1>
      <p className="ph-subtitle mt-3 max-w-[680px]">
        The app is running, but this environment does not have the server-only reporting key configured. Set
        `SUPABASE_SERVICE_ROLE_KEY` to enable read-only admin reports.
      </p>
    </section>
  )
}

function DailyRegistrationsTable({ data }: { data: AdminReportsData }) {
  return (
    <section className="ph-card overflow-hidden">
      <div className="border-b border-[#E2E8F0] px-5 py-4">
        <div className="ph-kicker mb-1">Daily registrations</div>
        <h2 className="text-lg font-black text-[#0F172A]">New players</h2>
      </div>
      {data.registrations.length === 0 ? (
        <div className="ph-empty m-5">No registrations in this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-[#F8FAFC] text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">
              <tr>
                <th className="px-5 py-3">Player</th>
                <th className="px-5 py-3">Registered</th>
                <th className="px-5 py-3">Primary venue</th>
                <th className="px-5 py-3">Onboarding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {data.registrations.slice(0, 40).map((row) => (
                <tr key={row.userId} className="bg-white">
                  <td className="px-5 py-3 font-bold text-[#0F172A]">{row.displayName}</td>
                  <td className="px-5 py-3 text-[#64748B]">{formatReportTime(row.createdAt)}</td>
                  <td className="px-5 py-3 text-[#64748B]">{row.primaryVenue}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-[#EFF6FF] px-2 py-1 text-[11px] font-bold text-[#0d6efd]">{row.onboarding}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DailyActivityTable({ data }: { data: AdminReportsData }) {
  return (
    <section className="ph-card overflow-hidden">
      <div className="border-b border-[#E2E8F0] px-5 py-4">
        <div className="ph-kicker mb-1">Daily activity</div>
        <h2 className="text-lg font-black text-[#0F172A]">Activity by day</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[12px]">
          <thead className="bg-[#F8FAFC] text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Registrations</th>
              <th className="px-4 py-3">Matches</th>
              <th className="px-4 py-3">Participants</th>
              <th className="px-4 py-3">Confirmed</th>
              <th className="px-4 py-3">Removed</th>
              <th className="px-4 py-3">Group invites</th>
              <th className="px-4 py-3">Invite links</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Failed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {data.days.map((day) => (
              <tr key={day.date} className="bg-white">
                <td className="px-4 py-3 font-bold text-[#0F172A]">{formatDay(day.date)}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.registrations}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.matchesCreated}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.participantsAdded}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.confirmedResponses}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.removedOrWithdrawn}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.groupInvites}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.publicSignupStarts}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.notificationsSent}</td>
                <td className="px-4 py-3 text-[#64748B]">{day.notificationsFailed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function InviteResponseTable({ data }: { data: AdminReportsData }) {
  return (
    <section className="ph-card overflow-hidden">
      <div className="border-b border-[#E2E8F0] px-5 py-4">
        <div className="ph-kicker mb-1">Invite method & response</div>
        <h2 className="text-lg font-black text-[#0F172A]">How players were invited and replied</h2>
      </div>
      {data.inviteResponses.length === 0 ? (
        <div className="ph-empty m-5">No invite or response rows in this range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead className="bg-[#F8FAFC] text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">
              <tr>
                <th className="px-4 py-3">Player / group</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Venue</th>
                <th className="px-4 py-3">Invite method</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Reply</th>
                <th className="px-4 py-3">Response time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {data.inviteResponses.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-4 py-3 font-bold text-[#0F172A]">{row.playerName}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.matchLabel}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.venueName}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.inviteMethod}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.deliveryChannel}</td>
                  <td className="px-4 py-3 text-[#64748B]">{row.deliveryStatus}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-bold text-[#1E293B]">{row.replyStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{formatReportTime(row.responseAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RecentActivityList({ data }: { data: AdminReportsData }) {
  return (
    <section className="ph-card px-5 py-4">
      <div className="ph-kicker mb-1">Recent activity</div>
      <h2 className="text-lg font-black text-[#0F172A]">Latest system activity</h2>
      {data.activities.length === 0 ? (
        <div className="ph-empty mt-4">No recent activity in this range.</div>
      ) : (
        <div className="mt-4 divide-y divide-[#E2E8F0]">
          {data.activities.slice(0, 18).map((row) => (
            <div key={row.id} className="grid gap-1 py-3 md:grid-cols-[160px_180px_1fr] md:items-center">
              <div className="text-[12px] font-bold text-[#64748B]">{formatReportTime(row.createdAt)}</div>
              <div className="text-[13px] font-black text-[#0F172A]">{row.activity}</div>
              <div className="text-[12px] font-semibold text-[#64748B]">
                {row.actorName} / {row.detail}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function AdminReportsPage({ searchParams }: Props) {
  const user = await getUser()
  if (!user) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const superAdmin = await isSuperAdmin(supabase)
  if (!superAdmin) redirect('/dashboard')

  const days = parseDays(searchParams?.days)
  let data: AdminReportsData | null = null
  let unavailable = false

  try {
    const serviceClient = createSupabaseServiceRoleClient()
    data = await getAdminReportsData(serviceClient, { days })
  } catch (error) {
    console.error('[AdminReports] load failed:', error)
    unavailable = true
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 md:px-8">
      <div className="mb-6">
        <BrandLogo variant="horizontal" href="/dashboard" />
      </div>
      <nav className="mb-6 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#94A3B8]">
        <Link href="/dashboard" className="ph-link">
          Dashboard
        </Link>
        <span>&rsaquo;</span>
        <Link href="/admin/venues" className="ph-link">
          Venue Admin
        </Link>
        <span>&rsaquo;</span>
        <span>Reports</span>
      </nav>

      {unavailable || !data ? (
        <UnavailableState />
      ) : (
        <div className="space-y-5">
          <section className="ph-card px-6 py-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <div className="ph-kicker mb-2">Super admin</div>
                <h1 className="ph-title">Reports</h1>
                <p className="ph-subtitle mt-2 max-w-[760px]">
                  Daily registrations, player activity, and invitation response tracking. No phone numbers or email
                  addresses are shown here.
                </p>
                <p className="mt-2 text-[11px] font-semibold text-[#94A3B8]">Generated {formatGeneratedAt(data.generatedAt)}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {[7, 30, 90].map((range) => (
                  <RangeLink key={range} days={range} active={data.rangeDays === range} />
                ))}
              </div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Registrations" value={data.totals.registrations} note={`${data.rangeDays} day range`} />
            <StatCard label="Matches" value={data.totals.matchesCreated} note="created" />
            <StatCard label="Participants" value={data.totals.participantsAdded} note="added or invited" />
            <StatCard label="Invite rows" value={data.totals.inviteRows} note="method / response" />
            <StatCard label="Sent" value={data.totals.notificationsSent} note="deliveries" />
            <StatCard label="Failed" value={data.totals.notificationsFailed} note="deliveries" />
          </div>

          <DailyActivityTable data={data} />
          <InviteResponseTable data={data} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <DailyRegistrationsTable data={data} />
            <RecentActivityList data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
