'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  ONBOARDING_AGREEMENT_INTRO,
  ONBOARDING_AGREEMENT_TITLE,
  SUPPORT_EMAIL,
} from '@/lib/legal'
import { acceptOnboardingLegalAgreementAction } from './actions'

export function LegalAgreementCard({
  continueHref,
}: {
  continueHref: string
}) {
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [responsibleUseAccepted, setResponsibleUseAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const canContinue = ageConfirmed && termsAccepted && responsibleUseAccepted

  const handleContinue = () => {
    if (!canContinue) return
    setError(null)
    startTransition(async () => {
      const result = await acceptOnboardingLegalAgreementAction()
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.assign(continueHref)
    })
  }

  return (
    <section className="ph-card rounded-[32px] px-8 py-8">
      <div className="mb-8">
        <div className="ph-kicker mb-3">Final step</div>
        <h1 className="ph-title">{ONBOARDING_AGREEMENT_TITLE}</h1>
        <p className="ph-subtitle mt-3 max-w-[620px] text-[13px] leading-6">
          {ONBOARDING_AGREEMENT_INTRO}
        </p>
      </div>

      <div className="space-y-4 rounded-[28px] border border-[#E2E8F0] bg-[#F8FBFF] p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(event) => setAgeConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-body-main font-semibold text-[#1E293B]">
            I confirm that I am at least 18 years old.
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-body-main font-semibold text-[#1E293B]">
            I agree to the PlayerHoods Terms of Use and Privacy Notice.
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={responsibleUseAccepted}
            onChange={(event) => setResponsibleUseAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span className="text-body-main font-semibold text-[#1E293B]">
            I agree to use PlayerHoods honestly and responsibly, and I will not mislead, deceive, impersonate, harass,
            or misuse another person's information.
          </span>
        </label>
      </div>

      <div className="mt-6 rounded-[20px] border border-[#E2E8F0] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[#64748B]">
            {isPending ? 'Saving agreement...' : 'You only need to confirm this once during onboarding.'}
          </span>
          {error ? <span className="text-sm font-medium text-rose-600">{error}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#64748B]">
          <Link href="/terms" className="underline underline-offset-2 hover:text-[#1E293B]">
            Terms of Use
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-[#1E293B]">
            Privacy Notice
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-[#1E293B]">
            Contact
          </a>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          disabled={!canContinue || isPending}
          onClick={handleContinue}
          className="rounded-full bg-[#C25E46] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#A94E39] disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
        >
          {isPending ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </section>
  )
}
