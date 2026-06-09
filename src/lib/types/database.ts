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
export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'declined' | 'revoked'
export type SharedGroupJoinPreference =
  | 'auto_join_saved_players'
  | 'approval_required_all'
  | 'auto_join_enabled_sports'
  | 'auto_join_all'
export type MatchStatus = 'active' | 'cancelled' | 'archived'
export type MatchAdmissionMode = 'invite' | 'request'
export type MatchParticipantStatus = 'pending' | 'confirmed' | 'waiting_list' | 'removed'
export type MatchJoinMethod = 'invited' | 'requested' | 'nominated' | 'guest_add' | 'manual'
export type MatchDoublesFormat = 'open' | 'mens_doubles' | 'womens_doubles' | 'mixed_doubles'
export type MatchCourtPlanMode = 'secured' | 'walk_in' | 'self_book_later' | 'needs_help_booking'
export type MatchCourtStatus = 'open' | 'secured' | 'walk_in' | 'cancelled'
export type VenueKind = 'club' | 'park' | 'community_centre' | 'condo' | 'school' | 'private_facility'
export type VenueAccessType = 'public' | 'members' | 'private' | 'restricted'
export type VenueIndoorOutdoor = 'indoor' | 'outdoor' | 'indoor_outdoor'
export type VenueFacilityType = 'court_only' | 'full_facility'
export type VenueCostType = 'free' | 'paid'
export type VenueRelationshipType = 'member' | 'guest' | 'starred'
export type GearCollectionType = 'owned' | 'wishlist'
export type GearCategory = 'rackets' | 'shoes' | 'apparel' | 'strings' | 'accessories' | 'other'
export type GearImageKind = 'item' | 'setup_photo'
export type GearShowcaseSourceType = 'owned_item' | 'wishlist_item' | 'photo'
export type AvailabilityStatus = 'available' | 'busy' | 'away' | 'inactive'
export type DiscoveryVolume = 'quiet' | 'playerhood' | 'recommended'
export type LookupVisibility = 'none' | 'requestable' | 'visible'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

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
  gender: 'male' | 'female' | 'unspecified' | null
  level: string | null
  availability_status: AvailabilityStatus
  availability_note: string | null
  availability_until: string | null
  plays_singles: boolean
  plays_doubles: boolean
  primary_venue_id: string | null
  secondary_venue_ids: string[] | null
  is_super_admin: boolean
  created_at: string
  updated_at: string
  onboarding_profile_completed: boolean
  onboarding_completed: boolean
  age_confirmed_at: string | null
  age_confirmation_version: string | null
  terms_accepted_at: string | null
  terms_version: string | null
  privacy_accepted_at: string | null
  privacy_version: string | null
  responsible_use_accepted_at: string | null
  responsible_use_version: string | null
  /** v1.7: Preferred contact channel */
  contact_channel?: 'email' | 'sms'
  /** v1.7: Override email. NULL = use auth.users.email */
  contact_email?: string | null
  /** Canonical normalized form of the profile contact email. */
  profile_contact_email_normalized?: string | null
  /** Verified timestamp for the profile contact email. */
  profile_contact_email_verified_at?: string | null
  /** v1.7: Phone for SMS */
  contact_phone?: string | null
  /** Phase 1: Global master switch — show in Venue Members discovery */
  show_in_venue_member_discovery?: boolean
  /** Phase 1: Global master switch — allow direct invites from venue members */
  allow_non_group_invites?: boolean
  /** Shared Groups: whether group adds require approval or can auto-join by sport/global preference */
  shared_group_join_preference?: SharedGroupJoinPreference
  /** Shared profile layer: friendly openness signal for new games */
  looking_to_play?: string | null
  /** Shared profile layer: lightweight recurring time windows */
  preferred_play_times?: string[] | null
  /** Discovery: whether the user appears in city-based discovery */
  visible_in_city_discovery?: boolean
  /** Discovery: whether exact email/phone search may find this user */
  searchable_by_contact_info?: boolean
  /** Player Discovery Volume: quiet | playerhood | recommended */
  discovery_volume?: DiscoveryVolume
  /** Accept New Invites */
  accepting_new_invites?: boolean
}

export type UserBlock = {
  blocker_user_id: string
  blocked_user_id: string
  created_at: string
}

export type UserLookupVisibilityGrant = {
  viewer_user_id: string
  target_user_id: string
  grant_context: 'exact_contact_lookup' | 'same_public_venue_name_search' | 'same_public_club_name_search'
  visibility: 'requestable' | 'visible'
  created_at: string
  expires_at: string
}

export type UserPlayCity = {
  id: string
  user_id: string
  city_name: string
  region: string | null
  country: string
  created_at: string
}

export type LocationMunicipality = {
  id: string
  country_code: string
  country_name: string
  province_code: string
  province_name: string
  region_english: string
  upper_tier_county_district: string
  municipality_type: string
  city_municipality: string
  created_at: string
}

export type Venue = {
  id: string
  name: string
  abbreviation: string | null
  location_text: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  country: string | null
  website_url: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  venue_phone: string | null
  venue_email: string | null
  latitude: number | null
  longitude: number | null
  indoor_outdoor: VenueIndoorOutdoor | null
  facility_type: VenueFacilityType | null
  booking_required: boolean | null
  cost_type: VenueCostType | null
  supports_tennis: boolean
  supports_pickleball: boolean
  google_rating: number | null
  working_hours: Json | null
  google_maps_url: string | null
  google_place_id: string | null
  season: string | null
  has_lights: boolean | null
  has_washroom: boolean | null
  has_parking: boolean | null
  accessibility: string | null
  notes: string | null
  timezone: string
  venue_kind: VenueKind
  access_type: VenueAccessType
  created_at: string
}

export type VenueSport = {
  venue_id: string
  sport_id: number
  court_count: number
}

export type VenueAdmin = {
  id: string
  user_id: string
  venue_id: string
  granted_by: string
  granted_at: string
}

export type Court = {
  id: string
  venue_id: string
  sport_id: number
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
  venue_id: string | null
  open_to_club_members: boolean
  icon_key: string
  recommended_level_min: number | null
  recommended_level_max: number | null
}

export type GroupLocationKind = 'city' | 'venue'

