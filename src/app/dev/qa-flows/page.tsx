import { notFound } from 'next/navigation'

const DEV_QA_ENABLED =
  process.env.NODE_ENV !== 'production' ||
  (process.env.ENABLE_QA_FLOWS === 'true' && process.env.VERCEL_ENV !== 'production')

type QaState = {
  label: string
  tone: 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple'
  meta: string
}

const toneClasses: Record<QaState['tone'], string> = {
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  red: 'border-red-200 bg-red-50 text-red-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  purple: 'border-indigo-200 bg-indigo-50 text-indigo-700',
}

const welcomeStates: QaState[] = [
  { label: '0 saved player cards', tone: 'blue', meta: 'Build your first Hood' },
  { label: '1 saved player card', tone: 'blue', meta: 'Keep building your Hood' },
  { label: '2 saved player cards', tone: 'blue', meta: 'One more makes doubles easier' },
  { label: '3+ saved player cards', tone: 'green', meta: 'Your Hood is ready' },
]

const matchStates: QaState[] = [
  { label: 'Draft', tone: 'slate', meta: 'Not published yet' },
  { label: 'Open', tone: 'blue', meta: 'Accepting requests' },
  { label: 'Pending', tone: 'amber', meta: 'Waiting on confirmations' },
  { label: 'Formed', tone: 'green', meta: 'Lineup ready' },
  { label: 'Canceled', tone: 'red', meta: 'No longer active' },
]

const inviteStates: QaState[] = [
  { label: 'Pending', tone: 'amber', meta: 'Waiting for player' },
  { label: 'Accepted', tone: 'green', meta: 'Player accepted' },
  { label: 'Declined', tone: 'red', meta: 'Player declined' },
  { label: 'Expired', tone: 'slate', meta: 'Link expired' },
  { label: 'Canceled', tone: 'red', meta: 'Host canceled' },
]

const requestStates: QaState[] = [
  { label: 'Sent', tone: 'amber', meta: 'Waiting for host' },
  { label: 'Approved', tone: 'green', meta: 'Host approved' },
  { label: 'Declined', tone: 'red', meta: 'Host declined' },
  { label: 'Withdrawn', tone: 'slate', meta: 'Player withdrew' },
  { label: 'Match full', tone: 'purple', meta: 'Capacity reached' },
]

const playerStates: QaState[] = [
  { label: 'Registered', tone: 'green', meta: 'Basic profile visible' },
  { label: 'Contact', tone: 'blue', meta: 'Player Card, private contact details' },
  { label: 'Private', tone: 'amber', meta: 'Request to Add only' },
  { label: 'Blocked', tone: 'red', meta: 'No actions available' },
]

const groupContactStates: QaState[] = [
  { label: 'Shared', tone: 'blue', meta: 'Visible as group contact' },
  { label: 'Saved', tone: 'green', meta: 'Saved to Hood' },
  { label: 'Linked', tone: 'purple', meta: 'Prefer registered identity' },
]

function StatePill({ state }: { state: QaState }) {
  return (
    <div
      data-testid={`qa-state-${state.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      className={`rounded-full border px-3 py-1 text-xs font-bold ${toneClasses[state.tone]}`}
    >
      {state.label}
    </div>
  )
}

function QaCard({
  title,
  subtitle,
  icon,
  states,
  testId,
}: {
  title: string
  subtitle: string
  icon: string
  states: QaState[]
  testId: string
}) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <span className="text-sm font-black">{icon}</span>
        </div>
        <div>
          <h2 className="text-lg font-black text-[#071A44]">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">
        {states.map((state) => (
          <div
            key={state.label}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
          >
            <div>
              <div className="text-sm font-bold text-slate-900">{state.meta}</div>
              <div className="text-xs text-slate-500">{state.label}</div>
            </div>
            <StatePill state={state} />
          </div>
        ))}
      </div>
    </section>
  )
}

export default function QaFlowsPage() {
  if (!DEV_QA_ENABLED) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-[#EFF6FF] px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">PlayerHoods QA</div>
          <h1 className="mt-2 text-3xl font-black text-[#071A44]">Flow State Gallery</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Local/dev-only helper page for rendering important cards and states without walking the full product
            flow. Use this before adding or updating narrow Playwright tests.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <QaCard
            title="Welcome card"
            subtitle="Cold-start Hood activation progress."
            icon="WH"
            states={welcomeStates}
            testId="qa-card-welcome"
          />
          <QaCard
            title="Match card"
            subtitle="Lifecycle states for match surfaces."
            icon="MT"
            states={matchStates}
            testId="qa-card-match"
          />
          <QaCard
            title="Invite card"
            subtitle="Direct invite and contact invite states."
            icon="IN"
            states={inviteStates}
            testId="qa-card-invite"
          />
          <QaCard
            title="Request to Join card"
            subtitle="Player request and host decision states."
            icon="RQ"
            states={requestStates}
            testId="qa-card-request-to-join"
          />
          <QaCard
            title="Player card"
            subtitle="Registered users, contacts, privacy, and block states."
            icon="PL"
            states={playerStates}
            testId="qa-card-player"
          />
          <QaCard
            title="Group contact card"
            subtitle="Shared Contacts are separate from full group members."
            icon="GC"
            states={groupContactStates}
            testId="qa-card-group-contact"
          />
        </div>

        <section className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="qa-privacy-note">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-600">
              PR
            </div>
            <h2 className="font-black text-[#071A44]">Privacy assertions</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cards here intentionally avoid raw email, phone, contact record IDs, private notes, and relationship graph
              hints.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="qa-e2e-contract">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-600">
              E2E
            </div>
            <h2 className="font-black text-[#071A44]">E2E contract</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Future Playwright tests should target the `data-testid` attributes on this page and production CTAs, with
              web-first assertions only.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="qa-risk-note">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-600">
              RK
            </div>
            <h2 className="font-black text-[#071A44]">Risk focus</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Business-logic tests should catch invite eligibility, privacy, duplicate prevention, and match formation
              before any browser test runs.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
