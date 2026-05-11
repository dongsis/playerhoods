'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Slide =
  | {
      kind: 'welcome'
      title: string
      body: string
    }
  | {
      kind: 'image'
      title: string
      body: string
      imageSrc: string
      imageAlt: string
    }

const slides: Slide[] = [
  {
    kind: 'welcome',
    title: 'Bring players together. Keep the game going.',
    body: 'Find players, save them to your Hood, and organize matches with less back-and-forth.',
  },
  {
    kind: 'image',
    title: 'Choose how players join',
    body: 'Invite players directly, or open a match so eligible players can request to join.',
    imageSrc: '/onboarding/choose-how-players-join.png',
    imageAlt: 'Illustration of direct invitations and open match requests',
  },
  {
    kind: 'image',
    title: 'Build your Hood',
    body: 'Save players you may want to play with and invite them faster next time.',
    imageSrc: '/onboarding/build-your-hood.png',
    imageAlt: 'Illustration of saved players in a Hood and sending match invites',
  },
  {
    kind: 'image',
    title: "You're in control",
    body: 'Choose where players can discover you while keeping email and phone hidden.',
    imageSrc: '/onboarding/you-are-in-control.png',
    imageAlt: 'Illustration of privacy controls for player discovery',
  },
  {
    kind: 'image',
    title: 'Help the right players find you',
    body: 'Add sports, cities, and venues so you can be matched with games that fit you best.',
    imageSrc: '/onboarding/right-players-find-you.png',
    imageAlt: 'Illustration of sports, city, and venue preferences matching players to games',
  },
]

function buildProfileHref(next: string, notice?: string) {
  const params = new URLSearchParams()
  if (next) params.set('next', next)
  if (notice) params.set('notice', notice)
  const query = params.toString()
  return `/onboarding/profile${query ? `?${query}` : ''}`
}

export function OnboardingIntroCarousel({
  next,
  notice,
}: {
  next: string
  notice?: string
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const finalIndex = slides.length - 1
  const slide = slides[index]
  const profileHref = useMemo(() => buildProfileHref(next, notice), [next, notice])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current >= finalIndex ? 0 : current + 1))
    }, 3000)

    return () => window.clearInterval(timer)
  }, [finalIndex])

  const finish = () => {
    window.localStorage.setItem('playerhoods:onboarding_intro_seen', 'true')
    router.push(profileHref)
  }

  const goPrev = () => setIndex((current) => (current === 0 ? finalIndex : current - 1))
  const goNext = () => setIndex((current) => (current >= finalIndex ? current : current + 1))

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#061A5F]">
      <section className="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col px-5 py-5 sm:px-8 sm:py-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.18em] text-[#1C63E8]">
            <Image src="/playerhoods-logo-transparent.png" alt="" width={32} height={32} className="h-8 w-8" />
            PlayerHoods
          </div>
          <button
            type="button"
            onClick={finish}
            className="rounded-full px-4 py-2 text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            Skip
          </button>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous onboarding screen"
            className="absolute left-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6E4F7] bg-white text-2xl font-bold text-[#1C63E8] shadow-sm transition hover:-translate-x-0.5 hover:border-[#93B7F7] md:flex"
          >
            ‹
          </button>

          <div className="grid w-full place-items-center">
            {slide.kind === 'welcome' ? (
              <div className="mx-auto grid max-w-[760px] place-items-center text-center">
                <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-[#EAF3FF] shadow-[0_18px_50px_rgba(28,99,232,0.16)]">
                  <Image src="/playerhoods-logo-transparent.png" alt="" width={86} height={86} className="h-20 w-20" priority />
                </div>
                <p className="mb-4 text-[12px] font-extrabold uppercase tracking-[0.22em] text-[#1C63E8]">Welcome</p>
                <h1 className="text-balance text-[42px] font-black leading-[1.02] tracking-normal text-[#061A5F] sm:text-[58px] lg:text-[70px]">
                  {slide.title}
                </h1>
                <p className="mx-auto mt-6 max-w-[620px] text-pretty text-[18px] font-semibold leading-8 text-[#35517D] sm:text-[21px]">
                  {slide.body}
                </p>
                <button
                  type="button"
                  onClick={goNext}
                  className="mt-10 rounded-full bg-[#0F64F5] px-8 py-4 text-[14px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(15,100,245,0.28)] transition hover:-translate-y-0.5 hover:bg-[#0755D8]"
                >
                  Get Started
                </button>
              </div>
            ) : (
              <div className="grid w-full place-items-center gap-4">
                <div className="relative aspect-[4/3] w-full max-w-[920px] overflow-hidden rounded-[28px] bg-white">
                  <Image
                    src={slide.imageSrc}
                    alt={slide.imageAlt}
                    fill
                    sizes="(max-width: 768px) 92vw, 920px"
                    className="object-contain"
                    priority={index === 1}
                  />
                </div>
                <div className="sr-only">
                  <h1>{slide.title}</h1>
                  <p>{slide.body}</p>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next onboarding screen"
            disabled={index === finalIndex}
            className="absolute right-0 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6E4F7] bg-white text-2xl font-bold text-[#1C63E8] shadow-sm transition hover:translate-x-0.5 hover:border-[#93B7F7] disabled:cursor-not-allowed disabled:opacity-35 md:flex"
          >
            ›
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 pb-2">
          <div className="flex items-center justify-center gap-2">
            {slides.map((item, itemIndex) => (
              <button
                key={`${item.kind}-${itemIndex}`}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Show onboarding screen ${itemIndex + 1}`}
                className={[
                  'h-2.5 rounded-full transition',
                  itemIndex === index ? 'w-8 bg-[#1C63E8]' : 'w-2.5 bg-[#CFE0FA] hover:bg-[#8AB2F3]',
                ].join(' ')}
              />
            ))}
          </div>

          <div className="flex min-h-[48px] items-center justify-center gap-3">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D6E4F7] bg-white text-2xl font-bold text-[#1C63E8] shadow-sm md:hidden"
              aria-label="Previous onboarding screen"
            >
              ‹
            </button>

            {index === finalIndex ? (
              <button
                type="button"
                onClick={finish}
                className="rounded-full bg-[#0F64F5] px-7 py-3.5 text-[13px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(15,100,245,0.28)] transition hover:-translate-y-0.5 hover:bg-[#0755D8]"
              >
                Start explore
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                className="rounded-full px-7 py-3.5 text-[12px] font-black uppercase tracking-[0.14em] text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              >
                Skip
              </button>
            )}

            <button
              type="button"
              onClick={goNext}
              disabled={index === finalIndex}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D6E4F7] bg-white text-2xl font-bold text-[#1C63E8] shadow-sm disabled:cursor-not-allowed disabled:opacity-35 md:hidden"
              aria-label="Next onboarding screen"
            >
              ›
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