export type GroupLocation = {
  id: string
  group_id: string
  location_kind: GroupLocationKind
  city_name: string | null
  region: string | null
  country: string | null
  venue_id: string | null
  is_primary: boolean
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
  // v1.5 Identity: group-scoped alias (priority: personal_remark > group_display_name > display_name)
  group_display_name: string | null
  source_contact_id?: string | null
  migrated_from_guest_id?: string | null
  source_person_id?: string | null
  contact_claim_id?: string | null
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
  venue_id: string | null
  court_ids: string[] | null  // deprecated: use match_courts table; kept until column dropped
  match_date: string | null
  start_time: string | null
  duration_minutes: number | null
  player_reminder_minutes: number | null
  game_type: string | null
  doubles_format: MatchDoublesFormat | null
  required_count: number
  invitation_scope_group_ids: string[] | null
  invitation_scope_user_ids: string[] | null
  can_participants_invite_users: boolean
  can_participants_add_guests: boolean  // legacy guest_add flag; canonical Contact Player nomination no longer uses it
  can_participants_manage_participants: boolean
  organizer_note: string | null
  court_plan_mode: MatchCourtPlanMode
  court_note: string | null
  required_court_count: number
  final_court_label: string | null
  finalized_by_user_id: string | null
  finalized_at: string | null
  formed_at: string | null
  formation_mode?: 'manual' | 'auto'
  formed_by_user_id?: string | null
  formation_source?: 'manual' | 'auto' | null
  auto_formation_rules?: Json
  start_at_utc: string | null
  created_at: string
  sport_id: number  // v1.6.3: FK sports; NOT NULL DEFAULT 1 (tennis)
  recurring_series_id: string | null
  recurring_instance_index: number | null
  lineup_snapshot: Json | null
}

