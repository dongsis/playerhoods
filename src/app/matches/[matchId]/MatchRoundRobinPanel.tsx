'use client'

import { useMemo, useState, useTransition } from 'react'
import type { MatchParticipantEnriched } from '@/lib/api/matches'
import type { MatchCourt, MatchStatus } from '@/lib/types/database'
import type { MatchLineupSnapshot } from '@/lib/match-lineup'

export type MatchRoundRobinPanelProps = {
  gameType: string | null
  matchStatus: MatchStatus
  isOrganizer: boolean
  confirmedParticipants: MatchParticipantEnriched[]
  matchCourts: MatchCourt[]
  finalCourtLabel: string | null
  savedLineup: MatchLineupSnapshot | null
  onSaveLineup: (lineup: MatchLineupSnapshot | null) => Promise<void>
}

type RoundRobinMatch = {
  court: string
  group: string[]
  teamA: string[]
  teamB: string[]
}

type RoundRobinResult =
  | {
      ok: false
      message: string
    }
  | {
      ok: true
      playerIds: string[]
      playersCount: number
      courtCount: number
      generatedCourtLabels: boolean
      setOne: RoundRobinMatch[]
      setTwo: RoundRobinMatch[]
    }

function shuffle<T>(items: T[]) {
  const next = items.slice()
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

function pairKey(left: string, right: string) {
  return [left, right].sort().join('||')
}

function groupKey(players: string[]) {
  return players.slice().sort().join('||')
}

function buildBlocks(players: string[]) {
  return shuffle(players.map((player) => [player]))
}

function fillGroups(blocks: string[][], courtCount: number) {
  const groups: string[][] = []
  let current: string[] = []

  for (const block of blocks) {
    if (current.length + block.length > 4) return null
    current = current.concat(block)
    if (current.length === 4) {
      groups.push(current)
      current = []
    }
  }

  if (current.length !== 0 || groups.length !== courtCount) return null
  return groups
}

function enforceTeams(group: string[]) {
  const shuffled = shuffle(group)
  return [
    [shuffled[0], shuffled[1]],
    [shuffled[2], shuffled[3]],
  ] as [string[], string[]]
}

function makeSet(players: string[], courts: string[]) {
  for (let tryIndex = 0; tryIndex < 320; tryIndex += 1) {
    const groups = fillGroups(buildBlocks(players), courts.length)
    if (!groups) continue

    return groups.map((group, index) => {
      const [teamA, teamB] = enforceTeams(group)
      return {
        court: courts[index],
        group: group.slice(),
        teamA,
        teamB,
      }
    })
  }

  return null
}

function deriveStats(matches: RoundRobinMatch[]) {
  const groupKeys = new Set<string>()
  const coOccur = new Set<string>()
  const teammates = new Set<string>()
  const opponents = new Set<string>()

  for (const match of matches) {
    const sortedGroup = match.group.slice().sort()
    groupKeys.add(groupKey(sortedGroup))

    for (let left = 0; left < sortedGroup.length; left += 1) {
      for (let right = left + 1; right < sortedGroup.length; right += 1) {
        coOccur.add(pairKey(sortedGroup[left], sortedGroup[right]))
      }
    }

    teammates.add(pairKey(match.teamA[0], match.teamA[1]))
    teammates.add(pairKey(match.teamB[0], match.teamB[1]))

    for (const left of match.teamA) {
      for (const right of match.teamB) {
        opponents.add(pairKey(left, right))
      }
    }
  }

  return { groupKeys, coOccur, teammates, opponents }
}

function scoreCandidate(candidate: RoundRobinMatch[], previous: ReturnType<typeof deriveStats>) {
  let penalty = 0

  for (const match of candidate) {
    const sortedGroup = match.group.slice().sort()

    if (previous.groupKeys.has(groupKey(sortedGroup))) penalty += 1000

    for (let left = 0; left < sortedGroup.length; left += 1) {
      for (let right = left + 1; right < sortedGroup.length; right += 1) {
        if (previous.coOccur.has(pairKey(sortedGroup[left], sortedGroup[right]))) penalty += 6
      }
    }

    if (previous.teammates.has(pairKey(match.teamA[0], match.teamA[1]))) penalty += 10
    if (previous.teammates.has(pairKey(match.teamB[0], match.teamB[1]))) penalty += 10

    for (const left of match.teamA) {
      for (const right of match.teamB) {
        if (previous.opponents.has(pairKey(left, right))) penalty += 3
      }
    }
  }

  return penalty
}

function buildCourtLabels(matchCourts: MatchCourt[], finalCourtLabel: string | null, neededCount: number) {
  const actualLabels = matchCourts
    .slice()
    .sort((left, right) => left.slot_index - right.slot_index)
    .map((court) => court.court_label)
    .filter(Boolean)

  if (actualLabels.length === 0 && finalCourtLabel) {
    actualLabels.push(finalCourtLabel)
  }

  const labels = actualLabels.slice(0, neededCount)
  while (labels.length < neededCount) {
    labels.push(`Court ${labels.length + 1}`)
  }

  return {
    labels,
    generatedCourtLabels: actualLabels.length > 0 && actualLabels.length !== neededCount,
  }
}

function buildRoundRobin(
  confirmedParticipants: MatchParticipantEnriched[],
  matchCourts: MatchCourt[],
  finalCourtLabel: string | null,
  gameType: string | null,
): RoundRobinResult {
  if (gameType === 'singles') {
    return { ok: false, message: 'Team setup is currently available for doubles only.' }
  }

  const uniquePlayers = confirmedParticipants
    .map((participant) => ({
      id: participant.id,
      name: participant.display_name,
    }))
    .filter((player, index, all) => all.findIndex((item) => item.id === player.id) === index)

  if (uniquePlayers.length < 4) {
    return { ok: false, message: 'Need 4 confirmed players to set doubles teams.' }
  }

  if (uniquePlayers.length % 4 !== 0) {
    return { ok: false, message: 'Set Teams currently needs confirmed players in groups of 4.' }
  }

  const courtCount = uniquePlayers.length / 4
  const { labels, generatedCourtLabels } = buildCourtLabels(matchCourts, finalCourtLabel, courtCount)
  const playerIds = uniquePlayers.map((player) => player.id)

  const setOne = makeSet(playerIds, labels)
  if (!setOne) {
    return { ok: false, message: 'Unable to generate the first team set. Try again after adjusting players or courts.' }
  }

  const firstSetStats = deriveStats(setOne)
  let bestSetTwo: RoundRobinMatch[] | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let tryIndex = 0; tryIndex < 320; tryIndex += 1) {
    const candidate = makeSet(playerIds, labels)
    if (!candidate) continue

    const score = scoreCandidate(candidate, firstSetStats)
    if (score < bestScore) {
      bestScore = score
      bestSetTwo = candidate
      if (score === 0) break
    }
  }

  if (!bestSetTwo) {
    return { ok: false, message: 'Unable to generate the second team set right now.' }
  }

  const playerNameMap = new Map(uniquePlayers.map((player) => [player.id, player.name]))
  const hydrateMatch = (match: RoundRobinMatch): RoundRobinMatch => ({
    court: match.court,
    group: match.group.map((playerId) => playerNameMap.get(playerId) ?? playerId),
    teamA: match.teamA.map((playerId) => playerNameMap.get(playerId) ?? playerId),
    teamB: match.teamB.map((playerId) => playerNameMap.get(playerId) ?? playerId),
  })

  return {
    ok: true,
    playerIds,
    playersCount: uniquePlayers.length,
    courtCount,
    generatedCourtLabels,
    setOne: setOne.map(hydrateMatch),
    setTwo: bestSetTwo.map(hydrateMatch),
  }
}

