'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/app/components/Avatar'
import type { ContactClaimSuggestionCard } from '@/lib/types/database'

type ActionResult = void | { ok: boolean; error?: string }

export function PeopleYouMayKnowPanel({
  continueHref,
  suggestions,
  onSave,
  onDismiss,
  onComplete,
}: {
  continueHref: string
  suggestions: ContactClaimSuggestionCard[]
  onSave: (suggestionId: string) => Promise<ActionResult>
  onDismiss: () => Promise<ActionResult>
  onComplete: () => Promise<void>
}) {
  const router = useRouter()
  const [cards, setCards] = useState(suggestions)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isContinuing, startContinuing] = useTransition()

  const visibleCards = useMemo(
    () => cards.filter((card) => card.suggestion_id !== savingId),
    [cards, savingId],
  )

  const handleSave = async (suggestionId: string) => {
    setError(null)
    setSavingId(suggestionId)
    const result = await onSave(suggestionId)
    setSavingId(null)

    if (result && !result.ok) {
      setError(result.error ?? 'Could not save this player.')
      return
    }

    setCards((current) => current.filter((card) => card.suggestion_id !== suggestionId))
  }

  const finish = (dismiss: boolean) => {
    startContinuing(async () => {
      setError(null)
      if (dismiss) {
        const result = await onDismiss()
        if (result && !result.ok) {
          setError(result.error ?? 'Could not continue.')
          return
        }
      }

      await onComplete()
      router.replace(continueHref)
      router.refresh()
    })
  }

  return (
    <div className="ph-page-narrow max-w-[880px] px-4 py-8">
      <section className="ph-card rounded-[32px] px-8 py-8">
        <div className="mb-8">
          <div className="ph-kicker mb-3">Final step</div>
          <h1 className="ph-title">People you may know</h1>
          <p className="ph-subtitle mt-3 max-w-[620px] text-[13px] leading-6">
            These players may know you. You can choose who to save.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {visibleCards.map((card) => {
            const displayName = card.display_name?.trim() || 'Player'
            const isSaving = savingId === card.suggestion_id

            return (
              <div
                key={card.suggestion_id}
                className="flex min-h-[88px] items-center justify-between gap-4 rounded-2xl border border-[#DCE6F2] bg-white px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={card.avatar_url} displayName={displayName} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-[#0B1F3A]">{displayName}</div>
                    <div className="text-[12px] font-semibold text-[#7A8AA0]">PlayerHoods player</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSaving || isContinuing}
                  onClick={() => handleSave(card.suggestion_id)}
                  className="shrink-0 rounded-full border border-[#CFE1EA] bg-white px-4 py-2 text-[12px] font-bold text-[#0F766E] transition hover:border-[#99D4C7] hover:bg-[#F0FDFA] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )
          })}
        </div>

        {visibleCards.length === 0 ? (
          <div className="rounded-2xl border border-[#DCE6F2] bg-[#F8FBFF] px-4 py-4 text-sm font-semibold text-[#64748B]">
            All set.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={isContinuing}
            onClick={() => finish(true)}
            className="rounded-full border border-[#D7E0EC] bg-white px-5 py-2.5 text-sm font-semibold text-[#64748B] transition hover:border-[#CBD5E1] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isContinuing ? 'Continuing...' : 'Maybe later'}
          </button>
          <button
            type="button"
            disabled={isContinuing}
            onClick={() => finish(false)}
            className="rounded-full bg-[#0B1F3A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#123255] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </section>
    </div>
  )
}