export type RecurringMatchSeries = {
  id: string
  organizer_id: string
  name: string
  status: 'active' | 'paused' | 'archived'
  sport_id: number
  venue_id: string | null
  game_type: string | null
  doubles_format: MatchDoublesFormat | null
  required_count: number
  required_court_count: number
  match_weekday: number
  start_date: string
  start_time: string | null
  duration_minutes: number | null
  court_plan_mode: MatchCourtPlanMode
  organizer_note: string | null
  invitation_scope_group_ids: string[] | null
  invitation_scope_user_ids: string[] | null
  weeks_ahead_count: number
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

export type MatchCourtOfferStatus = 'proposed' | 'selected' | 'not_selected' | 'released'

export type MatchCourtOffer = {
  id: string
  match_id: string
  volunteer_user_id: string
  court_label: string
  note: string | null
  status: MatchCourtOfferStatus
  created_at: string
  updated_at: string
}

export type Guest = {
  id: string
  display_name: string
  notes: string | null
  email: string | null
  phone: string | null
  gender: 'male' | 'female' | 'unspecified'
  status: 'active' | 'inactive'
  availability_status: AvailabilityStatus
  availability_note: string | null
  availability_until: string | null
  created_by: string
  created_at: string
  person_id?: string | null
  claimed_by_user_id?: string | null
  claimed_at?: string | null
  contact_claim_id?: string | null
}

export type Person = {
  person_id: string
  person_type: 'registered_user' | 'limited_contact' | 'linked_hybrid'
  display_name: string
  avatar_url: string | null
  linked_user_id: string | null
  primary_sport_id: number | null
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export type ContactRecord = {
  contact_record_id: string
  owner_user_id: string
  person_id: string
  guest_id: string | null
  raw_name: string | null
  raw_phone: string | null
  raw_email: string | null
  owner_notes: string | null
  source: string
  archived_at: string | null
  archive_reason: string | null
  replaced_by_user_id: string | null
  created_at: string
}

export type PersonRelationship = {
  relationship_id: string
  actor_user_id: string | null
  person_id: string
  relationship_type: 'saved' | 'shared_match' | 'same_group' | 'group_contact' | 'direct_contact' | 'linked' | 'imported_by'
  source_group_id: string | null
  source_match_id: string | null
  created_at: string
}

export type PersonMatchProxy = {
  binding_id: string
  principal_person_id: string
  proxy_user_id: string
  scope: 'manage_match_participation'
  status: 'pending' | 'active' | 'rejected' | 'revoked' | 'expired'
  requested_by_user_id: string | null
  invited_via: string | null
  invited_to: string | null
  confirmed_at: string | null
  rejected_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type MatchGroupInvitation = {
  id: string
  match_id: string
  group_id: string
  invited_by_user_id: string
  status: 'active' | 'revoked'
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export type GroupContact = {
  group_contact_id: string
  group_id: string
  person_id: string
  membership_type: 'group_contact' | 'limited_group_member'
  created_by: string
  created_at: string
  removed_at: string | null
  migrated_to_user_id?: string | null
  migrated_at?: string | null
  contact_claim_id?: string | null
}

export type ContactClaim = {
  id: string
  guest_id: string | null
  person_id: string | null
  claimed_user_id: string
  source_review_decision_id: string | null
  old_display_name_snapshot: string | null
  claimed_user_display_name_snapshot: string | null
  claimed_at: string
  created_at: string
}

export type ContactClaimSuggestion = {
  id: string
  claim_id: string
  user_id: string
  suggested_user_id: string
  source_saved_contact: boolean
  source_shared_match: boolean
  saved_contact_at: string | null
  last_shared_match_at: string | null
  saved_at: string | null
  dismissed_at: string | null
  created_at: string
  updated_at: string
}

export type GroupJoinRequest = {
  id: string
  group_id: string
  sport_id: number | null
  requester_user_id: string
  target_user_id: string
  status: GroupJoinRequestStatus
  note: string | null
  group_name_snapshot: string
  sport_name_snapshot: string | null
  requester_display_name_snapshot: string | null
  created_at: string
  responded_at: string | null
  revoked_at: string | null
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

export type GearItem = {
  id: string
  owner_user_id: string
  collection_type: GearCollectionType
  category: GearCategory
  item_name: string
  gear_type: string | null
  current_status: string | null
  purchase_date: string | null
  purchase_price: number | null
  source_link: string | null
  source_price: number | null
  bought_from: string | null
  nickname: string | null
  notes: string | null
  metadata: Json
  recognition_confidence: string | null
  recognition_detected_text: string[] | null
  visible_in_showcase: boolean
  showcase_note: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type GearImage = {
  id: string
  owner_user_id: string
  gear_item_id: string | null
  image_kind: GearImageKind
  storage_path: string
  public_url: string
  cutout_storage_path: string | null
  cutout_public_url: string | null
  caption: string | null
  sort_order: number
  is_cover: boolean
  created_at: string
}

export type GearStringJob = {
  id: string
  owner_user_id: string
  gear_item_id: string
  strung_at: string
  string_name: string | null
  string_brand: string | null
  string_type: string | null
  string_shape: string | null
  gauge: string | null
  tension_mains: number | null
  tension_crosses: number | null
  strung_by: string | null
  cost: number | null
  first_impression: string | null
  follow_up_feel: string | null
  ended_at: string | null
  ended_reason: string | null
  created_at: string
  updated_at: string
}

export type GearShowcaseEntry = {
  id: string
  owner_user_id: string
  source_type: GearShowcaseSourceType
  gear_item_id: string | null
  gear_image_id: string | null
  is_visible: boolean
  pinned: boolean
  is_cover: boolean
  sort_order: number
  display_note: string | null
  created_at: string
  updated_at: string
}

export type UserSportProfile = {
  user_id: string
  sport_id: number
  level: string | null
  years_playing: number | null
  preferred_formats: string[] | null
  current_frequency: string | null
  play_style: string | null
  competition_experience: string | null
  teams_played_on: string | null
  line_played: string | null
  highlights: string | null
  gear_primary: string | null
  gear_secondary: string | null
  gear_shoes: string | null
  created_at: string
  updated_at: string
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
  participant_accepted_via: string | null  // 'in_app' | 'manual' | 'delegate_manual' | 'email_invitation' | 'sms_invitation' | 'proxy' | null
  manual_confirmed_by: string | null
  confirmation_source?: 'player_response' | 'host_managed_offline' | 'contact_owner_managed' | 'organizer_added' | 'system' | null
  confirmed_by_user_id?: string | null
  confirmed_by_host_id?: string | null
  confirmed_by_host_at?: string | null
  host_confirmed_at?: string | null
  confirmation_note?: string | null
  waiting_list_at: string | null
  source_contact_id?: string | null
  migrated_from_guest_id?: string | null
  source_person_id?: string | null
  contact_claim_id?: string | null
  replaced_by_participant_id?: string | null
  migrated_at?: string | null
  invite_notification_sent_at?: string | null
  confirmed_lineup_notification_sent_at?: string | null
  last_critical_update_notification_sent_at?: string | null
}

// View types
export type ProfileDisplay = {
  id: string
  display_name: string
  avatar_url?: string | null
}

export type UserVerifiedEmail = {
  user_id: string
  email_normalized: string
  email_type: 'auth' | 'profile_contact'
  verified_at: string
}

export type IdentityLinkCandidate = {
  guest_id: string
  person_id: string | null
  display_name: string
  guest_email: string | null
  matched_email_normalized: string
  matched_email_type: 'auth' | 'profile_contact' | 'auth_phone'
  guest_phone?: string | null
  matched_contact_normalized?: string | null
  matched_contact_type?: 'auth' | 'profile_contact' | 'auth_phone' | null
  match_participant_count: number
  contact_owner_count: number
  group_contact_count: number
  last_match_at: string | null
}

export type ContactClaimSuggestionCard = {
  suggestion_id: string
  suggested_user_id: string
  display_name: string | null
  avatar_url: string | null
  source_saved_contact: boolean
  source_shared_match: boolean
  venue_context: string | null
}

export type MatchFormed = {
  match_id: string
  required_count: number
  confirmed_count: number
  is_formed: boolean
  pending_count: number  // v1.5
  waiting_count: number
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

export type PublicMatchSignupLink = {
  id: string
  match_id: string
  public_token: string
  created_by: string
  enabled_at: string
  disabled_at: string | null
  created_at: string
  updated_at: string
}

export type PublicMatchSignupIdentity = {
  id: string
  email_sha256: string
  person_id: string
  guest_id: string
  created_at: string
  updated_at: string
  last_verified_at: string | null
}

export type PublicMatchSignup = {
  id: string
  link_id: string
  match_id: string
  identity_id: string | null
  person_id: string | null
  guest_id: string | null
  match_participant_id: string | null
  display_name: string
  email_normalized: string
  email_sha256: string
  phone_normalized: string | null
  marketing_email_opt_in: boolean
  marketing_email_opt_in_at: string | null
  match_notification_consent_at: string
  verification_token_hash: string
  verification_sent_at: string | null
  verification_delivery_status: 'not_requested' | 'queued' | 'sent' | 'failed' | 'skipped' | 'throttled'
  verification_delivery_attempt_count: number
  verification_delivery_last_attempt_at: string | null
  verification_delivery_sent_at: string | null
  verification_delivery_error: string | null
  verification_expires_at: string
  verified_at: string | null
  status: 'pending_verification' | 'participant_created' | 'participant_removed' | 'expired' | 'cancelled'
  created_at: string
  updated_at: string
}

export type PublicMatchSignupSmsIntent = {
  id: string
  link_id: string
  match_id: string
  display_name: string
  phone_normalized: string
  sms_token: string
  sms_token_hash: string
  match_notification_consent_at: string
  sms_sent_at: string | null
  sms_delivery_status: 'not_requested' | 'queued' | 'sent' | 'failed' | 'skipped' | 'throttled'
  sms_delivery_attempt_count: number
  sms_delivery_last_attempt_at: string | null
  sms_delivery_sent_at: string | null
  sms_delivery_error: string | null
  sms_response_at: string | null
  phone_confirmed_at: string | null
  status: 'pending_sms_response' | 'request_created' | 'declined_by_guest' | 'expired' | 'cancelled'
  person_id: string | null
  guest_id: string | null
  match_participant_id: string | null
  created_at: string
  updated_at: string
  expires_at: string
}

export type PublicMatchSignupConfig = {
  singleton_key: boolean
  system_actor_user_id: string
  created_at: string
  updated_at: string
}

export type MatchMessage = {
  id: string
  match_id: string
  author_user_id: string
  body: string
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export type GroupMessage = {
  id: string
  group_id: string
  author_user_id: string
  body: string
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

export type GroupResourceTag = 'Rules' | 'Fees' | 'Schedule' | 'Venue' | 'Photo' | 'Other'

export type GroupResource = {
  id: string
  group_id: string
  owner_user_id: string
  resource_type: 'file' | 'link'
  title: string
  tag: GroupResourceTag
  storage_bucket: string | null
  storage_path: string | null
  public_url: string | null
  link_url: string | null
  mime_type: string | null
  byte_size: number | null
  is_pinned: boolean
  pinned_at: string | null
  archived_at: string | null
  last_active_at: string
  related_match_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type Notification = {
  id: string
  recipient_user_id: string
  kind: string
  match_id: string | null
  match_participant_id: string | null
  actor_user_id: string | null
  note: string | null
  created_at: string
  read_at: string | null
  dedupe_key?: string | null
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

export type VenueAdminWithDetails = VenueAdmin & {
  profile?: ProfileDisplay | null
}

export type MatchSummary = Match & {
  organizer_name: string
  confirmed_count: number
  pending_count: number
  confirmed_names: string[]
  pending_names: string[]
}

// App-level venue membership shape used by UI panels.
export type VenueIdentity = {
  id: string
  venue_id: string
  user_id: string
  created_at: string
  /** Layer 2: Venue-scoped discovery override. NULL = no override (treat as true). */
  visible_in_venue_member_discovery?: boolean | null
  /** Layer 2: Venue-scoped non-group invite override. NULL = no override (treat as true). */
  accept_non_group_invites_in_venue?: boolean | null
}

export type VenueUserRelationship = {
  id: string
  venue_id: string
  user_id: string
  relationship_type: VenueRelationshipType
  visible_in_venue_member_discovery?: boolean | null
  created_at: string
  updated_at: string
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
      user_play_cities: {
        Row: UserPlayCity
        Insert: Partial<UserPlayCity> & { user_id: string; city_name: string; country: string }
        Update: Partial<UserPlayCity>
        Relationships: []
      }
      user_blocks: {
        Row: UserBlock
        Insert: Partial<UserBlock> & { blocker_user_id: string; blocked_user_id: string }
        Update: Partial<UserBlock>
        Relationships: []
      }
      user_lookup_visibility_grants: {
        Row: UserLookupVisibilityGrant
        Insert: Partial<UserLookupVisibilityGrant> & { viewer_user_id: string; target_user_id: string; grant_context: UserLookupVisibilityGrant['grant_context']; visibility: UserLookupVisibilityGrant['visibility'] }
        Update: Partial<UserLookupVisibilityGrant>
        Relationships: []
      }
      location_municipalities: {
        Row: LocationMunicipality
        Insert: Partial<LocationMunicipality> & {
          country_code: string
          country_name: string
          province_code: string
          province_name: string
          region_english: string
          upper_tier_county_district: string
          municipality_type: string
          city_municipality: string
        }
        Update: Partial<LocationMunicipality>
        Relationships: []
      }
      venues: {
        Row: Venue
        Insert: Partial<Venue>
        Update: Partial<Venue>
        Relationships: []
      }
      venue_sports: {
        Row: VenueSport
        Insert: Partial<VenueSport> & { venue_id: string; sport_id: number }
        Update: Partial<VenueSport>
        Relationships: []
      }
      venue_admins: {
        Row: VenueAdmin
        Insert: Partial<VenueAdmin> & { user_id: string; venue_id: string; granted_by: string }
        Update: Partial<VenueAdmin>
        Relationships: []
      }
      venue_identities: {
        Row: VenueIdentity
        Insert: Partial<VenueIdentity> & { venue_id: string; user_id: string }
        Update: Partial<VenueIdentity>
        Relationships: []
      }
      venue_user_relationships: {
        Row: VenueUserRelationship
        Insert: Partial<VenueUserRelationship> & {
          venue_id: string
          user_id: string
          relationship_type: VenueRelationshipType
        }
        Update: Partial<VenueUserRelationship>
        Relationships: []
      }
      courts: {
        Row: Court
        Insert: Partial<Court> & { venue_id: string; sport_id: number; court_code: string }
        Update: Partial<Court>
        Relationships: []
      }
      groups: {
        Row: Group
        Insert: Partial<Group> & { name: string; boundary_keeper_id: string }
        Update: Partial<Group>
        Relationships: []
      }
      group_locations: {
        Row: GroupLocation
        Insert: Partial<GroupLocation> & { group_id: string; location_kind: GroupLocationKind }
        Update: Partial<GroupLocation>
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
      recurring_match_series: {
        Row: RecurringMatchSeries
        Insert: Partial<RecurringMatchSeries> & { organizer_id: string; name: string; sport_id: number; match_weekday: number; start_date: string }
        Update: Partial<RecurringMatchSeries>
        Relationships: []
      }
      match_courts: {
        Row: MatchCourt
        Insert: Partial<MatchCourt> & { match_id: string; slot_index: number; court_label: string; created_by: string }
        Update: Partial<MatchCourt>
        Relationships: []
      }
      match_court_offers: {
        Row: MatchCourtOffer
        Insert: Partial<MatchCourtOffer> & { match_id: string; volunteer_user_id: string; court_label: string }
        Update: Partial<MatchCourtOffer>
        Relationships: []
      }
      gear_items: {
        Row: GearItem
        Insert: Partial<GearItem> & { owner_user_id: string; collection_type: GearCollectionType; category: GearCategory; item_name: string }
        Update: Partial<GearItem>
        Relationships: []
      }
      gear_images: {
        Row: GearImage
        Insert: Partial<GearImage> & { owner_user_id: string; storage_path: string; public_url: string }
        Update: Partial<GearImage>
        Relationships: []
      }
      gear_string_jobs: {
        Row: GearStringJob
        Insert: Partial<GearStringJob> & { owner_user_id: string; gear_item_id: string; strung_at: string }
        Update: Partial<GearStringJob>
        Relationships: []
      }
      gear_showcase_entries: {
        Row: GearShowcaseEntry
        Insert: Partial<GearShowcaseEntry> & { owner_user_id: string; source_type: GearShowcaseSourceType }
        Update: Partial<GearShowcaseEntry>
        Relationships: []
      }
      people: {
        Row: Person
        Insert: Partial<Person> & { display_name: string }
        Update: Partial<Person>
        Relationships: []
      }
      contact_records: {
        Row: ContactRecord
        Insert: Partial<ContactRecord> & { owner_user_id: string; person_id: string }
        Update: Partial<ContactRecord>
        Relationships: []
      }
      contact_claims: {
        Row: ContactClaim
        Insert: Partial<ContactClaim> & { claimed_user_id: string }
        Update: Partial<ContactClaim>
        Relationships: []
      }
      contact_claim_suggestions: {
        Row: ContactClaimSuggestion
        Insert: Partial<ContactClaimSuggestion> & { claim_id: string; user_id: string; suggested_user_id: string }
        Update: Partial<ContactClaimSuggestion>
        Relationships: []
      }
      person_relationships: {
        Row: PersonRelationship
        Insert: Partial<PersonRelationship> & { person_id: string; relationship_type: PersonRelationship['relationship_type'] }
        Update: Partial<PersonRelationship>
        Relationships: []
      }
      person_match_proxies: {
        Row: PersonMatchProxy
        Insert: Partial<PersonMatchProxy> & { principal_person_id: string; proxy_user_id: string }
        Update: Partial<PersonMatchProxy>
        Relationships: []
      }
      match_group_invitations: {
        Row: MatchGroupInvitation
        Insert: Partial<MatchGroupInvitation> & { match_id: string; group_id: string; invited_by_user_id: string }
        Update: Partial<MatchGroupInvitation>
        Relationships: []
      }
      group_contacts: {
        Row: GroupContact
        Insert: Partial<GroupContact> & { group_id: string; person_id: string; created_by: string }
        Update: Partial<GroupContact>
        Relationships: []
      }
      group_join_requests: {
        Row: GroupJoinRequest
        Insert: Partial<GroupJoinRequest> & { group_id: string; requester_user_id: string; target_user_id: string; status: GroupJoinRequestStatus; group_name_snapshot: string }
        Update: Partial<GroupJoinRequest>
        Relationships: []
      }
      group_messages: {
        Row: GroupMessage
        Insert: Partial<GroupMessage> & { group_id: string; author_user_id: string; body: string }
        Update: Partial<GroupMessage>
        Relationships: []
      }
      group_resources: {
        Row: GroupResource
        Insert: Partial<GroupResource> & { group_id: string; owner_user_id: string; resource_type: 'file' | 'link'; title: string; tag: GroupResourceTag }
        Update: Partial<GroupResource>
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
      public_match_signup_links: {
        Row: PublicMatchSignupLink
        Insert: Partial<PublicMatchSignupLink> & { match_id: string; created_by: string }
        Update: Partial<PublicMatchSignupLink>
        Relationships: []
      }
      public_match_signup_identities: {
        Row: PublicMatchSignupIdentity
        Insert: Partial<PublicMatchSignupIdentity> & { email_sha256: string; person_id: string; guest_id: string }
        Update: Partial<PublicMatchSignupIdentity>
        Relationships: []
      }
      public_match_signup_config: {
        Row: PublicMatchSignupConfig
        Insert: Partial<PublicMatchSignupConfig> & { system_actor_user_id: string }
        Update: Partial<PublicMatchSignupConfig>
        Relationships: []
      }
      public_match_signups: {
        Row: PublicMatchSignup
        Insert: Partial<PublicMatchSignup> & { link_id: string; match_id: string; display_name: string; email_normalized: string; email_sha256: string; verification_token_hash: string; verification_expires_at: string }
        Update: Partial<PublicMatchSignup>
        Relationships: []
      }
      public_match_signup_sms_intents: {
        Row: PublicMatchSignupSmsIntent
        Insert: Partial<PublicMatchSignupSmsIntent> & { link_id: string; match_id: string; display_name: string; phone_normalized: string; sms_token_hash: string }
        Update: Partial<PublicMatchSignupSmsIntent>
        Relationships: []
      }
      match_messages: {
        Row: MatchMessage
        Insert: Partial<MatchMessage> & { match_id: string; author_user_id: string; body: string }
        Update: Partial<MatchMessage>
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: Partial<Notification> & { recipient_user_id: string; kind: string }
        Update: Partial<Notification>
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
      user_sport_profiles: {
        Row: UserSportProfile
        Insert: Partial<UserSportProfile> & { user_id: string; sport_id: number }
        Update: Partial<UserSportProfile>
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
      v_user_verified_emails: {
        Row: UserVerifiedEmail
        Relationships: []
      }
      contact_player_public: {
        Row: {
          guest_id: string
          person_id: string | null
          display_name: string
          avatar_url: string | null
          primary_sport_id: number | null
        }
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
          p_show_in_venue_member_discovery?: boolean | null
          p_allow_non_group_invites?: boolean | null
          p_shared_group_join_preference?: SharedGroupJoinPreference | null
          p_looking_to_play?: string | null
          p_preferred_play_times?: string[] | null
          p_gender?: string | null
          p_availability_status?: AvailabilityStatus | null
          p_availability_note?: string | null
          p_availability_until?: string | null
          p_visible_in_city_discovery?: boolean | null
          p_searchable_by_contact_info?: boolean | null
        }
        Returns: void
      }
      rpc_profile_update_discovery_preferences: {
        Args: {
          p_discovery_volume?: DiscoveryVolume | null
          p_accepting_new_invites?: boolean | null
        }
        Returns: void
      }
      get_lookup_visibility: {
        Args: { p_viewer_user_id: string; p_target_user_id: string; p_context?: string | null }
        Returns: LookupVisibility
      }
      has_lookup_visibility_grant: {
        Args: {
          p_viewer_user_id: string
          p_target_user_id: string
          p_context: string
          p_visibility?: 'requestable' | 'visible' | null
        }
        Returns: boolean
      }
      can_view_basic_profile: {
        Args: { p_viewer_user_id: string; p_target_user_id: string; p_context?: string | null }
        Returns: boolean
      }
      can_request_add: {
        Args: { p_viewer_user_id: string; p_target_user_id: string; p_context?: string | null }
        Returns: boolean
      }
      can_direct_add: {
        Args: { p_viewer_user_id: string; p_target_user_id: string; p_context?: string | null }
        Returns: boolean
      }
      can_invite_user: {
        Args: {
          p_viewer_user_id: string
          p_target_user_id: string
          p_match_id?: string | null
          p_context?: string | null
        }
        Returns: boolean
      }
      can_recommend_user: {
        Args: { p_viewer_user_id: string; p_target_user_id: string }
        Returns: boolean
      }
      rpc_user_play_cities_replace: {
        Args: { p_cities?: Json | null }
        Returns: void
      }
      location_municipality_exists: {
        Args: {
          p_city_name: string
          p_region?: string | null
          p_country?: string | null
        }
        Returns: boolean
      }
      rpc_complete_first_onboarding: {
        Args: {
          p_display_name: string
          p_sport_ids: number[]
          p_play_cities?: Json | null
          p_venue_ids?: string[] | null
          p_visible_in_city_discovery?: boolean | null
          p_visible_in_club_member_discovery?: boolean | null
        }
        Returns: Json
      }
      rpc_city_players_discovery: {
        Args: { p_city: string; p_search?: string | null }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          shared_city_names: string[] | null
          is_saved: boolean
        }[]
      }
      rpc_player_search_by_contact_info: {
        Args: { p_query: string }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          primary_sport: string | null
          visibility: LookupVisibility
          is_saved: boolean
          can_add: boolean
          can_request_add: boolean
          can_invite: boolean
          request_status: string | null
          next_eligible_at: string | null
        }[]
      }
      rpc_user_save_request_create: {
        Args: { p_target_user_id: string; p_source?: string | null }
        Returns: {
          request_id: string | null
          status: string
          next_eligible_at: string | null
        }[]
      }
      rpc_user_save_request_list: {
        Args: Record<string, never>
        Returns: {
          request_id: string
          requester_user_id: string
          requester_display_name: string
          requester_avatar_url: string | null
          status: string
          created_at: string
        }[]
      }
      rpc_user_save_request_respond: {
        Args: { p_request_id: string; p_allow: boolean }
        Returns: Json
      }
      rpc_group_add_member: {
        Args: { p_group_id: string; p_target_user_id: string; p_note?: string | null }
        Returns: {
          result: 'already_member' | 'already_pending' | 'direct_add_success' | 'approval_required_request_created' | 'not_allowed'
          group_id: string
          target_user_id: string
          request_id: string | null
          message: string
        }[]
      }
      rpc_group_join_request_accept: {
        Args: { p_request_id: string }
        Returns: GroupJoinRequest
      }
      rpc_group_join_request_decline: {
        Args: { p_request_id: string }
        Returns: GroupJoinRequest
      }
      rpc_group_join_request_revoke: {
        Args: { p_request_id: string }
        Returns: GroupJoinRequest
      }
      rpc_group_join_requests_for_user: {
        Args: Record<string, never>
        Returns: {
          id: string
          group_id: string
          group_name_snapshot: string
          sport_id: number | null
          sport_name_snapshot: string | null
          requester_user_id: string
          requester_display_name_snapshot: string | null
          created_at: string
          note: string | null
          status: GroupJoinRequestStatus
        }[]
      }
      rpc_user_sport_profile_upsert: {
        Args: {
          p_sport_id: number
          p_level?: string | null
          p_years_playing?: number | null
          p_preferred_formats?: string[] | null
          p_current_frequency?: string | null
          p_play_style?: string | null
          p_competition_experience?: string | null
          p_teams_played_on?: string | null
          p_line_played?: string | null
          p_highlights?: string | null
          p_gear_primary?: string | null
          p_gear_secondary?: string | null
          p_gear_shoes?: string | null
        }
        Returns: void
      }
      rpc_player_profile_get: {
        Args: { p_target_user_id: string; p_context?: string | null }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          gender: 'male' | 'female' | 'unspecified' | null
          looking_to_play: string | null
          preferred_play_times: string[] | null
          sport_profiles: unknown
          shared_venue_names: string[] | null
          shared_group_names: string[] | null
          shared_match_count: number | null
        }[]
      }
      rpc_venue_identity_set_preferences: {
        Args: {
          p_venue_id: string
          p_visible_in_venue_member_discovery?: string | null
          p_accept_non_group_invites_in_venue?: string | null
        }
        Returns: void
      }
      rpc_venue_relationship_set_member_discovery: {
        Args: {
          p_venue_id: string
          p_visible_in_venue_member_discovery: boolean
        }
        Returns: void
      }
      // v1.5 Identity: direct display_name setter (venue handle deprecated as sync path)
      rpc_profile_set_display_name: {
        Args: { p_display_name: string }
        Returns: void
      }
      // v1.8: Set avatar URL from storage upload
      rpc_profile_set_avatar_url: {
        Args: { p_avatar_url: string }
        Returns: void
      }
      rpc_venue_member_join_v2: {
        Args: { p_venue_id: string }
        Returns: void
      }
      rpc_venue_member_leave_v2: {
        Args: { p_venue_id: string }
        Returns: void
      }
      rpc_profile_set_primary_venue: {
        Args: { p_venue_id: string }
        Returns: void
      }
      rpc_venue_relationship_set: {
        Args: { p_venue_id: string; p_relationship_type: VenueRelationshipType }
        Returns: VenueUserRelationship
      }
      rpc_venue_relationship_remove: {
        Args: { p_venue_id: string; p_relationship_type: VenueRelationshipType }
        Returns: boolean
      }
      rpc_venue_people_discovery_v2: {
        Args: { p_venue_id: string; p_search?: string | null }
        Returns: {
          user_id: string
          display_name: string | null
          avatar_url: string | null
          relationship_type: VenueRelationshipType
        }[]
      }
      is_venue_admin: {
        Args: { p_venue_id: string }
        Returns: boolean
      }
      rpc_admin_user_search: {
        Args: { p_query: string }
        Returns: AdminUserSearchResult[]
      }
      rpc_venue_admin_grant: {
        Args: { p_user_id: string; p_venue_id: string }
        Returns: void
      }
      rpc_venue_admin_revoke: {
        Args: { p_user_id: string; p_venue_id: string }
        Returns: void
      }
      rpc_venue_create: {
        Args: {
          p_name: string
          p_abbreviation?: string | null
          p_location_text?: string | null
          p_city?: string | null
          p_province?: string | null
          p_postal_code?: string | null
          p_country?: string | null
          p_website_url?: string | null
          p_contact_name?: string | null
          p_contact_phone?: string | null
          p_contact_email?: string | null
          p_venue_phone?: string | null
          p_venue_email?: string | null
          p_latitude?: number | null
          p_longitude?: number | null
          p_indoor_outdoor?: VenueIndoorOutdoor | null
          p_facility_type?: VenueFacilityType | null
          p_booking_required?: boolean | null
          p_cost_type?: VenueCostType | null
          p_supports_tennis?: boolean | null
          p_supports_pickleball?: boolean | null
          p_timezone?: string
          p_notes?: string | null
          p_venue_kind?: VenueKind
          p_access_type?: VenueAccessType
        }
        Returns: Venue
      }
      rpc_venue_update: {
        Args: {
          p_venue_id: string
          p_name?: string | null
          p_abbreviation?: string | null
          p_location_text?: string | null
          p_city?: string | null
          p_province?: string | null
          p_postal_code?: string | null
          p_country?: string | null
          p_website_url?: string | null
          p_contact_name?: string | null
          p_contact_phone?: string | null
          p_contact_email?: string | null
          p_venue_phone?: string | null
          p_venue_email?: string | null
          p_latitude?: number | null
          p_longitude?: number | null
          p_indoor_outdoor?: VenueIndoorOutdoor | null
          p_facility_type?: VenueFacilityType | null
          p_booking_required?: boolean | null
          p_cost_type?: VenueCostType | null
          p_supports_tennis?: boolean | null
          p_supports_pickleball?: boolean | null
          p_timezone?: string | null
          p_notes?: string | null
          p_venue_kind?: VenueKind | null
          p_access_type?: VenueAccessType | null
        }
        Returns: void
      }
      rpc_court_create: {
        Args: { p_venue_id: string; p_sport_id: number; p_court_code: string; p_surface?: string | null; p_notes?: string | null }
        Returns: Court
      }
      rpc_court_update: {
        Args: { p_court_id: string; p_sport_id?: number | null; p_court_code?: string | null; p_surface?: string | null; p_notes?: string | null }
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
        Args: {
          p_name: string
          p_description?: string | null
          p_primary_sport_id?: number | null
          p_icon_key?: string | null
          p_venue_id?: string | null
          p_recommended_level_min?: number | null
          p_recommended_level_max?: number | null
        }
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
        Args: {
          p_group_id: string
          p_name: string
          p_description?: string | null
          p_primary_sport_id?: number | null
          p_open_to_club_members?: boolean | null
          p_icon_key?: string | null
          p_venue_id?: string | null
          p_recommended_level_min?: number | null
          p_recommended_level_max?: number | null
        }
        Returns: void
      }
      rpc_group_locations_replace: {
        Args: {
          p_group_id: string
          p_locations: Json
        }
        Returns: GroupLocation[]
      }
      group_matches_user_play_locations: {
        Args: {
          p_group_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      rpc_recurring_match_series_create: {
        Args: {
          p_name: string
          p_sport_id: number
          p_venue_id?: string | null
          p_game_type?: string | null
          p_doubles_format?: string | null
          p_required_count?: number
          p_required_court_count?: number
          p_start_date?: string | null
          p_start_time?: string | null
          p_duration_minutes?: number | null
          p_court_plan_mode?: string | null
          p_organizer_note?: string | null
          p_invitation_scope_group_ids?: string[] | null
          p_invitation_scope_user_ids?: string[] | null
          p_weeks_ahead_count?: number
        }
        Returns: RecurringMatchSeries
      }
      rpc_match_create: {
        Args: {
          p_required_count?: number
          p_game_type?: string
          p_match_date?: string | null
          p_start_time?: string | null
          p_duration_minutes?: number | null
          p_venue_id?: string | null
          p_invitation_scope_group_ids?: string[] | null
          p_invitation_scope_user_ids?: string[] | null
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
        Args: { p_match_participant_id: string; p_note?: string | null }
        Returns: MatchParticipant
      }
      rpc_public_match_signup_link_get_or_create: {
        Args: { p_match_id: string }
        Returns: {
          link_id: string
          match_id: string
          public_token: string
          enabled_at: string
          disabled_at: string | null
        }[]
      }
      rpc_public_match_registered_request_join: {
        Args: { p_public_token: string }
        Returns: MatchParticipant
      }
      rpc_public_match_signup_context: {
        Args: { p_public_token: string }
        Returns: {
          match_id: string
          signup_open: boolean
          match_status: string
          host_display_name: string
          game_type: string | null
          sport_name: string | null
          match_date: string | null
          start_time: string | null
          venue_name: string | null
          venue_timezone: string | null
        }[]
      }
      rpc_public_match_signup_start: {
        Args: {
          p_public_token: string
          p_display_name: string
          p_email: string
          p_phone?: string | null
          p_marketing_email_opt_in?: boolean | null
        }
        Returns: {
          signup_id: string
          status: string
          verification_required: boolean
          verification_token: string | null
          email_normalized: string | null
          recipient_name: string | null
          match_id: string
          game_type: string | null
          sport_name: string | null
          match_date: string | null
          start_time: string | null
          venue_name: string | null
        }[]
      }
      rpc_public_match_signup_start_sms: {
        Args: {
          p_public_token: string
          p_display_name: string
          p_phone: string
        }
        Returns: {
          sms_intent_id: string | null
          status: string
          sms_send_required: boolean
          sms_token: string | null
          phone_normalized: string | null
          recipient_name: string | null
          match_id: string
          game_type: string | null
          sport_name: string | null
          match_date: string | null
          start_time: string | null
          venue_name: string | null
          host_display_name: string | null
        }[]
      }
      rpc_public_match_signup_record_sms_delivery_result: {
        Args: {
          p_sms_intent_id: string
          p_delivery_status: 'sent' | 'failed' | 'skipped'
          p_error?: string | null
        }
        Returns: void
      }
      rpc_public_match_signup_sms_context: {
        Args: { p_sms_token: string }
        Returns: {
          sms_intent_id: string
          status: 'pending_sms_response' | 'request_created' | 'declined_by_guest' | 'expired' | 'cancelled'
          display_name: string
          match_id: string
          match_status: string
          game_type: string | null
          sport_name: string | null
          match_date: string | null
          start_time: string | null
          venue_name: string | null
          venue_timezone: string | null
          host_display_name: string | null
          expires_at: string
          match_participant_id: string | null
        }[]
      }
      rpc_public_match_signup_confirm_sms: {
        Args: { p_sms_token: string }
        Returns: {
          status: string
          match_id: string
          match_participant_id: string | null
          participant_status: string | null
          display_name: string
        }[]
      }
      rpc_public_match_signup_decline_sms: {
        Args: { p_sms_token: string }
        Returns: {
          status: string
          match_id: string
          match_participant_id: string | null
          participant_status: string | null
          display_name: string
        }[]
      }
      rpc_public_match_signup_record_delivery_result: {
        Args: {
          p_signup_id: string
          p_delivery_status: 'sent' | 'failed' | 'skipped'
          p_error?: string | null
        }
        Returns: void
      }
      rpc_public_match_signup_verify: {
        Args: {
          p_public_token: string
          p_signup_id: string
          p_verification_token: string
        }
        Returns: {
          status: string
          match_id: string
          match_participant_id: string
          participant_status: string
          display_name: string
        }[]
      }
      rpc_public_match_signup_participant_metadata: {
        Args: { p_match_id: string }
        Returns: {
          match_participant_id: string
          match_id: string
          source: 'public_match_signup'
          email_verified: boolean
          signup_status: string
          phone_confirmed?: boolean
          contact_state?: string | null
        }[]
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
      // v1.6.2-lite: Roster guest RPCs
      rpc_roster_guest_create: {
        Args: {
          p_display_name: string
          p_email?: string | null
          p_phone?: string | null
          p_notes?: string | null
          p_gender?: 'male' | 'female' | 'unspecified' | null
          p_availability_status?: AvailabilityStatus | null
          p_availability_note?: string | null
          p_availability_until?: string | null
        }
        Returns: Guest
      }
      rpc_roster_guest_update: {
        Args: {
          p_guest_id: string
          p_display_name: string
          p_email?: string | null
          p_phone?: string | null
          p_notes?: string | null
          p_gender?: 'male' | 'female' | 'unspecified' | null
          p_availability_status?: AvailabilityStatus | null
          p_availability_note?: string | null
          p_availability_until?: string | null
        }
        Returns: Guest
      }
      rpc_roster_guest_list: {
        Args: Record<string, never>
        Returns: Guest[]
      }
      rpc_contact_player_resolution: {
        Args: Record<string, never>
        Returns: {
          guest_id: string
          display_name: string
          email: string | null
          phone: string | null
          notes: string | null
          gender: 'male' | 'female' | 'unspecified' | null
          availability_status: AvailabilityStatus | null
          availability_note: string | null
          availability_until: string | null
          linked_user_id: string | null
          resolution_state: string
        }[]
      }
      rpc_roster_guest_contact_links: {
        Args: { p_guest_ids: string[] }
        Returns: { guest_id: string; user_id: string }[]
      }
      rpc_match_proxy_request_self: {
        Args: { p_proxy_user_id: string }
        Returns: PersonMatchProxy
      }
      rpc_match_proxy_revoke_self: {
        Args: { p_binding_id: string }
        Returns: PersonMatchProxy
      }
      rpc_match_proxy_request_contact_player: {
        Args: { p_guest_id: string }
        Returns: PersonMatchProxy
      }
      rpc_match_proxy_dashboard: {
        Args: Record<string, never>
        Returns: {
          binding_id: string
          principal_person_id: string
          proxy_user_id: string
          scope: string
          status: string
          requested_by_user_id: string | null
          invited_via: string | null
          invited_to: string | null
          confirmed_at: string | null
          rejected_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
          principal_name: string
          principal_linked_user_id: string | null
          proxy_name: string
          relationship_role: string
          can_approve: boolean
          can_decline: boolean
          can_revoke: boolean
        }[]
      }
      rpc_match_proxy_approve_binding: {
        Args: { p_binding_id: string }
        Returns: PersonMatchProxy
      }
      rpc_match_proxy_decline_binding: {
        Args: { p_binding_id: string }
        Returns: PersonMatchProxy
      }
      rpc_match_proxy_confirm_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      rpc_match_proxy_manageable_participants: {
        Args: { p_match_id: string }
        Returns: { match_participant_id: string }[]
      }
      rpc_match_proxy_withdraw_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      rpc_match_proxy_decline_participant: {
        Args: { p_match_participant_id: string }
        Returns: MatchParticipant
      }
      rpc_group_add_contact_player: {
        Args: { p_group_id: string; p_guest_id: string }
        Returns: GroupContact
      }
      rpc_group_contact_list: {
        Args: { p_group_id: string }
        Returns: { group_contact_id: string; guest_id: string; person_id: string; display_name: string; avatar_url: string | null; membership_type: string; created_by: string; created_at: string }[]
      }
      rpc_group_contact_list_v2: {
        Args: { p_group_id: string }
        Returns: { group_contact_id: string; guest_id: string; person_id: string; display_name: string; avatar_url: string | null; linked_user_id: string | null; membership_type: string; created_by: string; created_at: string }[]
      }
      rpc_group_resources_archive_stale: {
        Args: { p_group_id: string }
        Returns: number
      }
      rpc_contact_player_save: {
        Args: { p_guest_id: string; p_source?: string; p_group_id?: string | null; p_match_id?: string | null }
        Returns: PersonRelationship
      }
      rpc_contact_player_lookup: {
        Args: { p_guest_ids: string[] }
        Returns: { guest_id: string; person_id: string | null; display_name: string; avatar_url: string | null; primary_sport_id: number | null }[]
      }
      rpc_contact_player_lookup_v2: {
        Args: { p_guest_ids: string[] }
        Returns: { guest_id: string; person_id: string | null; display_name: string; avatar_url: string | null; primary_sport_id: number | null; linked_user_id: string | null }[]
      }
      rpc_my_verified_emails: {
        Args: Record<string, never>
        Returns: UserVerifiedEmail[]
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
      rpc_venue_members_discovery: {
        Args: { p_venue_id: string; p_search?: string | null }
        Returns: { user_id: string; display_name: string | null; avatar_url: string | null }[]
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
        Returns: { target_kind: string; target_id: string; display_name: string | null; avatar_url: string | null; source: string; action_kind: string; can_admit: boolean; eligible_via: string | null; sort_name: string | null }[]
      }
      rpc_match_invite_group: {
        Args: { p_match_id: string; p_group_id: string }
        Returns: { group_id: string; group_name: string; status: string; created_at: string }[]
      }
      rpc_match_group_invitations: {
        Args: { p_match_id: string }
        Returns: { group_id: string; group_name: string; status: string; created_at: string; member_count: number }[]
      }
      rpc_match_my_group_invites: {
        Args: { p_match_id: string }
        Returns: { group_id: string; group_name: string; created_at: string }[]
      }
      rpc_match_accept_group_invite: {
        Args: { p_match_id: string }
        Returns: MatchParticipant
      }
      rpc_match_revoke_group_invite: {
        Args: { p_match_id: string; p_group_id: string }
        Returns: { group_id: string; group_name: string; status: string; created_at: string; revoked_at: string | null }[]
      }
      rpc_match_admit_user: {
        Args: { p_match_id: string; p_target_user_id: string }
        Returns: MatchParticipant
      }
      rpc_reconcile_identity_guest_participants: {
        Args: Record<string, never>
        Returns: unknown
      }
      rpc_identity_link_candidates: {
        Args: Record<string, never>
        Returns: IdentityLinkCandidate[]
      }
      rpc_identity_link_accept: {
        Args: { p_guest_id: string }
        Returns: Json
      }
      rpc_identity_link_keep_separate: {
        Args: { p_guest_id: string }
        Returns: void
      }
      rpc_contact_claim_suggestions_for_user: {
        Args: Record<string, never>
        Returns: ContactClaimSuggestionCard[]
      }
      rpc_contact_claim_suggestion_save: {
        Args: { p_suggestion_id: string }
        Returns: Json
      }
      rpc_contact_claim_suggestions_dismiss: {
        Args: Record<string, never>
        Returns: Json
      }
      rpc_complete_onboarding_legal_agreement: {
        Args: {
          p_age_confirmation_version: string
          p_terms_version: string
          p_privacy_version: string
          p_responsible_use_version: string
        }
        Returns: Json
      }
      rpc_complete_onboarding_next_step: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
