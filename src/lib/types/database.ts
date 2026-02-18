// Database types for playerhoods
// Based on Slice 1-3 migrations + v1.3 dual confirmation model

export type GroupMemberStatus = 'pending' | 'active' | 'removed'
export type MatchStatus = 'active' | 'cancelled' | 'archived'
export type MatchAdmissionMode = 'invite' | 'request'
export type MatchParticipantStatus = 'pending' | 'confirmed' | 'removed'
export type MatchJoinMethod = 'invited' | 'requested' | 'guest_add'

// Use `type` instead of `interface` for DB row types.
// TypeScript interfaces lack implicit index signatures required by
// supabase-js GenericTable (Record<string, unknown>).

export type Profile = {
  id: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  display_name: string
  avatar_url: string | null
  gender: string | null
  level: string | null
  availability_note: string | null
  plays_singles: boolean
  plays_doubles: boolean
  primary_club_id: string | null
  secondary_club_ids: string[] | null
  is_super_admin: boolean
  created_at: string
  updated_at: string
}

export type Club = {
  id: string
  name: string
  location_text: string | null
  notes: string | null
  timezone: string
  created_at: string
}

export type ClubAdmin = {
  id: string
  user_id: string
  club_id: string
  granted_by: string
  granted_at: string
}

export type Court = {
  id: string
  club_id: string
  court_code: string
  surface: string | null
  notes: string | null
  created_at: string
}

export type Group = {
  id: string
  name: string
  description: string | null
  boundary_keeper_id: string
  created_by: string
  created_at: string
}

export type GroupMember = {
  id: string
  group_id: string
  user_id: string
  status: GroupMemberStatus
  join_method: string | null
  invited_by: string | null
  created_at: string
  accepted_at: string | null
  removed_at: string | null
  removed_by: string | null
}

export type Match = {
  id: string
  organizer_id: string
  status: MatchStatus
  admission_mode: MatchAdmissionMode
  club_id: string | null
  court_ids: string[] | null  // deprecated: use match_courts table; kept until column dropped
  match_date: string | null
  start_time: string | null
  duration_minutes: number | null
  game_type: string | null
  required_count: number
  invitation_scope_group_ids: string[] | null
  can_participants_invite_users: boolean
  can_participants_add_guests: boolean
  can_participants_manage_participants: boolean
  formed_at: string | null
  start_at_utc: string | null
  created_at: string
}

export type MatchCourt = {
  id: string
  match_id: string
  slot_index: number
  court_label: string
  court_location: string | null
  court_notes: string | null
  start_at: string | null
  end_at: string | null
  created_by: string
  created_at: string
}

export type Guest = {
  id: string
  display_name: string
  notes: string | null
  created_by: string
  created_at: string
}

export type MatchParticipant = {
  id: string
  match_id: string
  status: MatchParticipantStatus
  join_method: MatchJoinMethod
  user_id: string | null
  guest_id: string | null
  created_by: string
  created_at: string
  confirmed_at: string | null
  removed_at: string | null
  // v1.3 dual confirmation fields
  user_accepted_at: string | null
  org_approved_at: string | null
  org_approved_by: string | null
  nominated_by: string | null
  removed_by: string | null
  removal_note: string | null
}

// View types
export type ProfileDisplay = {
  id: string
  display_name: string
}

export type MatchFormed = {
  match_id: string
  required_count: number
  confirmed_count: number
  is_formed: boolean
}

export type MatchParticipantAction = {
  id: string
  match_id: string
  match_participant_id: string
  action_type: string
  note: string | null
  created_by: string
  created_at: string
}

// Joined types for UI convenience
// Use ProfileDisplay (from view) for other-user display name resolution
export type MatchParticipantWithDetails = MatchParticipant & {
  profile?: ProfileDisplay | null
  guest?: Guest | null
}

export type MatchParticipantActionWithProfile = MatchParticipantAction & {
  profile?: ProfileDisplay | null
}

export type GroupMemberWithProfile = GroupMember & {
  profile?: ProfileDisplay | null
}

export type ClubAdminWithDetails = ClubAdmin & {
  profile?: ProfileDisplay | null
}

export type MatchSummary = Match & {
  organizer_name: string
  confirmed_count: number
  pending_count: number
  confirmed_names: string[]
  pending_names: string[]
}

// Club identity (per-club handle)
export type ClubIdentity = {
  id: string
  club_id: string
  user_id: string
  club_handle: string
  club_handle_norm: string
  created_at: string
}

export type ClubHandleCheckResult = {
  available: boolean
  suggestions: string[]
}

// RPC return type for user search
export type AdminUserSearchResult = {
  user_id: string
  display_name: string
  email: string
}

