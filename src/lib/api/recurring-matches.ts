import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  Match,
  MatchCourtPlanMode,
  MatchDoublesFormat,
  RecurringMatchSeries,
} from '@/lib/types/database'
import {
  createMatch,
  getMatchListData,
  inviteGroupToMatch,
  inviteUserToMatch,
  inviteContactGuestToMatch,
  type MatchListItem,
} from '@/lib/api/matches'

type Client = SupabaseClient<Database>

export type RecurringDirectInviteInput =
  | { kind: 'user'; userId: string }
  | { kind: 'contact'; guestId: string }

export type CreateRecurringMatchSeriesInput = {
  name: string
  sport_id: number
  venue_id?: string
  game_type?: string
  doubles_format?: MatchDoublesFormat | null
  required_count: number
  required_court_count: number
  start_date: string
  start_time?: string
  duration_minutes?: number
  court_plan_mode: MatchCourtPlanMode
  court_note?: string | null
  organizer_note?: string | null
  final_court_label?: string | null
  court_labels?: string[] | null
  invitation_scope_group_ids?: string[]
  invitation_scope_user_ids?: string[]
  invited_group_ids?: string[]
  direct_invites?: RecurringDirectInviteInput[]
  weeks_ahead_count?: number
}

export type RecurringMatchSeriesDetail = {
  series: RecurringMatchSeries
  sportName: string | null
  venueName: string | null
  matches: MatchListItem[]
}

export type RecurringMatchSeriesCreateResult = {
  series: RecurringMatchSeries
  matches: Match[]
  hasQueuedGuestDeliveries: boolean
}

function parseDateParts(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map((value) => Number.parseInt(value, 10))
  if (!year || !month || !day) {
    throw new Error('invalid_match_date')
  }
  return { year, month, day }
}

function addDaysToDateString(dateStr: string, daysToAdd: number) {
  const { year, month, day } = parseDateParts(dateStr)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + daysToAdd)
  return date.toISOString().slice(0, 10)
}

export async function createRecurringMatchSeries(
  supabase: Client,
  input: CreateRecurringMatchSeriesInput,
): Promise<RecurringMatchSeriesCreateResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user) throw new Error('auth_required')

  const weeksAheadCount = Math.min(Math.max(input.weeks_ahead_count ?? 4, 1), 12)

  const { data: series, error: seriesError } = await supabase.rpc('rpc_recurring_match_series_create', {
    p_name: input.name.trim(),
    p_sport_id: input.sport_id,
    p_venue_id: input.venue_id ?? null,
    p_game_type: input.game_type ?? null,
    p_doubles_format: input.doubles_format ?? null,
    p_required_count: input.required_count,
    p_required_court_count: input.required_court_count,
    p_start_date: input.start_date,
    p_start_time: input.start_time ?? null,
    p_duration_minutes: input.duration_minutes ?? null,
    p_court_plan_mode: input.court_plan_mode,
    p_organizer_note: input.organizer_note?.trim() || null,
    p_invitation_scope_group_ids: input.invitation_scope_group_ids ?? [],
    p_invitation_scope_user_ids: input.invitation_scope_user_ids ?? [],
    p_weeks_ahead_count: weeksAheadCount,
  })

  if (seriesError) throw seriesError

  const matches: Match[] = []
  let hasQueuedGuestDeliveries = false

  for (let index = 0; index < weeksAheadCount; index += 1) {
    const matchDate = addDaysToDateString(input.start_date, index * 7)
    const match = await createMatch(supabase, {
      required_count: input.required_count,
      required_court_count: input.required_court_count,
      match_date: matchDate,
      start_time: input.start_time,
      duration_minutes: input.duration_minutes,
      game_type: input.game_type,
      doubles_format: input.doubles_format ?? null,
      venue_id: input.venue_id,
      sport_id: input.sport_id,
      invitation_scope_group_ids: input.invitation_scope_group_ids,
      invitation_scope_user_ids: input.invitation_scope_user_ids,
      can_participants_invite_users: true,
      can_participants_manage_participants: false,
      court_plan_mode: input.court_plan_mode,
      court_note: input.court_note ?? null,
      final_court_label: input.final_court_label ?? null,
      court_labels: input.court_labels ?? [],
      organizer_note: input.organizer_note ?? null,
      recurring_series_id: series.id,
      recurring_instance_index: index + 1,
    })

    for (const candidate of input.direct_invites ?? []) {
      try {
        if (candidate.kind === 'user') {
          await inviteUserToMatch(supabase, match.id, candidate.userId)
        } else {
          await inviteContactGuestToMatch(supabase, match.id, candidate.guestId)
          hasQueuedGuestDeliveries = true
        }
      } catch (inviteError) {
        console.error(`[RecurringMatchSeries] invite ${match.id}:`, inviteError)
      }
    }

    for (const groupId of input.invited_group_ids ?? []) {
      try {
        await inviteGroupToMatch(supabase, match.id, groupId)
        hasQueuedGuestDeliveries = true
      } catch (groupInviteError) {
        console.error(`[RecurringMatchSeries] group invite ${match.id}/${groupId}:`, groupInviteError)
      }
    }

    matches.push(match)
  }

  return {
    series: series as RecurringMatchSeries,
    matches,
    hasQueuedGuestDeliveries,
  }
}

export async function getRecurringMatchSeriesDetail(
  supabase: Client,
  userId: string,
  seriesId: string,
): Promise<RecurringMatchSeriesDetail | null> {
  const { data: series, error: seriesError } = await supabase
    .from('recurring_match_series')
    .select('*')
    .eq('id', seriesId)
    .maybeSingle()

  if (seriesError) throw seriesError
  if (!series) return null

  const [matches, venueRes, sportRes] = await Promise.all([
    getMatchListData(supabase, userId),
    series.venue_id
      ? supabase.from('venues').select('name').eq('id', series.venue_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('sports').select('display_name').eq('id', series.sport_id).maybeSingle(),
  ])

  if (venueRes.error) throw venueRes.error
  if (sportRes.error) throw sportRes.error

  const seriesMatches = matches
    .filter((item) => item.match.recurring_series_id === seriesId)
    .sort((left, right) => {
      const leftDate = `${left.match.match_date ?? ''}T${left.match.start_time ?? '00:00:00'}`
      const rightDate = `${right.match.match_date ?? ''}T${right.match.start_time ?? '00:00:00'}`
      return leftDate.localeCompare(rightDate)
    })

  return {
    series: series as RecurringMatchSeries,
    sportName: (sportRes.data as { display_name?: string } | null)?.display_name ?? null,
    venueName: (venueRes.data as { name?: string } | null)?.name ?? null,
    matches: seriesMatches,
  }
}
