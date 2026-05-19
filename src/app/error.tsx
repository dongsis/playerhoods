'use client'

import { useEffect } from 'react'

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app:error]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#EEF1F7] px-4 py-10">
      <div className="ph-page-narrow">
        <div className="mb-6 flex justify-center">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/playerhoods-brand-stacked-cropped.png"
              alt="PlayerHoods"
              width={1512}
              height={375}
              className="h-16 w-56 object-contain"
            />
          </div>
        </div>

        <section className="ph-card px-6 py-6 text-center">
          <p className="mb-2 text-[0.72rem] font-black uppercase tracking-[0.18em] text-[#94A3B8]">
            Temporary issue
          </p>
          <h1 className="ph-title">We hit a loading problem.</h1>
          <p className="ph-subtitle mx-auto mb-6 mt-2 max-w-[28rem]">
            The page may have updated in the background. Reload once to continue, or return to sign in.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-[#C25E46] px-6 py-3 text-[0.78rem] font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_rgba(194,94,70,0.28)] transition hover:bg-[#B6533B]"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-full border border-[#D7E0EC] bg-white px-6 py-3 text-[0.78rem] font-black uppercase tracking-[0.08em] text-[#1E293B] transition hover:border-[#C6D3E3]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/login')}
              className="rounded-full border border-[#D7E0EC] bg-white px-6 py-3 text-[0.78rem] font-black uppercase tracking-[0.08em] text-[#64748B] transition hover:border-[#C6D3E3]"
            >
              Back to sign in
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
