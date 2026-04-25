'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getPublicPlayerProfile, type PublicPlayerProfile, type PublicSportProfile } from '@/lib/api/player-profiles'
import {
  getLevelLabel,
  getLookingToPlayLabel,
  getPreferredPlayTimeLabel,
  getSportFormatOptions,
} from '@/lib/profile-options'
import { Avatar } from './Avatar'

interface Props {
  open: boolean
  targetUserId: string
  onClose: () => void
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_36px_-30px_rgba(15,23,42,0.28)]">
      <h3 className="text-h2 text-slate-900">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function KeyValue({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-label">{label}</dt>
      <dd className="text-body-main mt-1 text-slate-700">{value}</dd>
    </div>
  )
}

function summarizeSharedConnections(profile: PublicPlayerProfile): string[] {
  const lines: string[] = []

  if (profile.shared_venue_names.length > 0) {
    lines.push(
      `You both play at ${profile.shared_venue_names.join(', ')}.`,
    )
  }

  if (profile.shared_group_names.length > 0) {
    lines.push(
      `You both share ${profile.shared_group_names.join(', ')}.`,
    )
  }

  if (profile.shared_match_count > 0) {
    lines.push(
      profile.shared_match_count === 1
        ? 'You have already shared a match.'
        : `You have already shared ${profile.shared_match_count} matches.`,
    )
  }

  return lines
}

function formatList(values: string[]): string | null {
  return values.length > 0 ? values.join(', ') : null
}

function hasSportContent(profile: PublicSportProfile): boolean {
  return Boolean(
    profile.level
      || profile.years_playing != null
      || profile.preferred_formats.length > 0
      || profile.play_style
      || profile.competition_experience
  )
}

function SportProfileCard({ profile }: { profile: PublicSportProfile }) {
  const formatLabels = profile.preferred_formats
    .map((value) => getSportFormatOptions(profile.sport_code).find((option) => option.value === value)?.label ?? value)
    .filter(Boolean)
  const hasCompetition = profile.competition_experience

  return (
    <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-title-main text-slate-900">{profile.sport_name}</h3>
          <p className="text-body-sub mt-1 text-slate-500">
            {hasSportContent(profile)
              ? 'Quick snapshot of how they like to play.'
              : 'They play this sport, but have not filled in the details yet.'}
          </p>
        </div>
      </div>

      {hasSportContent(profile) && (
        <div className="mt-5 space-y-5">
          <div>
            <h4 className="text-title-main text-slate-900">Playing Profile</h4>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              {profile.level && <KeyValue label="Level" value={getLevelLabel(profile.level) ?? profile.level} />}
              {formatLabels.length > 0 && (
                <KeyValue label="Preferred format" value={formatLabels.join(', ')} />
              )}
              {profile.play_style && <KeyValue label="Play style" value={profile.play_style} />}
            </dl>
          </div>

          {hasCompetition && (
            <div className="border-t border-slate-200 pt-5">
              <h4 className="text-title-main text-slate-900">Competition Background</h4>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                {profile.competition_experience && (
                  <KeyValue label="Tournament / league experience" value={profile.competition_experience} />
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function PlayerProfileDrawer({
  open,
  targetUserId,
  onClose,
}: Props) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setProfile(null)
    setLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()

    getPublicPlayerProfile(supabase, targetUserId)
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile)
      })
      .catch((loadError) => {
        if (!cancelled) setError((loadError as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, targetUserId])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose, open])

  const sharedConnectionLines = useMemo(
    () => (profile ? summarizeSharedConnections(profile) : []),
    [profile],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label="Close player profile"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto border-l border-slate-200 bg-slate-50 p-5 shadow-[-18px_0_40px_-24px_rgba(15,23,42,0.32)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar
              src={profile?.avatar_url}
              displayName={profile?.display_name || 'Player'}
              size="md"
              className="h-12 w-12"
            />
            <div>
              <h2 className="text-h2 text-slate-900">
                {profile?.display_name || 'Player profile'}
              </h2>
              <p className="text-body-sub mt-1 text-slate-500">
                Quick context for getting to know this player.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {loading && (
          <p className="text-body-main mt-6 text-slate-500">Loading player profile...</p>
        )}

        {error && (
          <p className="text-body-main mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            {error}
          </p>
        )}

        {!loading && !error && profile && (
          <div className="mt-6 space-y-4">
            <Section title="Shared profile">
              <dl className="grid gap-4 sm:grid-cols-2">
                <KeyValue
                  label="Looking to play"
                  value={getLookingToPlayLabel(profile.looking_to_play) ?? 'Not shared yet'}
                />
                <KeyValue
                  label="Preferred times"
                  value={
                    formatList(
                      profile.preferred_play_times
                        .map((value) => getPreferredPlayTimeLabel(value) ?? value)
                        .filter(Boolean),
                    ) ?? 'Not shared yet'
                  }
                />
              </dl>
            </Section>

            <Section title="Possible shared connections">
              {sharedConnectionLines.length === 0 ? (
                <p className="text-body-main text-slate-500">
                  No strong overlap signal yet, but this profile still gives you a quick feel for how they play.
                </p>
              ) : (
                <div className="space-y-2">
                  {sharedConnectionLines.map((line) => (
                    <p key={line} className="text-body-main text-slate-700">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </Section>

            {profile.sport_profiles.length > 0 ? (
              <div className="space-y-4">
                {profile.sport_profiles.map((sportProfile) => (
                  <SportProfileCard
                    key={`${profile.user_id}-${sportProfile.sport_id}`}
                    profile={sportProfile}
                  />
                ))}
              </div>
            ) : (
              <Section title="Sports">
                <p className="text-body-main text-slate-500">No sports listed yet.</p>
              </Section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}
