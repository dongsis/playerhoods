import { NextResponse } from 'next/server'
import { getInvitationById, type InvitationDisplay } from '@/lib/invitations/get-invitation-by-id'
import { buildPublicJoinShareText } from '@/lib/public-join-share'
import { getAbsoluteUrl } from '@/lib/site-url'
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type RouteContext = {
  params: Promise<{ id: string }>
}

type MatchShareRow = {
  id: string
  organizer_id: string
  status: string
  formed_at: string | null
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return value
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!parts) return value
  const date = new Date(Date.UTC(2026, 0, 1, Number(parts[1]), Number(parts[2])))
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(date)
}

function invitationCanSharePublicLink(invitation: InvitationDisplay): boolean {
  const matchStatus = invitation.match_summary?.match_status ?? null
  const isExpired = invitation.expires_at ? new Date(invitation.expires_at) < new Date() : false
  const isParticipantRemoved =
    invitation.match_summary?.participant_status === 'removed'
    || Boolean(invitation.match_summary?.participant_removed_at)

  return (
    invitation.related_type === 'match'
    && !isExpired
    && invitation.status !== 'canceled'
    && invitation.status !== 'expired'
    && !isParticipantRemoved
    && !invitation.match_summary?.formed_at
    && matchStatus !== 'cancelled'
    && matchStatus !== 'canceled'
  )
}

async function getExistingPublicToken(
  supabase: SupabaseClient<Database>,
  matchId: string,
  createdBy: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('public_match_signup_links')
    .select('public_token')
    .eq('match_id', matchId)
    .eq('created_by', createdBy)
    .is('disabled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.public_token ?? null
}

async function getOrCreatePublicToken(
  supabase: SupabaseClient<Database>,
  matchId: string,
  createdBy: string,
): Promise<string> {
  const existingToken = await getExistingPublicToken(supabase, matchId, createdBy)
  if (existingToken) return existingToken

  const { data, error } = await supabase
    .from('public_match_signup_links')
    .insert({
      match_id: matchId,
      created_by: createdBy,
    })
    .select('public_token')
    .single()

  if (!error && data?.public_token) return data.public_token

  const racedToken = await getExistingPublicToken(supabase, matchId, createdBy)
  if (racedToken) return racedToken
  throw error ?? new Error('Could not create public share link.')
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params

  try {
    const displayClient = await createSupabaseServerClient()
    const invitation = await getInvitationById(displayClient, id)
    if (!invitation || !invitationCanSharePublicLink(invitation)) {
      return NextResponse.json({ error: 'Share link is not available for this invitation.' }, { status: 404 })
    }

    const serviceClient = createSupabaseServiceRoleClient()
    const { data: match, error: matchError } = await serviceClient
      .from('matches')
      .select('id,organizer_id,status,formed_at')
      .eq('id', invitation.related_id)
      .maybeSingle()

    if (matchError) throw matchError

    const matchRow = match as MatchShareRow | null
    if (!matchRow || matchRow.status !== 'active' || matchRow.formed_at) {
      return NextResponse.json({ error: 'Share link is not available for this match.' }, { status: 409 })
    }

    const publicToken = await getOrCreatePublicToken(serviceClient, matchRow.id, matchRow.organizer_id)
    const shareUrl = getAbsoluteUrl(`/join/${publicToken}`)
    const dateTimeLabel = [
      formatDate(invitation.match_summary?.match_date),
      formatTime(invitation.match_summary?.start_time),
    ].filter(Boolean).join(', ')
    const shareText = buildPublicJoinShareText({
      hostName: invitation.inviter_display_name,
      gameType: invitation.match_summary?.game_type,
      venueName: invitation.match_summary?.club_name,
      dateTimeLabel,
      url: shareUrl,
    })

    return NextResponse.json({ shareUrl, shareText })
  } catch (error) {
    console.error('[InvitationShareLink] create public share link:', error)
    return NextResponse.json({ error: 'Share link is not available right now.' }, { status: 500 })
  }
}
