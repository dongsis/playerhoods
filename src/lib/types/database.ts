// Database types for playerhoods
// Based on Slice 1-3 migrations + v1.3 dual confirmation model

export type IdentityLink = {
  id: string
  provider: string
  verified_email: string
  user_id: string
  linked_type: string
  linked_id: string
  linked_by_user_id: string | null
  created_at: string
}

export type GroupMemberStatus = 'pending' | 'active' | 'removed'
export type MatchStatus = 'active' | 'cancelled' | 'archived'
export type MatchAdmissionMode = 'invite' | 'request'
export type MatchParticipantStatus = 'pending' | 'confirmed' | 'removed'
export type MatchJoinMethod = 'invited' | 'requested' | 'nominated' | 'guest_add' | 'manual'

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
  /** v1.7: Preferred contact channel */
  contact_channel?: 'email' | 'sms'
  /** v1.7: Override email. NULL = use auth.users.email */
  contact_email?: string | null
  /** v1.7: Phone for SMS */
  contact_phone?: string | null
  /** Phase 1: Global master switch — show in Club Members discovery */
  show_in_club_member_discovery?: boolean
  /** Phase 1: Global master switch — allow direct invites from club members */
  allow_non_group_invites?: boolean
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
  primary_sport_id: number | null  // v1.6.3: FK sports; NULL = multi-sport/unspecified
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
  // v1.5 Identity: group-scoped alias (priority: personal_remark > group_display_name > display_name)
  group_display_name: string | null
}

// v1.5 Identity: private remark the owner sets on a target user (owner-only via RLS)
export type UserPersonalRemark = {
  id: string
  owner_id: string
  target_user_id: string
  group_id: string | null
  remark: string
  created_at: string
  updated_at: string
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
  sport_id: number  // v1.6.3: FK sports; NOT NULL DEFAULT 1 (tennis)
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
  email: string | null
  phone: string | null
  status: 'active' | 'inactive'
  created_by: string
  created_at: string
}

// v1.6.2-lite: Personal Roster bookmark (user-scoped favorites)
export type UserRosterGuest = {
  owner_user_id: string
  guest_id: string
  created_at: string
  created_by: string
}

// v1.6.3: Sport dictionary
export type Sport = {
  id: number
  code: string
  display_name: string
  is_active: boolean
  created_at: string
}

// v1.6.3: User sport preferences
export type UserSport = {
  user_id: string
  sport_id: number
  created_at: string
}

// v1.6.3: Contact Player sport tags
export type GuestSport = {
  guest_id: string
  sport_id: number
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
  // v1.5+ dual confirmation (user_accepted_at removed in v1.6.3)
  org_approved_at: string | null
  org_approved_by: string | null
  nominated_by: string | null
  removed_by: string | null
  removal_note: string | null
  // v1.5 participant-accepted fields
  participant_accepted_at: string | null
  participant_accepted_via: string | null  // 'in_app' | 'manual' | 'delegate_manual' | null
  manual_confirmed_by: string | null
}

// View types
export type ProfileDisplay = {
  id: string
  display_name: string
  avatar_url?: string | null
}

