import type { SupabaseClient } from '@supabase/supabase-js'

export type InvitationDisplay = {
  id: string
  inviter_user_id: string
  inviter_display_name: string
  target_email: string | null
  target_name: string | null
  related_type: string
  related_id: string
  status: string
  magic_link_flow_status: string
  accepted_by_user_id: string | null
  accepted_at: string | null
  declined_at: string | null
  expires_at: string | null
  created_at: string
  match_summary: {
    match_id: string
    game_type: string | null
    match_date: string | null
    start_time: string | null
    club_name: string | null
    match_status?: string | null
    formed_at?: string | null
    match_participant_id?: string | null
    participant_status?: string | null
    participant_removed_at?: string | null
    participant_accepted_at?: string | null
    participant_org_approved_at?: string | null
    participant_confirmation_source?: string | null
    participant_accepted_via?: string | null
  } | null
  caller_email_matches: boolean
}

/** Get invitation by id for display. Returns single row or null. */
export async function getInvitationById(
  supabase: SupabaseClient,
  invitationId: string
): Promise<InvitationDisplay | null> {
  const { data, error } = await supabase.rpc('rpc_email_invitation_get', {
    p_invitation_id: invitationId,
  })
  if (error) throw error
  const rows = (data ?? []) as InvitationDisplay[]
  return rows[0] ?? null
}
