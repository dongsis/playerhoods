import { notFound } from 'next/navigation'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import {
  getCourts,
  getMatchCourts,
  getMatchDetailData,
  isCallerInMatchScope,
  type AdmissionTarget,
  type ContactPersonAdmissionTarget,
  type MatchDetailData,
} from '@/lib/api/matches'
import { getGroups } from '@/lib/api/groups'
import { getIdentityLinkCandidates } from '@/lib/api/identity-links'
import { getInviteCircleList, type InviteCircleRow } from '@/lib/api/play-network'
import type { Court, Group, MatchCourt, IdentityLinkCandidate } from '@/lib/types/database'

type MatchDetailUser = Awaited<ReturnType<typeof getUser>>

export type MatchDetailLoaderData = {
  matchId: string
  user: MatchDetailUser
  detail: MatchDetailData
  matchCourts: MatchCourt[]
  inScope: boolean
  venueCourts: Court[]
  admissionTargets: AdmissionTarget[]
  contactPersonTargets: ContactPersonAdmissionTarget[]
  inviteCircle: InviteCircleRow[]
  allGroups: Group[]
  identityLinkCandidates: IdentityLinkCandidate[]
}

async function loadWithFallback<T>(label: string, loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    console.error(`[MatchDetailLoader] ${label}:`, error)
    return fallback
  }
}

export async function loadMatchDetailPageData(matchId: string): Promise<MatchDetailLoaderData> {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()

  if (user) {
    const { error } = await supabase.rpc('rpc_reconcile_identity_guest_participants')
    if (error) {
      console.error('[MatchDetail] reconcile identity:', error)
    }
  }

  let detail: MatchDetailData
  try {
    detail = await getMatchDetailData(supabase, matchId, user?.id ?? null)
  } catch (error) {
    console.error('[MatchDetail] getMatchDetailData failed for matchId:', matchId, error)
    notFound()
  }

  const [matchCourts, inScope, venueCourts] = await Promise.all([
    loadWithFallback('getMatchCourts', () => getMatchCourts(supabase, matchId), [] as MatchCourt[]),
    user
      ? loadWithFallback('isCallerInMatchScope', () => isCallerInMatchScope(supabase, matchId), false)
      : Promise.resolve(false),
    detail.match.venue_id
      ? loadWithFallback(
          'getCourts',
          () => getCourts(supabase, detail.match.venue_id as string, detail.match.sport_id),
          [] as Court[],
        )
      : Promise.resolve([] as Court[]),
  ])

  const [inviteCircle, allGroups, identityLinkCandidates] = await Promise.all([
    user
      ? loadWithFallback('inviteCircle', () => getInviteCircleList(supabase), [] as InviteCircleRow[])
      : Promise.resolve([] as InviteCircleRow[]),
    detail.isOrganizer && detail.match.status === 'active'
      ? loadWithFallback('groups', () => getGroups(supabase), [] as Group[])
      : Promise.resolve([] as Group[]),
    user
      ? loadWithFallback('identityLinkCandidates', () => getIdentityLinkCandidates(supabase), [] as IdentityLinkCandidate[])
      : Promise.resolve([] as IdentityLinkCandidate[]),
  ])

  return {
    matchId,
    user,
    detail,
    matchCourts,
    inScope,
    venueCourts,
    admissionTargets: [],
    contactPersonTargets: [],
    inviteCircle,
    allGroups,
    identityLinkCandidates,
  }
}
