import { createSupabasePublicServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import type { PublicParticipantStatusPayload } from '@/lib/types/database'

type StatusTokenIssueSource = 'invitation' | 'public_join_sms' | 'authenticated_self' | 'system'

type StatusTokenIssueRow = {
  status_token: string
  token_id: string
  match_participant_id: string
  expires_at: string | null
}

export type PublicParticipantStatus = PublicParticipantStatusPayload

export function getStatusPath(statusToken: string, params?: Record<string, string>): string {
  const query = params ? new URLSearchParams(params).toString() : ''
  const path = `/status/${encodeURIComponent(statusToken)}`
  return query ? `${path}?${query}` : path
}

export async function getPublicParticipantStatus(statusToken: string): Promise<PublicParticipantStatus | null> {
  const supabase = createSupabasePublicServerClient()
  const { data, error } = await supabase.rpc('rpc_public_participant_status', {
    p_status_token: statusToken,
  })

  if (error) throw error

  const rows = (data ?? []) as PublicParticipantStatus[]
  return rows[0] ?? null
}

export async function markPublicParticipantOut(statusToken: string): Promise<PublicParticipantStatus | null> {
  const supabase = createSupabasePublicServerClient()
  const { data, error } = await supabase.rpc('rpc_public_participant_out', {
    p_status_token: statusToken,
  })

  if (error) throw error

  const rows = (data ?? []) as PublicParticipantStatus[]
  return rows[0] ?? null
}

export async function issuePublicParticipantStatusTokenForParticipant(
  matchParticipantId: string,
  source: StatusTokenIssueSource,
  actorId?: string | null,
): Promise<StatusTokenIssueRow | null> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error } = await supabase.rpc('rpc_public_participant_status_token_issue', {
    p_match_participant_id: matchParticipantId,
    p_source: source,
    p_actor_id: actorId ?? null,
  })

  if (error) throw error

  const rows = (data ?? []) as StatusTokenIssueRow[]
  return rows[0] ?? null
}

export async function issuePublicParticipantStatusTokenForInvitation(
  invitationId: string,
  actorId?: string | null,
): Promise<StatusTokenIssueRow | null> {
  const supabase = createSupabaseServiceRoleClient()
  const { data, error } = await supabase.rpc('rpc_public_participant_status_token_issue_for_invitation', {
    p_invitation_id: invitationId,
    p_actor_id: actorId ?? null,
  })

  if (error) throw error

  const rows = (data ?? []) as StatusTokenIssueRow[]
  return rows[0] ?? null
}
