'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { getPublicPlayerProfile, type PublicPlayerProfile, type PublicSportProfile } from '@/lib/api/player-profiles'
import {
  getAvailabilityStatusDotClass,
  getLevelLabel,
  getLookingToPlayLabel,
  getPreferredPlayTimeLabel,
  getSportFormatOptions,
} from '@/lib/profile-options'
import { ParticipantDetailPanel, type DetailSportProfile, type DetailValue } from './ParticipantDetailPanel'

interface Props {
  open: boolean
  targetUserId: string
  matchSportId?: number | null
  matchSportName?: string | null
  cityNames?: string[]
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

function normalizeSportToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '') ?? ''
}

function pickMatchSportProfile(
  profile: PublicPlayerProfile | null,
  matchSportId: number | null | undefined,
  matchSportName: string | null | undefined,
): PublicSportProfile | null {
  if (!profile || profile.sport_profiles.length === 0) return null

  if (matchSportId != null) {
    const byId = profile.sport_profiles.find((item) => item.sport_id === matchSportId)
    if (byId) return byId
  }

  const matchToken = normalizeSportToken(matchSportName)
  if (!matchToken) return null

  return profile.sport_profiles.find((item) =>
    normalizeSportToken(item.sport_name) === matchToken ||
    normalizeSportToken(item.sport_code) === matchToken
  ) ?? null
}

function formatGenderLabel(gender: PublicPlayerProfile['gender']): string | null {
  switch (gender) {
    case 'female':
      return 'Female'
    case 'male':
      return 'Male'
    case 'unspecified':
      return 'Prefer not to say'
    default:
      return null
  }
}

function formatSportProfile(profile: PublicSportProfile): DetailSportProfile {
  return {
    key: `${profile.sport_id}`,
    sportName: profile.sport_name,
    level: getLevelLabel(profile.level) ?? profile.level ?? null,
    formatLabels: profile.preferred_formats
      .map((value) => getSportFormatOptions(profile.sport_code).find((option) => option.value === value)?.label ?? value)
      .filter(Boolean),
    playStyles: splitPlayStyle(profile.play_style),
  }
}

export function PlayerProfileDrawer({
  open,
  targetUserId,
  matchSportId = null,
  matchSportName = null,
  cityNames = [],
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
  const matchSportProfile = useMemo(
    () => pickMatchSportProfile(profile, matchSportId, matchSportName),
    [matchSportId, matchSportName, profile],
  )
  const displaySportProfile = matchSportId != null || matchSportName
    ? matchSportProfile
    : primarySportProfile

  const preferredTimes = useMemo(() => (
    formatList(
      (profile?.preferred_play_times ?? [])
        .map((value) => getPreferredPlayTimeLabel(value) ?? value)
        .filter(Boolean),
    )
  ), [profile])
  const sportProfiles = useMemo(
    () => (profile?.sport_profiles ?? []).map(formatSportProfile),
    [profile],
  )
  const detailItems = useMemo(() => {
    const next: DetailValue[] = []
    const cleanCities = cityNames.map((city) => city.trim()).filter(Boolean)
    const genderLabel = formatGenderLabel(profile?.gender ?? null)

    if (cleanCities.length > 0) {
      next.push({ key: 'city', label: 'City', value: cleanCities.slice(0, 2).join(', ') })
    }
    if (genderLabel) {
      next.push({ key: 'gender', label: 'Gender', value: genderLabel })
    }
    if ((profile?.sport_profiles ?? []).length > 0) {
      next.push({
        key: 'sports',
        label: 'Sports',
        value: profile!.sport_profiles.map((sport) => sport.sport_name).filter(Boolean).join(', '),
      })
    }

    return next
  }, [cityNames, profile])

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
      availabilityLabel={getLookingToPlayLabel(profile?.looking_to_play) ?? profile?.looking_to_play ?? null}
      level={getLevelLabel(displaySportProfile?.level) ?? displaySportProfile?.level ?? null}
      formatLabels={[]}
      connections={[]}
      playStyles={[]}
      preferredTimes={preferredTimes}
      sportProfiles={sportProfiles}
      detailTitle={detailItems.length > 0 ? 'Profile' : null}
      detailItems={detailItems}
      onClose={onClose}
    />
  )
}
