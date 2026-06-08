import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/app/components/BrandLogo'

export const metadata: Metadata = {
  title: 'About PlayerHoods | PlayerHoods',
  description:
    'Learn how PlayerHoods helps tennis and pickleball players find better-matched games, connect locally, and play more often.',
}

const fitItems = [
  {
    title: 'Level fit',
    copy: 'Find players and games that feel compatible with how you actually play.',
  },
  {
    title: 'Location fit',
    copy: 'Connect around nearby courts, clubs, venues, and local playing circles.',
  },
  {
    title: 'Schedule fit',
    copy: 'Make it easier to find the right time instead of chasing scattered messages.',
  },
  {
    title: 'Game type fit',
    copy: 'Support the way people want to play, from casual rallies to doubles and drop-ins.',
  },
  {
    title: 'Community connection',
    copy: 'Help players meet, save, and return to the people they enjoy playing with.',
  },
]

const audienceItems = [
  {
    title: 'For players',
    copy: 'PlayerHoods makes it simpler to find suitable games and meet people at a compatible level.',
  },
  {
    title: 'For hosts',
    copy: 'Hosts get a clearer way to organize, update, and coordinate players with less friction.',
  },
  {
    title: 'For clubs and communities',
    copy: 'Local groups can keep players active, connected, and engaged around the places they play.',
  },
]

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#F0F7FF] text-[#071A44]">
      <header className="border-b border-[#D8E4F2] bg-white/92 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <BrandLogo variant="horizontal" imageClassName="h-[52px] w-[236px] sm:h-14 sm:w-[250px]" />
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-[#30445F]">
            <Link href="/" className="transition hover:text-[#0d6efd]">
              Home
            </Link>
            <Link href="/venues" className="transition hover:text-[#0d6efd]">
              Venues
            </Link>
            <Link
              href="/?auth=register"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#0d6efd] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#0b5ed7]"
            >
              Join PlayerHoods
            </Link>
          </nav>
        </div>
      </header>

      <section className="overflow-hidden bg-[#F8FBFF] px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
              About PlayerHoods
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight text-[#071A44] md:text-6xl">
              A better way for tennis and pickleball players to find games, connect locally, and play more often.
            </h1>
            <p className="mt-6 max-w-3xl text-base font-semibold leading-7 text-[#52667F] md:text-lg">
              PlayerHoods is a founder-led platform created to help tennis and pickleball players
              find better-matched games, connect with local players, and organize play with less friction.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/?auth=register"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0d6efd] px-6 text-sm font-black text-white shadow-[0_14px_30px_rgba(13,110,253,0.24)] transition hover:bg-[#0b5ed7]"
              >
                Join PlayerHoods
              </Link>
              <Link
                href="/venues"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#C8D7EA] bg-white px-6 text-sm font-black text-[#071A44] transition hover:border-[#0d6efd]/35 hover:bg-[#EEF6FF]"
              >
                Find Games
              </Link>
            </div>
          </div>

          <div className="relative hidden min-h-[320px] overflow-hidden rounded-lg border border-[#D8E4F2] bg-white shadow-[0_28px_70px_-46px_rgba(7,26,68,0.34)] lg:block">
            <div className="absolute inset-x-0 top-0 h-2 bg-[#D8F64C]" />
            <div className="flex h-full flex-col justify-between p-8">
              <img
                src="/playerhoods-brand-mark-cropped.png"
                alt=""
                aria-hidden="true"
                className="h-20 w-20 object-contain"
              />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
                  Built around better fit
                </p>
                <p className="mt-3 text-3xl font-black leading-tight text-[#071A44]">
                  Level. Location. Schedule. Game type. Community.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.76fr_1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
              Why it exists
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-[#071A44] md:text-4xl">
              The players may be nearby. The right game can still be hard to find.
            </h2>
          </div>
          <div className="space-y-5 text-base font-medium leading-8 text-[#52667F]">
            <p>
              We believe racquet sports are more than just games. They are local communities built
              through shared time, compatible levels, and the simple joy of playing more often. But
              for many players, finding the right game is still harder than it should be.
            </p>
            <p>
              There may be clubs, group chats, drop-in sessions, and players nearby, but they do not
              always match your schedule, your level, your location, or the kind of game you are
              looking for. Even inside a club, it is not always easy to discover and connect with the
              right players when you are ready to play.
            </p>
            <p className="font-bold text-[#071A44]">
              PlayerHoods was built to make that connection easier.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#F0F7FF] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
              Built Around Better Fit
            </p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-[#071A44] md:text-4xl">
              Not every player is looking for the same thing.
            </h2>
            <p className="mt-4 text-base font-medium leading-8 text-[#52667F]">
              Some want casual rallies. Some want competitive matches. Some want doubles. Some want
              pickleball drop-ins. Some want to meet new players at a similar level. Some simply want
              an easier way to play more often. That is why PlayerHoods focuses on helping players
              connect through the things that matter most.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {fitItems.map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-[#D8E4F2] bg-white p-5 shadow-[0_18px_44px_-36px_rgba(7,26,68,0.28)]"
              >
                <div className="mb-4 h-2 w-12 rounded-full bg-[#D8F64C]" />
                <h3 className="text-lg font-black text-[#071A44]">{item.title}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-[#52667F]">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
                Who it serves
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-[#071A44] md:text-4xl">
                For players, hosts, and local communities.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {audienceItems.map((item) => (
                <article
                  key={item.title}
                  className="rounded-lg border border-[#D8E4F2] bg-[#F8FBFF] p-6 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.24)]"
                >
                  <h3 className="text-xl font-black text-[#071A44]">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-[#52667F]">{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#F8FBFF] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
            A Note from the Founder
          </p>
          <div className="mt-5 space-y-5 rounded-lg border border-[#D8E4F2] bg-white p-6 text-base font-medium leading-8 text-[#52667F] shadow-[0_24px_64px_-46px_rgba(7,26,68,0.32)] sm:p-8">
            <div className="h-2 w-16 rounded-full bg-[#D8F64C]" aria-hidden="true" />
            <p>
              I started playing tennis later than many players. In the beginning, one of the hardest
              parts was not just improving my skills - it was finding the right people to play with
              consistently.
            </p>
            <p>
              Like many players, I experienced the gap between loving the sport and actually having
              enough suitable opportunities to play. Over time, by joining clubs, meeting more
              players, and becoming more involved in local tennis communities, I realized this was
              not just my problem. Many players face the same challenge: they want to play more, but
              finding the right match, partner, group, time, and level still depends too much on
              scattered messages and personal networks.
            </p>
            <p className="font-bold text-[#071A44]">That experience shaped PlayerHoods.</p>
            <p>
              I am building this platform for players who want more suitable games, for hosts who
              want less organizing chaos, and for local tennis and pickleball communities that
              deserve stronger, easier ways to connect.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[#EAF3FF] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0d6efd]">
              Ready to play more often?
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-[#071A44] md:text-4xl">
              Find better-matched tennis and pickleball games near you with PlayerHoods.
            </h2>
          </div>
          <div className="flex w-full flex-wrap gap-3 md:w-auto md:justify-end">
            <Link
              href="/?auth=register"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#0d6efd] px-6 text-sm font-black text-white shadow-[0_14px_30px_rgba(13,110,253,0.24)] transition hover:bg-[#0b5ed7] sm:flex-none"
            >
              Join PlayerHoods
            </Link>
            <Link
              href="/venues"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-[#C8D7EA] bg-white px-6 text-sm font-black text-[#071A44] transition hover:border-[#0d6efd]/35 hover:bg-[#F8FBFF] sm:flex-none"
            >
              Find Games
            </Link>
            <Link
              href="/?auth=register&next=/dashboard"
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-[#071A44]/15 bg-[#071A44] px-6 text-sm font-black text-white shadow-sm transition hover:bg-[#10285E] sm:flex-none"
            >
              Start Hosting
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
