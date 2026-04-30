'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getPublicPlayerProfile, type PublicPlayerProfile, type PublicSportProfile } from '@/lib/api/player-profiles'
import {
  getAvailabilityStatusDotClass,
  getLevelLabel,
  getPreferredPlayTimeLabel,
  getSportFormatOptions,
} from '@/lib/profile-options'
import { ParticipantDetailPanel, type DetailConnection } from './ParticipantDetailPanel'

interface Props {
  open: boolean
  targetUserId: string
  onClose: () => void
}

function formatList(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
}

function splitPlayStyle(value: string | null | undefined): string[] {
  if (!value) return []

  return value
    .split(/[,\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function pickPrimarySportProfile(profile: PublicPlayerProfile | null): PublicSportProfile | null {
  if (!profile || profile.sport_profiles.length === 0) return null

  return profile.sport_profiles.find((item) =>
    item.level
    || item.preferred_formats.length > 0
    || item.play_style
    || item.competition_experience,
  ) ?? profile.sport_profiles[0]
}

function buildSharedConnections(profile: PublicPlayerProfile): DetailConnection[] {
  const connections: DetailConnection[] = []

  if (profile.shared_venue_names.length > 0) {
    connections.push({
      key: 'venues',
      icon: 'venue',
      text: `Both play at ${profile.shared_venue_names.join(', ')}`,
    })
  }

  if (profile.shared_group_names.length > 0) {
    connections.push({
      key: 'groups',
      icon: 'groups',
      text: `You both share ${profile.shared_group_names.join(', ')}`,
      iconClassName: 'text-sky-500',
    })
  }

  if (profile.shared_match_count > 0) {
    connections.push({
      key: 'matches',
      icon: 'matches',
      text:
        profile.shared_match_count === 1
          ? 'Played 1 match together'
          : `Played ${profile.shared_match_count} matches together`,
      iconClassName: 'text-amber-500',
    })
  }

  return connections
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

  const primarySportProfile = useMemo(
    () => pickPrimarySportProfile(profile),
    [profile],
  )

  const formatLabels = useMemo(() => {
    if (!primarySportProfile) return [] as string[]

    return primarySportProfile.preferred_formats
      .map((value) =>
        getSportFormatOptions(primarySportProfile.sport_code).find((option) => option.value === value)?.label ?? value,
      )
      .filter(Boolean)
  }, [primarySportProfile])

  const preferredTimes = useMemo(() => (
    formatList(
      (profile?.preferred_play_times ?? [])
        .map((value) => getPreferredPlayTimeLabel(value) ?? value)
        .filter(Boolean),
    )
  ), [profile])

  const connections = useMemo(
    () => (profile ? buildSharedConnections(profile) : []),
    [profile],
  )

  const playStyles = useMemo(
    () => splitPlayStyle(primarySportProfile?.play_style),
    [primarySportProfile],
  )

  if (!open) return null

  if (loading) {
    return (
      <ParticipantDetailPanel
        open={open}
        displayName="Loading..."
        connections={[{ key: 'loading', icon: 'groups', text: 'Loading player details...' }]}
        onClose={onClose}
      />
    )
  }

  if (error) {
    return (
      <ParticipantDetailPanel
        open={open}
        displayName="Player"
        detailTitle="Error"
        detailItems={[{ key: 'error', label: 'Profile', value: error }]}
        onClose={onClose}
      />
    )
  }

  return (
    <ParticipantDetailPanel
      open={open}
      displayName={profile?.display_name || 'Player'}
      avatarUrl={profile?.avatar_url ?? null}
      statusClassName={getAvailabilityStatusDotClass(profile?.looking_to_play)}
      level={getLevelLabel(primarySportProfile?.level) ?? primarySportProfile?.level ?? null}
      formatLabels={formatLabels}
      connections={connections}
      playStyles={playStyles}
      experience={primarySportProfile?.competition_experience ?? null}
      preferredTimes={preferredTimes}
      onClose={onClose}
    />
  )
}
