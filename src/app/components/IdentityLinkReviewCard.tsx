'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { IdentityLinkCandidate } from '@/lib/types/database'

type Props = {
  title: string
  body: string
  candidates: IdentityLinkCandidate[]
  onAccept: (guestId: string) => Promise<void>
  onKeepSeparate: (guestId: string) => Promise<void>
  acceptLabel?: string
  keepSeparateLabel?: string
  emptyStateLabel?: string
  className?: string
}

export function IdentityLinkReviewCard({
  title,
  body,
  candidates,
  onAccept,
  onKeepSeparate,
  acceptLabel = 'Link to my account',
  keepSeparateLabel = 'Keep separate for now',
  emptyStateLabel = 'No pending identity links.',
  className = '',
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [activeGuestId, setActiveGuestId] = useState<string | null>(null)
  const summary = useMemo(() => {
    const totalMatches = candidates.reduce((sum, candidate) => sum + candidate.match_participant_count, 0)
    return {
      count: candidates.length,
      totalMatches,
    }
  }, [candidates])

  const getMatchedContactLabel = (candidate: IdentityLinkCandidate) => {
    const contactType = candidate.matched_contact_type ?? candidate.matched_email_type
    if (contactType === 'auth_phone') return 'Verified login phone'
    return contactType === 'profile_contact' ? 'Verified profile contact email' : 'Verified login email'
  }

  const getMatchedContactValue = (candidate: IdentityLinkCandidate) => {
    if ((candidate.matched_contact_type ?? candidate.matched_email_type) === 'auth_phone') {
      return candidate.guest_phone ?? candidate.matched_contact_normalized ?? candidate.matched_email_normalized
    }
    return candidate.guest_email ?? candidate.matched_contact_normalized ?? candidate.matched_email_normalized
  }

  const handleAction = (guestId: string, action: 'accept' | 'keep') => {
    setError(null)
    setActiveGuestId(guestId)
    startTransition(async () => {
      try {
        if (action === 'accept') {
          await onAccept(guestId)
        } else {
          await onKeepSeparate(guestId)
        }
        router.refresh()
      } catch (nextError) {
        const message =
          nextError && typeof nextError === 'object' && 'message' in nextError && typeof (nextError as { message?: unknown }).message === 'string'
            ? (nextError as { message: string }).message
            : 'Could not update the identity link.'
        setError(message)
      } finally {
        setActiveGuestId(null)
      }
    })
  }

  return (
    <section className={`rounded-[28px] border border-[#E2E8F0] bg-white p-6 shadow-[0_16px_40px_-28px_rgba(30,41,59,0.16)] ${className}`}>
      <div className="mb-4">
        <h2 className="text-h2 text-[#1E293B]">{title}</h2>
        <p className="mt-1 text-body-sub text-[#64748B]">{body}</p>
      </div>

      {candidates.length > 0 ? (
        <div className="mb-4 rounded-[20px] border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-3">
          <p className="text-body-main text-[#334155]">
            {summary.count === 1
              ? '1 contact or invitation record matches your verified email.'
              : `${summary.count} contact or invitation records match your verified email.`}
          </p>
          <p className="mt-1 text-body-sub text-[#94A3B8]">
            {summary.totalMatches > 0
              ? `We also found ${summary.totalMatches} related match participation record${summary.totalMatches === 1 ? '' : 's'}.`
              : 'These matches will be easier to manage after linking.'}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {candidates.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#D7E0EC] bg-[#F8FBFF] px-4 py-5 text-body-sub text-[#94A3B8]">
            {emptyStateLabel}
          </div>
        ) : (
          candidates.map((candidate) => {
            const busy = isPending && activeGuestId === candidate.guest_id
            return (
              <div
                key={`${candidate.guest_id}:${candidate.matched_email_normalized}`}
                className="rounded-[22px] border border-[#E2E8F0] bg-[#F8FBFF] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-title-main text-[#1E293B]">{candidate.display_name}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="text-label inline-flex items-center rounded-full bg-[#E2E8F0] px-2.5 py-1 text-[#64748B]">
                        {getMatchedContactLabel(candidate)}
                      </span>
                      <span className="text-label inline-flex items-center rounded-full bg-[#EEF6FF] px-2.5 py-1 text-[#4B6B92]">
                        {candidate.match_participant_count} match record{candidate.match_participant_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-2 text-body-sub text-[#64748B]">
                      {getMatchedContactValue(candidate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAction(candidate.guest_id, 'accept')}
                      className="rounded-full bg-[#1E293B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Saving...' : acceptLabel}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleAction(candidate.guest_id, 'keep')}
                      className="rounded-full border border-[#D7E0EC] bg-white px-4 py-2 text-sm font-semibold text-[#475569] transition hover:border-[#CBD5E1] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {keepSeparateLabel}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {error ? (
        <p className="mt-4 text-body-sub text-rose-600">{error}</p>
      ) : null}
    </section>
  )
}
