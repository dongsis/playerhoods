'use client'

import { useState } from 'react'

const advantages = [
  {
    number: '1',
    title: 'Turn scattered communication into clear coordination',
    description:
      'Move beyond email, group chats, and verbal coordination. Put your game workflow in one clear, trackable place.',
    icon: 'message',
  },
  {
    number: '2',
    title: "See who's invited and who's in",
    description:
      'Track invited, confirmed, absent, and pending players without digging through chat history.',
    icon: 'check',
  },
  {
    number: '3',
    title: 'Organize real players, not just app users',
    description:
      'Include contacts, club friends, and registered players in the same match and group workflow.',
    icon: 'users',
  },
  {
    number: '4',
    title: 'Every game and group has its own chat',
    description:
      'Keep conversations connected to the match or group they belong to, so decisions stay easy to find.',
    icon: 'chat',
  },
  {
    number: '5',
    title: 'Help club members become visible and connected',
    description:
      'Make it easier to find the right players by venue, city, availability, and level.',
    icon: 'star',
  },
  {
    number: '6',
    title: 'Easier for hosts, friendlier for participants',
    description:
      'Hosts gather players faster. Participants respond with less friction. New players can join more comfortably.',
    icon: 'heart',
  },
]

const featureCards = [
  {
    title: 'Connect',
    description:
      'Find local players by sport, level, venues, and shared groups so your next game starts with the right people.',
    icon: 'users',
  },
  {
    title: 'Play',
    description:
      'Create open matches, invite from your Hood, and keep player confirmations in one place.',
    icon: 'calendar',
  },
  {
    title: 'Grow',
    description:
      'Build a durable player network around your favorite courts, clubs, and recurring games.',
    icon: 'trophy',
  },
]

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <main className="min-h-screen bg-white text-slate-800">
      <nav className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="PlayerHoods home">
            <img
              src="/playerhoods-logo.png"
              alt=""
              className="h-11 w-11 object-contain"
            />
            <span className="text-2xl font-black tracking-tight text-[#001845]">
              Player<span className="font-semibold">Hoods</span>
            </span>
          </a>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#players" className="text-sm font-bold text-slate-700 hover:text-[#0047AB]">
              For Players
            </a>
            <a href="#clubs" className="text-sm font-bold text-slate-700 hover:text-[#0047AB]">
              For Clubs
            </a>
            <a href="#features" className="text-sm font-bold text-slate-700 hover:text-[#0047AB]">
              Features
            </a>
            <a href="/venues" className="text-sm font-bold text-slate-700 hover:text-[#0047AB]">
              Venues
            </a>
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <a href="/login" className="text-sm font-bold text-[#0047AB] hover:text-[#001845]">
              Sign In
            </a>
            <a
              href="/login?mode=register"
              className="rounded-full bg-[#CDE11D] px-5 py-2.5 text-sm font-black text-[#001845] shadow-sm transition hover:bg-[#b8ca18]"
            >
              Sign Up
            </a>
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-[#001845] md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {isMenuOpen ? (
          <div className="border-t border-slate-100 bg-white px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              <a className="rounded-lg px-3 py-2 font-bold text-slate-700" href="#players">
                For Players
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-slate-700" href="#clubs">
                For Clubs
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-slate-700" href="#features">
                Features
              </a>
              <a className="rounded-lg px-3 py-2 font-bold text-slate-700" href="/login">
                Sign In
              </a>
              <a
                className="mt-2 rounded-lg bg-[#CDE11D] px-3 py-3 text-center font-black text-[#001845]"
                href="/login?mode=register"
              >
                Sign Up
              </a>
            </div>
          </div>
        ) : null}
      </nav>

      <section className="relative flex min-h-[640px] items-center justify-center overflow-hidden text-center">
        <div className="absolute inset-0">
          <img
            src="/playerhoods-home-hero.png"
            alt="Players greeting each other at a tennis net"
            className="h-full w-full object-cover object-[center_42%]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#001845]/85 via-[#0047AB]/55 to-white/95" />
        </div>

        <div className="relative z-10 mx-auto mt-8 w-full max-w-5xl px-4">
          <p className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-[#CDE11D]">
            4,000+ Tennis & Pickleball Communities Across Canada
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-white drop-shadow md:text-6xl">
            Bring players together.
            <span className="block text-[#CDE11D]">Keep the game going.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg font-semibold leading-relaxed text-white/95 drop-shadow-sm md:text-xl">
            Every venue is a community. Discover places to play, connect with local players, and
            organize games without the chaos. Build your playing circle and keep your hood growing
            safely.
          </p>

          <form action="/venues" className="mx-auto mt-10 flex max-w-3xl items-center rounded-full bg-white p-2 shadow-2xl">
            <label className="sr-only" htmlFor="home-search">
              Search by location, level, or sport
            </label>
            <span className="ml-4 text-slate-400">
              <SearchIcon />
            </span>
            <input
              id="home-search"
              name="q"
              type="text"
              placeholder="Search..."
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-slate-700 outline-none md:text-lg"
            />
            <button
              type="submit"
              className="rounded-full bg-[#0047AB] px-6 py-3 text-sm font-black text-white transition hover:bg-[#003380] md:px-8"
            >
              Find Games
            </button>
          </form>

          <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm font-black text-slate-800">
            <div className="rounded-lg border border-white/50 bg-white/90 px-4 py-2 shadow-sm backdrop-blur">
              <span className="text-[#0047AB]">4,000+</span> Tennis & Pickleball Communities Across Canada
            </div>
          </div>
        </div>
      </section>

      <section id="players" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <CoreAdvantagesCarousel />
        </div>
      </section>

      <section id="features" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-4xl font-black tracking-tight text-[#001845]">
            Everything you need to run your games
          </h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {featureCards.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-slate-100 bg-slate-50 p-8 transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg bg-[#0047AB]/10 text-[#0047AB]">
                  <Icon name={feature.icon} className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-black text-[#001845]">{feature.title}</h3>
                <p className="mt-4 leading-relaxed text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="clubs" className="bg-[#001845] py-20 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-4xl font-black tracking-tight">Play anytime, anywhere.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed text-slate-300">
            Start organizing matches, building your Hood, and keeping every player status clear.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/login?mode=register"
              className="w-full rounded-full bg-[#CDE11D] px-8 py-4 text-lg font-black text-[#001845] shadow-lg transition hover:bg-white sm:w-auto"
            >
              Get Started Free
            </a>
            <a
              href="/login"
              className="w-full rounded-full border border-white/30 px-8 py-4 text-lg font-black text-white transition hover:bg-white/10 sm:w-auto"
            >
              Sign In
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 bg-slate-900 py-10 text-slate-400">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-sm md:flex-row">
          <div className="font-black text-slate-200">PlayerHoods</div>
          <div className="flex flex-wrap justify-center gap-6">
            <a href="/terms" className="hover:text-white">
              Terms
            </a>
            <a href="/privacy" className="hover:text-white">
              Privacy
            </a>
            <a href="/login" className="hover:text-white">
              Sign In
            </a>
          </div>
          <div>Copyright 2026 PlayerHoods. All rights reserved.</div>
        </div>
      </footer>
    </main>
  )
}

function CoreAdvantagesCarousel() {
  const [current, setCurrent] = useState(0)
  const slidesCount = 2

  function nextSlide() {
    setCurrent((value) => (value === slidesCount - 1 ? 0 : value + 1))
  }

  function prevSlide() {
    setCurrent((value) => (value === 0 ? slidesCount - 1 : value - 1))
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        <div className="w-full flex-shrink-0 p-6 md:p-12">
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-4xl font-black text-[#0047AB]">
              PlayerHoods <span className="text-[#001845]">Core Advantages</span>
            </h2>
            <p className="mt-2 text-xl font-semibold text-slate-500">
              Bring players together. Keep the game going.
            </p>
          </div>

          <div className="mb-10 grid items-center gap-6 rounded-lg border border-slate-100 bg-slate-50 p-5 lg:grid-cols-[1fr_auto_1fr]">
            <ComparisonPanel
              label="Old Ways"
              tone="muted"
              items={['Email', 'WhatsApp', 'WeChat', 'Word of mouth']}
              title="Scattered coordination"
              description="Invites, replies, and player status get buried across separate chats, emails, and word of mouth."
            />
            <div className="hidden text-lg font-black text-slate-300 lg:block">to</div>
            <ComparisonPanel
              label="PlayerHoods"
              tone="brand"
              items={['Send invites', 'Player status', 'Group chat', 'Matches & groups']}
              title="One clear game flow"
              description="Bring match invites, confirmations, groups, and chat into one place built for organizing play."
            />
          </div>

          <p className="mx-auto mb-8 max-w-3xl text-center font-bold text-slate-600">
            Chat tools are good for communication, not for managing complex game coordination.
          </p>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {advantages.map((advantage) => (
              <AdvantageCard key={advantage.number} {...advantage} />
            ))}
          </div>

          <div className="mt-10 overflow-hidden rounded-lg bg-[#0047AB] p-6">
            <p className="text-lg font-semibold leading-relaxed text-white">
              PlayerHoods helps sports communities discover players, organize matches, and stay
              connected, making every game easier, clearer, and more human.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-shrink-0 flex-col items-center justify-center gap-12 bg-gradient-to-br from-blue-50 to-white p-8 md:flex-row md:p-20">
          <div className="max-w-xl flex-1 space-y-6">
            <h2 className="text-5xl font-black tracking-tight text-[#001845]">
              Your club in your pocket
            </h2>
            <p className="text-xl leading-relaxed text-slate-600">
              Help members find partners, create matches, and stay connected around the courts they
              already love.
            </p>
            <ul className="space-y-4 font-bold text-slate-700">
              <li className="flex items-center gap-3">
                <CheckBadge /> Invite from saved players and groups
              </li>
              <li className="flex items-center gap-3">
                <CheckBadge /> Track confirmations and requests
              </li>
              <li className="flex items-center gap-3">
                <CheckBadge /> Keep every match conversation focused
              </li>
            </ul>
            <a
              href="/login?mode=register"
              className="inline-flex rounded-lg bg-[#0047AB] px-6 py-3 font-black text-white transition hover:bg-[#003380]"
            >
              Explore PlayerHoods
            </a>
          </div>
          <PhonePreview />
        </div>
      </div>

      <button
        type="button"
        onClick={prevSlide}
        className="absolute left-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-600 shadow-lg backdrop-blur transition hover:scale-105 hover:text-[#0047AB]"
        aria-label="Previous slide"
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        onClick={nextSlide}
        className="absolute right-4 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-600 shadow-lg backdrop-blur transition hover:scale-105 hover:text-[#0047AB]"
        aria-label="Next slide"
      >
        <ChevronRight />
      </button>

      <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center gap-2">
        {Array.from({ length: slidesCount }).map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrent(index)}
            className={`h-3 rounded-full transition-all ${
              current === index ? 'w-7 bg-[#0047AB]' : 'w-3 bg-slate-300 hover:bg-slate-400'
            }`}
            aria-label={`Show slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function ComparisonPanel({
  label,
  items,
  tone,
  title,
  description,
}: {
  label: string
  items: string[]
  tone: 'muted' | 'brand'
  title: string
  description: string
}) {
  const isBrand = tone === 'brand'

  return (
    <div
      className={`relative rounded-lg border p-5 shadow-sm ${
        isBrand ? 'border-[#0047AB]/20 bg-blue-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <span
        className={`absolute -top-3 left-4 rounded-full px-3 py-1 text-xs font-black text-white ${
          isBrand ? 'bg-[#0047AB]' : 'bg-slate-500'
        }`}
      >
        {label}
      </span>
      <div className="pt-4 text-center">
        <h3 className={`text-lg font-black ${isBrand ? 'text-[#0047AB]' : 'text-[#001845]'}`}>
          {title}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-5 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item} className="flex flex-col items-center gap-2 text-center">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-lg ${
                isBrand ? 'bg-[#0047AB] text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Icon name={item.includes('chat') ? 'chat' : item.includes('status') ? 'check' : 'message'} />
            </div>
            <span className={`text-xs font-black ${isBrand ? 'text-[#0047AB]' : 'text-slate-500'}`}>
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdvantageCard({
  number,
  icon,
  title,
  description,
}: {
  number: string
  icon: string
  title: string
  description: string
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="relative z-10 flex gap-4">
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-blue-50 text-[#0047AB]">
            <Icon name={icon} className="h-8 w-8" />
          </div>
          <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-[#0047AB] text-xs font-black text-white">
            {number}
          </div>
        </div>
        <div className="flex-1">
          <h4 className="text-lg font-black leading-tight text-[#001845]">{title}</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
        </div>
      </div>
    </div>
  )
}

function PhonePreview() {
  return (
    <div className="relative h-[560px] w-[280px] rounded-[2rem] border-4 border-slate-200 bg-slate-900 p-3 shadow-2xl">
      <div className="absolute inset-x-0 top-0 flex h-6 justify-center">
        <div className="h-4 w-32 rounded-b-xl bg-slate-900" />
      </div>
      <div className="flex h-full flex-col overflow-hidden rounded-[1.55rem] bg-white">
        <div className="rounded-b-[2rem] bg-[#0047AB] p-6 pt-9 text-center text-white">
          <h3 className="font-black">Next Match</h3>
          <p className="text-sm text-white/80">Sunday, 10:30 AM</p>
        </div>
        <div className="-mt-6 p-4">
          <div className="rounded-lg border border-slate-100 bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-800">Doubles</span>
              <span className="rounded-full bg-[#CDE11D]/30 px-2 py-1 text-xs font-black text-emerald-800">
                Confirmed
              </span>
            </div>
            <div className="mt-4 flex">
              {['A', 'B', 'C'].map((letter, index) => (
                <div
                  key={letter}
                  className="-ml-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-black text-slate-600 first:ml-0"
                  style={{ zIndex: 5 - index }}
                >
                  {letter}
                </div>
              ))}
              <div className="-ml-3 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#0047AB] text-xs font-black text-white">
                +1
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <MiniRow icon="pin" title="City Park Courts" subtitle="Court 2" />
            <MiniRow icon="chat" title="Match Chat" subtitle="2 new messages" />
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex h-16 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <Icon name={icon} className="h-6 w-6 text-slate-400" />
      <div>
        <div className="text-sm font-black text-slate-800">{title}</div>
        <div className="text-xs font-semibold text-slate-500">{subtitle}</div>
      </div>
    </div>
  )
}

function CheckBadge() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0047AB] text-[#CDE11D]">
      <CheckIcon />
    </span>
  )
}

function Icon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  if (name === 'users') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M8 2v4M16 2v4M3 10h18" />
        <rect x="3" y="4" width="18" height="18" rx="2" />
      </svg>
    )
  }

  if (name === 'trophy') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
        <path d="M5 5H3v3a4 4 0 0 0 4 4M19 5h2v3a4 4 0 0 1-4 4" />
      </svg>
    )
  }

  if (name === 'check') {
    return <CheckIcon className={className} />
  }

  if (name === 'star') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="m12 2 3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2Z" />
      </svg>
    )
  }

  if (name === 'heart') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
      </svg>
    )
  }

  if (name === 'pin') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
