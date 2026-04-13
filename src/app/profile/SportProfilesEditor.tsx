'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sport, UserSportProfile } from '@/lib/types/database'
import {
  CURRENT_FREQUENCY_OPTIONS,
  getSportFormatOptions,
  getSportGearLabels,
} from '@/lib/profile-options'
import { TENNIS_RACKET_OPTIONS } from '@/lib/tennis-racket-options'

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
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
  const [playStyle, setPlayStyle] = useState(initialProfile?.play_style ?? '')
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
    'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
  const textareaClass =
    'min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'

  const formatOptions = useMemo(() => getSportFormatOptions(sport.code), [sport.code])
  const gearLabels = useMemo(() => getSportGearLabels(sport.code), [sport.code])
  const primaryGearOptions = useMemo(
    () => (sport.code === 'tennis' ? TENNIS_RACKET_OPTIONS : []),
    [sport.code],
  )
  const primaryGearListId = `sport-profile-${sport.id}-gear-primary-options`

  const snapshot = JSON.stringify({
    level,
    yearsPlaying,
    preferredFormats: [...preferredFormats].sort(),
    currentFrequency,
    playStyle,
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
      playStyle: initialProfile?.play_style ?? '',
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
    setPlayStyle(initialProfile?.play_style ?? '')
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
          play_style: playStyle,
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
    playStyle,
    preferredFormats,
    snapshot,
    sport.id,
    teamsPlayedOn,
    yearsPlaying,
  ])

  const saveLabel =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Could not save'
          : 'Saved automatically'

  const toggleFormat = (value: string) => {
    setPreferredFormats((previous) =>
      previous.includes(value)
        ? previous.filter((item) => item !== value)
        : [...previous, value],
    )
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_14px_36px_-28px_rgba(15,23,42,0.26)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">{sport.display_name}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Keep this light and social. Enough detail to help someone know how you like to play.
          </p>
        </div>
        <span className={`text-xs ${saveState === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>
          {saveLabel}
        </span>
      </div>

      <div className="mt-5 space-y-5">
        <section>
          <h4 className="text-sm font-semibold text-slate-900">Playing Profile</h4>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Level</FieldLabel>
              <input value={level} onChange={(event) => setLevel(event.target.value)} className={inputClass} />
            </div>
            <div>
              <FieldLabel>Years playing</FieldLabel>
              <input
                type="number"
                min={0}
                max={80}
                value={yearsPlaying}
                onChange={(event) => setYearsPlaying(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Current frequency</FieldLabel>
              <select
                value={currentFrequency}
                onChange={(event) => setCurrentFrequency(event.target.value)}
                className={inputClass}
              >
                <option value="">Select frequency...</option>
                {CURRENT_FREQUENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Play style</FieldLabel>
              <input
                value={playStyle}
                onChange={(event) => setPlayStyle(event.target.value)}
                placeholder="Patient baseline, social doubles, aggressive at net..."
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4">
            <FieldLabel>Preferred format</FieldLabel>
            <div className="flex flex-wrap gap-2.5">
              {formatOptions.map((option) => {
                const selected = preferredFormats.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleFormat(option.value)}
                    className={`inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition ${
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
        </section>

        <section className="border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-900">Competition Background</h4>
          <p className="mt-1 text-sm text-slate-500">
            Optional. Helpful if it adds context, easy to skip if you mostly play casually.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FieldLabel>Tournament / league experience</FieldLabel>
              <textarea
                value={competitionExperience}
                onChange={(event) => setCompetitionExperience(event.target.value)}
                placeholder="League nights, club ladder, a few local tournaments..."
                className={textareaClass}
              />
            </div>
            <div>
              <FieldLabel>Teams played on</FieldLabel>
              <input
                value={teamsPlayedOn}
                onChange={(event) => setTeamsPlayedOn(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>Line played</FieldLabel>
              <input
                value={linePlayed}
                onChange={(event) => setLinePlayed(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <FieldLabel>Highlights / notable results</FieldLabel>
              <textarea
                value={highlights}
                onChange={(event) => setHighlights(event.target.value)}
                placeholder="Optional. Keep it light."
                className={textareaClass}
              />
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-5">
          <h4 className="text-sm font-semibold text-slate-900">Gear</h4>
          <p className="mt-1 text-sm text-slate-500">
            Practical details can double as a conversation starter.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div>
              <FieldLabel>{gearLabels.primary}</FieldLabel>
              <input
                value={gearPrimary}
                onChange={(event) => setGearPrimary(event.target.value)}
                list={primaryGearOptions.length > 0 ? primaryGearListId : undefined}
                placeholder={primaryGearOptions.length > 0 ? 'Choose a racquet or type your own' : undefined}
                className={inputClass}
              />
              {primaryGearOptions.length > 0 && (
                <>
                  <datalist id={primaryGearListId}>
                    {primaryGearOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Pick from common models, or type a different racquet if yours is not listed yet.
                  </p>
                </>
              )}
            </div>
            {gearLabels.secondary && (
              <div>
                <FieldLabel>{gearLabels.secondary}</FieldLabel>
                <input
                  value={gearSecondary}
                  onChange={(event) => setGearSecondary(event.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            {gearLabels.shoes && (
              <div>
                <FieldLabel>{gearLabels.shoes}</FieldLabel>
                <input
                  value={gearShoes}
                  onChange={(event) => setGearShoes(event.target.value)}
                  className={inputClass}
                />
              </div>
            )}
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
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-sm text-slate-500">
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
