'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sport, UserSportProfile } from '@/lib/types/database'
import {
  LEVEL_OPTIONS,
  PLAY_STYLE_OPTIONS,
  getSportFormatOptions,
} from '@/lib/profile-options'

type SaveSportProfileInput = {
  sport_id: number
  level?: string | null
  years_playing?: number | null
  preferred_formats?: string[]
  current_frequency?: string | null
  play_style?: string | null
  competition_experience?: string | null
  teams_played_on?: string | null
  line_played?: string | null
  highlights?: string | null
  gear_primary?: string | null
  gear_secondary?: string | null
  gear_shoes?: string | null
}

interface Props {
  sports: Sport[]
  activeSportIds: number[]
  initialProfiles: UserSportProfile[]
  onSaveProfile: (input: SaveSportProfileInput) => Promise<void>
}

function parsePlayStyles(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function serializePlayStyles(values: string[]): string | null {
  if (values.length === 0) return null
  return values.join(', ')
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-label mb-1 block">
      {children}
    </label>
  )
}

function SportProfileCard({
  sport,
  initialProfile,
  onSaveProfile,
}: {
  sport: Sport
  initialProfile?: UserSportProfile
  onSaveProfile: (input: SaveSportProfileInput) => Promise<void>
}) {
  const [level, setLevel] = useState(initialProfile?.level ?? '')
  const [yearsPlaying, setYearsPlaying] = useState(
    initialProfile?.years_playing != null ? String(initialProfile.years_playing) : '',
  )
  const [preferredFormats, setPreferredFormats] = useState<string[]>(
    initialProfile?.preferred_formats ?? [],
  )
  const [currentFrequency, setCurrentFrequency] = useState(initialProfile?.current_frequency ?? '')
  const [playStyles, setPlayStyles] = useState<string[]>(parsePlayStyles(initialProfile?.play_style))
  const [competitionExperience, setCompetitionExperience] = useState(
    initialProfile?.competition_experience ?? '',
  )
  const [teamsPlayedOn, setTeamsPlayedOn] = useState(initialProfile?.teams_played_on ?? '')
  const [linePlayed, setLinePlayed] = useState(initialProfile?.line_played ?? '')
  const [highlights, setHighlights] = useState(initialProfile?.highlights ?? '')
  const [gearPrimary, setGearPrimary] = useState(initialProfile?.gear_primary ?? '')
  const [gearSecondary, setGearSecondary] = useState(initialProfile?.gear_secondary ?? '')
  const [gearShoes, setGearShoes] = useState(initialProfile?.gear_shoes ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const mountedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const inputClass =
    'text-body-main h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
  const textareaClass =
    'text-body-main min-h-[72px] w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'

  const formatOptions = useMemo(() => getSportFormatOptions(sport.code), [sport.code])
  const snapshot = JSON.stringify({
    level,
    yearsPlaying,
    preferredFormats: [...preferredFormats].sort(),
    currentFrequency,
    playStyles: [...playStyles].sort(),
    competitionExperience,
    teamsPlayedOn,
    linePlayed,
    highlights,
    gearPrimary,
    gearSecondary,
    gearShoes,
  })

  useEffect(() => {
    const nextSnapshot = JSON.stringify({
      level: initialProfile?.level ?? '',
      yearsPlaying:
        initialProfile?.years_playing != null ? String(initialProfile.years_playing) : '',
      preferredFormats: [...(initialProfile?.preferred_formats ?? [])].sort(),
      currentFrequency: initialProfile?.current_frequency ?? '',
      playStyles: parsePlayStyles(initialProfile?.play_style).sort(),
      competitionExperience: initialProfile?.competition_experience ?? '',
      teamsPlayedOn: initialProfile?.teams_played_on ?? '',
      linePlayed: initialProfile?.line_played ?? '',
      highlights: initialProfile?.highlights ?? '',
      gearPrimary: initialProfile?.gear_primary ?? '',
      gearSecondary: initialProfile?.gear_secondary ?? '',
      gearShoes: initialProfile?.gear_shoes ?? '',
    })

    setLevel(initialProfile?.level ?? '')
    setYearsPlaying(initialProfile?.years_playing != null ? String(initialProfile.years_playing) : '')
    setPreferredFormats(initialProfile?.preferred_formats ?? [])
    setCurrentFrequency(initialProfile?.current_frequency ?? '')
    setPlayStyles(parsePlayStyles(initialProfile?.play_style))
    setCompetitionExperience(initialProfile?.competition_experience ?? '')
    setTeamsPlayedOn(initialProfile?.teams_played_on ?? '')
    setLinePlayed(initialProfile?.line_played ?? '')
    setHighlights(initialProfile?.highlights ?? '')
    setGearPrimary(initialProfile?.gear_primary ?? '')
    setGearSecondary(initialProfile?.gear_secondary ?? '')
    setGearShoes(initialProfile?.gear_shoes ?? '')
    lastSavedSnapshotRef.current = nextSnapshot
    setSaveState('idle')
  }, [initialProfile])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }

    if (snapshot === lastSavedSnapshotRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('saving')

    saveTimerRef.current = setTimeout(async () => {
      try {
        await onSaveProfile({
          sport_id: sport.id,
          level,
          years_playing:
            yearsPlaying.trim() !== '' && /^\d+$/.test(yearsPlaying.trim())
              ? Number.parseInt(yearsPlaying, 10)
              : null,
          preferred_formats: preferredFormats,
          current_frequency: currentFrequency,
          play_style: serializePlayStyles(playStyles),
          competition_experience: competitionExperience,
          teams_played_on: teamsPlayedOn,
          line_played: linePlayed,
          highlights,
          gear_primary: gearPrimary,
          gear_secondary: gearSecondary,
          gear_shoes: gearShoes,
        })
        lastSavedSnapshotRef.current = snapshot
        setSaveState('saved')
        setTimeout(() => {
          setSaveState((previous) => (previous === 'saved' ? 'idle' : previous))
        }, 1200)
      } catch {
        setSaveState('error')
      }
    }, 500)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [
    competitionExperience,
    currentFrequency,
    gearPrimary,
    gearSecondary,
    gearShoes,
    highlights,
    level,
    linePlayed,
    onSaveProfile,
    playStyles,
    preferredFormats,
    snapshot,
    sport.id,
    teamsPlayedOn,
    yearsPlaying,
  ])

  const toggleFormat = (value: string) => {
    setPreferredFormats((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    )
  }

  const togglePlayStyle = (value: string) => {
    setPlayStyles((previous) => {
      if (previous.includes(value)) {
        return previous.filter((item) => item !== value)
      }
      if (previous.length >= 3) {
        return previous
      }
      return [...previous, value]
    })
  }

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.26)]">
      <div>
        <h3 className="text-h2 tracking-tight text-slate-900">{sport.display_name}</h3>
      </div>

      <div className="mt-4 space-y-4">
        <section>
          <h4 className="text-title-main text-slate-900">Playing Profile</h4>
          <div className="mt-2.5 grid gap-3 md:grid-cols-2">
            <div>
              <FieldLabel>Level</FieldLabel>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className={inputClass}
              >
                <option value="">Select level...</option>
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Preferred format</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {formatOptions.map((option) => {
                  const selected = preferredFormats.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleFormat(option.value)}
                      className={`text-body-main inline-flex items-center rounded-full border px-3 py-1.5 transition ${
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                      }`}
                      aria-pressed={selected}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <FieldLabel>Play style</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {PLAY_STYLE_OPTIONS.map((option) => {
                const selected = playStyles.includes(option.value)
                const disabled = !selected && playStyles.length >= 3
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => togglePlayStyle(option.value)}
                    disabled={disabled}
                    className={`text-body-main inline-flex items-center rounded-full border px-3 py-1.5 transition ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : disabled
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900'
                    }`}
                    aria-pressed={selected}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Tournament / league experience</FieldLabel>
              <textarea
                value={competitionExperience}
                onChange={(event) => setCompetitionExperience(event.target.value)}
                placeholder="League nights, club ladder, a few local tournaments..."
                className={textareaClass}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export function SportProfilesEditor({
  sports,
  activeSportIds,
  initialProfiles,
  onSaveProfile,
}: Props) {
  const activeSports = sports.filter((sport) => activeSportIds.includes(sport.id))
  const profileMap = new Map(initialProfiles.map((profile) => [profile.sport_id, profile]))

  if (activeSports.length === 0) {
    return (
      <div className="text-body-main rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-slate-500">
        Choose at least one sport above to unlock its playing profile.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeSports.map((sport) => (
        <SportProfileCard
          key={sport.id}
          sport={sport}
          initialProfile={profileMap.get(sport.id)}
          onSaveProfile={onSaveProfile}
        />
      ))}
    </div>
  )
}