export type MatchFormed = {
  match_id: string
  required_count: number
  confirmed_count: number
  is_formed: boolean
  pending_count: number  // v1.5
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
  /** Layer 2: Club-scoped discovery override. NULL = no override (treat as true). */
  visible_in_club_member_discovery?: boolean | null
  /** Layer 2: Club-scoped non-group invite override. NULL = no override (treat as true). */
  accept_non_group_invites_in_club?: boolean | null
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
      user_personal_remarks: {
        Row: UserPersonalRemark
        Insert: Partial<UserPersonalRemark> & { owner_id: string; target_user_id: string; remark: string }
        Update: Partial<UserPersonalRemark>
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
      // v1.6.2-lite: Personal Roster (RPC-only writes; RLS blocks direct insert/update/delete)
      user_roster_guests: {
        Row: UserRosterGuest
        Insert: Partial<UserRosterGuest> & { owner_user_id: string; guest_id: string }
        Update: Partial<UserRosterGuest>
        Relationships: []
      }
      // v1.6.3: Sports dictionary
      sports: {
        Row: Sport
        Insert: Partial<Sport> & { id: number; code: string; display_name: string }
        Update: Partial<Sport>
        Relationships: []
      }
      // v1.6.3: User sport preferences
      user_sports: {
        Row: UserSport
        Insert: Partial<UserSport> & { user_id: string; sport_id: number }
        Update: Partial<UserSport>
        Relationships: []
      }
      // v1.6.3: Contact Player sport tags
      guest_sports: {
        Row: GuestSport
        Insert: Partial<GuestSport> & { guest_id: string; sport_id: number }
        Update: Partial<GuestSport>
        Relationships: []
      }
      // v1.7: Identity links (verified email -> user + legacy rows)
      identity_links: {
        Row: IdentityLink
        Insert: Partial<IdentityLink> & { provider: string; verified_email: string; user_id: string; linked_type: string; linked_id: string }
        Update: Partial<IdentityLink>
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
      // v1.5 Identity: group-context display resolver
      v_group_member_display: {
        Row: {
          group_id: string
          member_user_id: string
          effective_display_name: string
          group_display_name: string | null
          display_name: string
          personal_remark: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      // v1.5: self-only scope check (granted to authenticated, safe to call directly)
      is_caller_in_match_scope: {
        Args: { p_match_id: string }
        Returns: boolean
      }
      rpc_profile_init: {
        Args: { p_display_name: string; p_first_name?: string | null; p_last_name?: string | null }
        Returns: void
      }
      rpc_profile_update: {
        Args: {
          p_first_name?: string | null
          p_last_name?: string | null
          p_contact_channel?: string | null
          p_contact_email?: string | null
          p_contact_phone?: string | null
          p_show_in_club_member_discovery?: boolean | null
          p_allow_non_group_invites?: boolean | null
        }
        Returns: void
      }
      rpc_club_identity_set_preferences: {
        Args: {
          p_club_id: string
          p_visible_in_club_member_discovery?: string | null
          p_accept_non_group_invites_in_club?: string | null
        }
        Returns: void
      }
      // v1.5 Identity: direct display_name setter (club handle deprecated as sync path)
      rpc_profile_set_display_name: {
        Args: { p_display_name: string }
        Returns: void
      }
      // v1.8: Set avatar URL from storage upload
      rpc_profile_set_avatar_url: {
        Args: { p_avatar_url: string }
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
      // v1.5 Identity: set/clear group-scoped alias for the calling user
      rpc_group_set_display_name: {
        Args: { p_group_id: string; p_display_name: string }
        Returns: void
      }
      rpc_group_create: {
        Args: { p_name: string; p_description?: string | null }
        Returns: Group
      }
      rpc_group_invite_user: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: void
      }
      rpc_group_leave: {
        Args: { p_group_id: string }
        Returns: void
      }
      rpc_group_reject_invite: {
        Args: { p_group_id: string }
        Returns: void
      }
      rpc_group_update: {
        Args: { p_group_id: string; p_name: string; p_description?: string | null }
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
      // v1.5 match participation RPCs
      rpc_match_request_join: {
        Args: { p_match_id: string }
        Returns: MatchParticipant
      }
      rpc_match_invite_user: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: MatchParticipant
      }
      rpc_match_nominate_user: {
        Args: { p_match_id: string; p_user_id: string }
        Returns: MatchParticipant
      }
      rpc_match_accept_invite: {
        Args: { p_match_id: string }
        Returns: MatchParticipant
      }
      rpc_match_org_approve_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      rpc_match_user_withdraw: {
        Args: { p_match_id: string }
        Returns: MatchParticipant
      }
      rpc_match_remove_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      // v1.7: Guest / Contact Player flows
      rpc_match_nominate_guest: {
        Args: { p_match_id: string; p_guest_id: string }
        Returns: MatchParticipant
      }
      // v1.7: Resolve participant display names for activity feed.
      rpc_match_participant_display_names: {
        Args: { p_match_id: string; p_participant_ids: string[] }
        Returns: { participant_id: string; display_name: string }[]
      }
      // v1.7: Delegate-confirm pending participant (user or guest).
      rpc_match_delegate_confirm_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      // v1.6.2-lite: Roster guest RPCs
      rpc_roster_guest_create: {
        Args: { p_display_name: string; p_email?: string | null; p_phone?: string | null; p_notes?: string | null }
        Returns: Guest
      }
      rpc_roster_guest_list: {
        Args: Record<string, never>
        Returns: Guest[]
      }
      rpc_contact_player_resolution: {
        Args: Record<string, never>
        Returns: { guest_id: string; display_name: string; email: string | null; phone: string | null; notes: string | null; linked_user_id: string | null; resolution_state: string }[]
      }
      rpc_roster_guest_contact_links: {
        Args: { p_guest_ids: string[] }
        Returns: { guest_id: string; user_id: string }[]
      }
      // v1.6.3: Sports RPCs
      rpc_sports_list: {
        Args: Record<string, never>
        Returns: Sport[]
      }
      rpc_user_sports_set: {
        Args: { p_sport_codes: string[] }
        Returns: void
      }
      rpc_guest_sports_set: {
        Args: { p_guest_id: string; p_sport_codes: string[] }
        Returns: void
      }
      // Phase 1 Play Network Core
      rpc_club_members_discovery: {
        Args: { p_club_id: string; p_search?: string | null }
        Returns: { user_id: string; display_name: string | null; avatar_url: string | null; club_handle: string | null }[]
      }
      rpc_invite_circle_list: {
        Args: Record<string, never>
        Returns: { id: string; owner_user_id: string; target_user_id: string; source: string; created_at: string; target_display_name: string | null; target_avatar_url: string | null }[]
      }
      rpc_invite_circle_save_user: {
        Args: { p_target_user_id: string; p_source?: string }
        Returns: unknown
      }
      rpc_invite_circle_remove_user: {
        Args: { p_target_user_id: string }
        Returns: { removed: boolean }[]
      }
      rpc_match_admission_targets: {
        Args: { p_match_id: string; p_search?: string | null }
        Returns: { target_kind: string; target_id: string; display_name: string | null; avatar_url: string | null; club_handle: string | null; source: string; action_kind: string; can_admit: boolean; eligible_via: string | null; sort_name: string | null; contact_email: string | null }[]
      }
      rpc_match_admit_user: {
        Args: { p_match_id: string; p_target_user_id: string }
        Returns: MatchParticipant
      }
      rpc_reconcile_identity_guest_participants: {
        Args: Record<string, never>
        Returns: unknown
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
