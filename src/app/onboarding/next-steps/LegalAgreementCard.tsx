'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { SUPPORT_EMAIL } from '@/lib/legal'
import { acceptOnboardingLegalAgreementAction } from './actions'

export function LegalAgreementCard({
  continueHref,
}: {
  continueHref: string
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleContinue = () => {
    if (!confirmed) {
      setError('Please confirm before continuing.')
      return
    }

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
    <section className="mx-auto max-w-[880px] rounded-[24px] border border-[#DCE7F3] bg-white px-5 py-5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.16)]">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 text-[#0B1F44]">Almost done</h1>
          <label className="mt-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked)
                if (event.target.checked) setError(null)
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0d6efd] focus:ring-[#0d6efd]"
            />
            <span className="text-body-main font-semibold leading-6 text-[#1E293B]">
              I confirm that I am 18 or older and agree to the PlayerHoods Terms, Privacy Notice, and responsible use rules.
            </span>
          </label>

          {error ? <p className="mt-3 text-body-main font-semibold text-rose-600">{error}</p> : null}

          <div className="mt-4 flex flex-wrap gap-4 text-body-sub font-semibold text-[#64748B]">
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

        <button
          type="button"
          disabled={isPending}
          onClick={handleContinue}
          className="text-body-main inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-[#071A44] px-5 font-semibold text-white shadow-sm transition hover:bg-[#0B255D] disabled:cursor-wait disabled:bg-[#94A3B8]"
        >
          {isPending ? 'Saving...' : 'Continue to PlayerHoods'}
        </button>
      </div>
    </section>
  )
}
