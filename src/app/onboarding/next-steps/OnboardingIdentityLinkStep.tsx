'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IdentityLinkReviewCard } from '@/app/components/IdentityLinkReviewCard'
import type { IdentityLinkCandidate } from '@/lib/types/database'

export function OnboardingIdentityLinkStep({
  continueHref,
  candidates,
  onAccept,
  onKeepSeparate,
  onSkip,
}: {
  continueHref: string
  candidates: IdentityLinkCandidate[]
  onAccept: (guestId: string) => Promise<void | { ok: boolean; error?: string }>
  onKeepSeparate: (guestId: string) => Promise<void | { ok: boolean; error?: string }>
  onSkip: () => Promise<void>
}) {
  const router = useRouter()
  const [isSkipping, startSkipping] = useTransition()

  const handleSkip = () => {
    startSkipping(async () => {
      await onSkip()
      router.replace(continueHref)
      router.refresh()
    })
  }

  return (
    <div className="ph-page-narrow max-w-[880px] px-4 py-8">
      <section className="ph-card rounded-[32px] px-8 py-8">
        <div className="mb-8">
          <div className="ph-kicker mb-3">Final step</div>
          <h1 className="ph-title">We found invitations for you</h1>
          <p className="ph-subtitle mt-3 max-w-[620px] text-[13px] leading-6">
            We found matches linked to your contact information.
          </p>
        </div>

        <IdentityLinkReviewCard
          title="Review previous invitations"
          body="Link them to your account so PlayerHoods can recognize them as yours going forward."
          candidates={candidates}
          onAccept={onAccept}
          onKeepSeparate={onKeepSeparate}
          className="shadow-none"
        />

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={isSkipping}
            onClick={handleSkip}
            className="rounded-full border border-[#D7E0EC] bg-white px-5 py-2.5 text-sm font-semibold text-[#64748B] transition hover:border-[#CBD5E1] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSkipping ? 'Continuing...' : 'Not now'}
          </button>
        </div>
      </section>
    </div>
  )
}