// Database interface for Supabase client typing
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string }
        Update: Partial<Profile>
        Relationships: []
      }
      clubs: {
        Row: Club
        Insert: Partial<Club>
        Update: Partial<Club>
        Relationships: []
      }
      club_admins: {
        Row: ClubAdmin
        Insert: Partial<ClubAdmin> & { user_id: string; club_id: string; granted_by: string }
        Update: Partial<ClubAdmin>
        Relationships: []
      }
      club_identities: {
        Row: ClubIdentity
        // club_handle_norm is GENERATED ALWAYS — excluded from Insert/Update
        Insert: Partial<Omit<ClubIdentity, 'club_handle_norm'>> & { club_id: string; user_id: string; club_handle: string }
        Update: Partial<Omit<ClubIdentity, 'club_handle_norm'>>
        Relationships: []
      }
      courts: {
        Row: Court
        Insert: Partial<Court> & { club_id: string; court_code: string }
        Update: Partial<Court>
        Relationships: []
      }
      groups: {
        Row: Group
        Insert: Partial<Group> & { name: string; boundary_keeper_id: string }
        Update: Partial<Group>
        Relationships: []
      }
      group_members: {
        Row: GroupMember
        Insert: Partial<GroupMember> & { group_id: string; user_id: string }
        Update: Partial<GroupMember>
        Relationships: []
      }
      matches: {
        Row: Match
        Insert: Partial<Match> & { organizer_id: string }
        Update: Partial<Match>
        Relationships: []
      }
      match_courts: {
        Row: MatchCourt
        Insert: Partial<MatchCourt> & { match_id: string; slot_index: number; court_label: string; created_by: string }
        Update: Partial<MatchCourt>
        Relationships: []
      }
      guests: {
        Row: Guest
        Insert: Partial<Guest> & { display_name: string; created_by: string }
        Update: Partial<Guest>
        Relationships: []
      }
      match_participants: {
        Row: MatchParticipant
        Insert: Partial<MatchParticipant> & { match_id: string; created_by: string }
        Update: Partial<MatchParticipant>
        Relationships: []
      }
      match_participant_actions: {
        Row: MatchParticipantAction
        Insert: Partial<MatchParticipantAction> & { match_participant_id: string; action_type: string; created_by: string }
        Update: Partial<MatchParticipantAction>
        Relationships: []
      }
    }
    Views: {
      match_formed: {
        Row: MatchFormed
        Relationships: []
      }
      profile_display: {
        Row: ProfileDisplay
        Relationships: []
      }
    }
    Functions: {
      is_user_in_match_scope: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: boolean
      }
      rpc_profile_init: {
        Args: { p_display_name: string; p_first_name?: string | null; p_last_name?: string | null }
        Returns: void
      }
      rpc_profile_update: {
        Args: { p_first_name?: string | null; p_last_name?: string | null }
        Returns: void
      }
      rpc_club_handle_check: {
        Args: { p_club_id: string; p_handle: string }
        Returns: ClubHandleCheckResult[]
      }
      rpc_club_join: {
        Args: { p_club_id: string; p_handle: string }
        Returns: void
      }
      rpc_club_handle_set: {
        Args: { p_club_id: string; p_new_handle: string }
        Returns: void
      }
      rpc_profile_set_primary_club: {
        Args: { p_club_id: string }
        Returns: void
      }
      is_club_admin: {
        Args: { p_club_id: string }
        Returns: boolean
      }
      rpc_admin_user_search: {
        Args: { p_query: string }
        Returns: AdminUserSearchResult[]
      }
      rpc_club_admin_grant: {
        Args: { p_user_id: string; p_club_id: string }
        Returns: void
      }
      rpc_club_admin_revoke: {
        Args: { p_user_id: string; p_club_id: string }
        Returns: void
      }
      rpc_club_create: {
        Args: { p_name: string; p_location_text?: string | null; p_timezone?: string; p_notes?: string | null }
        Returns: Club
      }
      rpc_club_update: {
        Args: { p_club_id: string; p_name?: string | null; p_location_text?: string | null; p_timezone?: string | null; p_notes?: string | null }
        Returns: void
      }
      rpc_court_create: {
        Args: { p_club_id: string; p_court_code: string; p_surface?: string | null; p_notes?: string | null }
        Returns: Court
      }
      rpc_court_update: {
        Args: { p_court_id: string; p_court_code?: string | null; p_surface?: string | null; p_notes?: string | null }
        Returns: void
      }
      rpc_court_delete: {
        Args: { p_court_id: string }
        Returns: void
      }
      rpc_group_accept_invite: {
        Args: { p_group_id: string }
        Returns: void
      }
      rpc_group_invite_user: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: void
      }
      rpc_group_leave: {
        Args: { p_group_id: string }
        Returns: void
      }
      rpc_match_create: {
        Args: {
          p_required_count?: number
          p_game_type?: string
          p_match_date?: string | null
          p_start_time?: string | null
          p_duration_minutes?: number | null
          p_club_id?: string | null
          p_invitation_scope_group_ids?: string[] | null
          p_can_participants_invite_users?: boolean
          p_can_participants_add_guests?: boolean
          p_can_participants_manage_participants?: boolean
        }
        Returns: unknown
      }
      // v1.3 RPCs
      rpc_match_request_join: {
        Args: { p_match_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_invite_user: {
        Args: { p_match_id: string; p_user_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_nominate_user: {
        Args: { p_match_id: string; p_user_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_accept_invite: {
        Args: { p_match_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_org_approve_participant: {
        Args: { p_match_participant_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_user_withdraw: {
        Args: { p_match_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_remove_participant: {
        Args: { p_match_participant_id: string; p_note?: string }
        Returns: void
      }
      rpc_match_reactivate_participant: {
        Args: { p_match_participant_id: string }
        Returns: void
      }
      rpc_match_add_guest_org: {
        Args: { p_match_id: string; p_guest_display_name: string; p_guest_notes: string; p_note?: string }
        Returns: void
      }
      rpc_match_add_guest_participant: {
        Args: { p_match_id: string; p_guest_display_name: string; p_guest_notes: string; p_note?: string }
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