function SetCard({
  title,
  matches,
}: {
  title: string
  matches: RoundRobinMatch[]
}) {
  return (
    <div className="rounded-[20px] border border-slate-100 bg-slate-50/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-label text-slate-500">{title}</h3>
        <span className="text-body-sub font-semibold text-slate-400">{matches.length} court{matches.length === 1 ? '' : 's'}</span>
      </div>

      <div className="space-y-3">
        {matches.map((match) => (
          <div key={`${title}-${match.court}`} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-label text-slate-500">{match.court}</span>
              <span className="text-body-sub text-slate-300">{match.group.join(', ')}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2">
                <div className="text-label mb-1 text-orange-400">Team A</div>
                <div className="text-title-main text-orange-900">{match.teamA.join(' / ')}</div>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                <div className="text-label mb-1 text-sky-400">Team B</div>
                <div className="text-title-main text-sky-900">{match.teamB.join(' / ')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatchRoundRobinPanel({
  gameType,
  matchStatus,
  isOrganizer,
  confirmedParticipants,
  matchCourts,
  finalCourtLabel,
  savedLineup,
  onSaveLineup,
}: MatchRoundRobinPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const draftResult = useMemo(
    () => buildRoundRobin(confirmedParticipants, matchCourts, finalCourtLabel, gameType),
    [confirmedParticipants, finalCourtLabel, gameType, matchCourts],
  )

  if (matchStatus !== 'active') {
    return null
  }

  const activeLineup = savedLineup
  const emptyStateMessage = !draftResult.ok
    ? draftResult.message
    : isOrganizer
      ? 'Generate the lineup to show the matchups.'
      : 'The lineup will appear after the host generates it.'

  const handleGenerateLineup = () => {
    setError(null)
    const next = buildRoundRobin(confirmedParticipants, matchCourts, finalCourtLabel, gameType)
    if (!next.ok) {
      setError(next.message)
      return
    }

    const snapshot: MatchLineupSnapshot = {
      generatedAt: new Date().toISOString(),
      playerIds: next.playerIds,
      playersCount: next.playersCount,
      courtCount: next.courtCount,
      generatedCourtLabels: next.generatedCourtLabels,
      setOne: next.setOne,
      setTwo: next.setTwo,
    }

    startSaving(async () => {
      try {
        await onSaveLineup(snapshot)
      } catch (saveError) {
        setError((saveError as { message?: string })?.message ?? 'Could not save lineup.')
      }
    })
  }

  return (
    <div className="px-6 pb-6 pt-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-label mb-2">Set Teams</div>
          <p className="text-body-main max-w-2xl text-slate-500">
            Set doubles teams from the current confirmed players.
          </p>
        </div>
        {isOrganizer ? (
          <button
            type="button"
            onClick={handleGenerateLineup}
            disabled={!draftResult.ok || isSaving}
            className="text-body-sub rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : activeLineup ? 'Regenerate Teams' : 'Generate Teams'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="text-body-main mb-5 rounded-[20px] border border-rose-100 bg-rose-50 px-5 py-4 text-rose-600">
          {error}
        </div>
      ) : null}

      {!activeLineup ? (
        <div className="text-body-main rounded-[20px] border border-slate-100 bg-slate-50 px-5 py-4 text-slate-500">
          {emptyStateMessage}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="text-body-sub rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">
              {activeLineup.playersCount} players
            </span>
            <span className="text-body-sub rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">
              {activeLineup.courtCount} court{activeLineup.courtCount === 1 ? '' : 's'}
            </span>
            <span className="text-body-sub rounded-full border border-orange-100 bg-orange-50 px-3 py-1 font-semibold text-orange-600">
              Team sets
            </span>
          </div>

          {activeLineup.generatedCourtLabels ? (
            <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Current court info does not fully match the player count, so extra court labels were generated for the team preview.
            </div>
          ) : null}

          <div className="grid gap-5 xl:grid-cols-2">
            <SetCard title="Team Set 1" matches={activeLineup.setOne} />
            <SetCard title="Team Set 2" matches={activeLineup.setTwo} />
          </div>
        </>
      )}
    </div>
  )
}
