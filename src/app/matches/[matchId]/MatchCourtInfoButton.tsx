'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  getMatchCourtOffers,
  releaseMatchCourtOffer,
  selectMatchCourtOffer,
  sendMatchMessage,
  submitMatchCourtOffer,
  updateMatchCourtOffer,
  type MatchCourtOffer,
  type MatchParticipantEnriched,
} from '@/lib/api/matches'
import type { Court } from '@/lib/types/database'

type Props = {
  matchId: string
  currentUserId: string
  organizerUserId: string | null
  organizerName: string
  participants: MatchParticipantEnriched[]
  venueCourts: Court[]
  showSelectAction?: boolean
}

const DEFAULT_COURT_LABELS = Array.from({ length: 10 }, (_, index) => `crt ${index + 1}`)

function formatOfferTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function MatchCourtInfoButton({
  matchId,
  currentUserId,
  organizerUserId,
  organizerName,
  participants,
  venueCourts,
  showSelectAction = false,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offers, setOffers] = useState<MatchCourtOffer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [courtLabel, setCourtLabel] = useState('')
  const [note, setNote] = useState('')

  const courtOptions = useMemo(
    () => (
      venueCourts.length > 0
        ? [...venueCourts]
            .sort((left, right) => left.court_code.localeCompare(right.court_code))
            .map((court) => court.court_code)
        : DEFAULT_COURT_LABELS
    ),
    [venueCourts],
  )

  const nameMap = useMemo(() => {
    const map = new Map<string, string>()
    participants.forEach((participant) => {
      if (participant.user_id) {
        map.set(participant.user_id, participant.display_name)
      }
    })
    if (organizerUserId) {
      map.set(organizerUserId, organizerName)
    }
    return map
  }, [organizerName, organizerUserId, participants])

  const myOffer = useMemo(
    () => offers.find((offer) => offer.volunteer_user_id === currentUserId && offer.status !== 'released') ?? null,
    [currentUserId, offers],
  )

  const loadOffers = async () => {
    const supabase = createSupabaseBrowserClient()
    const nextOffers = await getMatchCourtOffers(supabase, matchId)
    setOffers(nextOffers)
    const nextMyOffer = nextOffers.find((offer) => offer.volunteer_user_id === currentUserId && offer.status !== 'released') ?? null
    setCourtLabel(nextMyOffer?.court_label ?? '')
    setNote(nextMyOffer?.note ?? '')
    setLoaded(true)
  }

  const openPanel = async () => {
    setOpen(true)
    setError(null)
    if (!loaded) {
      try {
        await loadOffers()
      } catch (loadError) {
        setError((loadError as Error).message)
      }
    }
  }

  const refreshAfterMutation = async () => {
    await loadOffers()
    router.refresh()
  }

  const handleSave = async () => {
    const trimmedCourt = courtLabel.trim()
    if (!trimmedCourt) {
      setError('Court info is required')
      return
    }

    setPending(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      if (myOffer) {
        await updateMatchCourtOffer(supabase, myOffer.id, {
          court_label: trimmedCourt,
          note,
          status: 'proposed',
        })
      } else {
        await submitMatchCourtOffer(supabase, matchId, trimmedCourt, note)
      }

      const body = note.trim()
        ? `Updated court info: ${trimmedCourt}. ${note.trim()}`
        : `Updated court info: ${trimmedCourt}.`
      await sendMatchMessage(supabase, matchId, currentUserId, body)
      await refreshAfterMutation()
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setPending(false)
    }
  }

  const handleRevoke = async () => {
    if (!myOffer) return

    setPending(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      await releaseMatchCourtOffer(supabase, myOffer.id)
      await sendMatchMessage(supabase, matchId, currentUserId, 'Removed court info.')
      await refreshAfterMutation()
    } catch (revokeError) {
      setError((revokeError as Error).message)
    } finally {
      setPending(false)
    }
  }

  const handleSelect = async (offer: MatchCourtOffer) => {
    setPending(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    try {
      await selectMatchCourtOffer(supabase, matchId, offer.id)
      await sendMatchMessage(supabase, matchId, currentUserId, `Selected court info: ${offer.court_label}.`)
      setOpen(false)
      await refreshAfterMutation()
    } catch (selectError) {
      setError((selectError as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { void openPanel() }}
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          padding: '0.48rem 1rem',
          border: '1px solid #d0d5dd',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.92)',
          cursor: 'pointer',
          color: '#344054',
          boxShadow: '0 8px 16px -14px rgba(15, 23, 42, 0.3)',
        }}
      >
        I've booked a court
      </button>

      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 70,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#fff',
              borderRadius: '16px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.14)',
              padding: '1rem',
              display: 'grid',
              gap: '0.85rem',
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>Update court info</h4>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', color: '#667085', lineHeight: 1.45 }}>
                Share one court you secured for this match, or update your latest court info.
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#667085', marginBottom: '0.3rem' }}>
                Court
              </label>
              <input
                type="text"
                value={courtLabel}
                onChange={(event) => setCourtLabel(event.target.value)}
                list="match-court-info-options"
                placeholder="crt 1"
                style={{
                  width: '100%',
                  padding: '0.7rem 0.8rem',
                  fontSize: '0.84rem',
                  borderRadius: '12px',
                  border: '1px solid #d0d5dd',
                  outline: 'none',
                }}
              />
              <datalist id="match-court-info-options">
                {courtOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#667085', marginBottom: '0.3rem' }}>
                Note
              </label>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional court details"
                style={{
                  width: '100%',
                  minHeight: '84px',
                  resize: 'vertical',
                  padding: '0.7rem 0.8rem',
                  fontSize: '0.84rem',
                  borderRadius: '12px',
                  border: '1px solid #d0d5dd',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                {myOffer ? (
                  <button
                    type="button"
                    onClick={() => { void handleRevoke() }}
                    disabled={pending}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#b42318',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: pending ? 'wait' : 'pointer',
                      padding: 0,
                    }}
                  >
                    Revoke my court
                  </button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    background: '#fff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    padding: '0.45rem 0.7rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSave() }}
                  disabled={pending}
                  style={{
                    background: '#111827',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 0.7rem',
                    borderRadius: '8px',
                    cursor: pending ? 'wait' : 'pointer',
                    fontSize: '0.8rem',
                    opacity: pending ? 0.6 : 1,
                  }}
                >
                  {pending ? 'Saving...' : (myOffer ? 'Update info' : 'Add info')}
                </button>
              </div>
            </div>

            {error ? (
              <p style={{ margin: 0, color: '#b42318', fontSize: '0.8rem' }}>{error}</p>
            ) : null}

            <div style={{ borderTop: '1px solid #eef2f7', paddingTop: '0.85rem' }}>
              <div style={{ marginBottom: '0.55rem', fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>
                Current court updates
              </div>
              {offers.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#98a2b3' }}>No court updates yet.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {offers.map((offer) => (
                    <div
                      key={offer.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '12px',
                        padding: '0.7rem 0.8rem',
                        background: offer.volunteer_user_id === currentUserId ? '#fffaf5' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>
                            {offer.court_label}
                          </div>
                          <div style={{ marginTop: '0.18rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                            {(nameMap.get(offer.volunteer_user_id) ?? 'Player')} · {formatOfferTime(offer.updated_at)}
                          </div>
                        </div>
                        {showSelectAction ? (
                          <button
                            type="button"
                            onClick={() => { void handleSelect(offer) }}
                            disabled={pending}
                            style={{
                              background: '#fff',
                              color: '#16a34a',
                              border: '1px solid #bbf7d0',
                              padding: '0.38rem 0.65rem',
                              borderRadius: '999px',
                              cursor: pending ? 'wait' : 'pointer',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                            }}
                          >
                            Use this court
                          </button>
                        ) : null}
                      </div>
                      {offer.note ? (
                        <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: '#475467', lineHeight: 1.45 }}>
                          {offer.note}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
