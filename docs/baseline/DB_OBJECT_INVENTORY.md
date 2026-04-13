# DB Object Inventory (Freeze: 03522d7)

## Inventory Scope

Source: `supabase/baseline/BASELINE_SCHEMA.sql` and baseline security layer.

This inventory is a frozen baseline-cutover inventory, not a current runtime inventory.
For the current runtime object graph, use `schema.sql` together with active append-only migrations in `supabase/migrations/`.

## Summary Counts

- Extensions: 6
- Enums/custom types: 5
- Tables: 14
- Views: 4
- Functions/RPC/helper functions: 74
- Triggers: 6
- Policies: 44

## Tables (Public)

- `clubs`
- `courts`
- `group_members`
- `groups`
- `match_participants`
- `matches`
- `guests`
- `club_admins`
- `club_identities`
- `match_courts`
- `match_participant_actions`
- `profiles`
- `user_personal_remarks`
- `user_roster_guests`

## Types

- `group_member_status`
- `match_admission_mode`
- `match_join_method`
- `match_participant_status`
- `match_status`

## Views

- `match_counts`
- `match_formed`
- `profile_display`
- `v_group_member_display`

## Triggers

- `set_formed_at_once_on_mp`
- `set_updated_at__user_personal_remarks`
- `trg_compute_match_start_at_utc`
- `trg_guard_participant_state`
- `trg_match_detail_change_reconfirm`
- `trg_set_removed_at_from_status`

## Object Lifecycle Classification (Key Objects)

### ACTIVE

- `rpc_email_invitation_create`
- `rpc_email_invitation_get`
- `rpc_email_invitation_accept_as_guest`
- `rpc_email_invitation_decline_as_guest`
- `apply_participant_exit`
- `match_participant_reconcile_status`

### LEGACY

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`

### RETIRED

- `rpc_email_invitation_update_flow_status` (retired through cleanup migration)

### DROP CANDIDATE

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

### EXCLUDED FROM BASELINE-FIRST DESIGN SOURCE

- Historical migration intent superseded by post-freeze semantics; see `MIGRATION_STATUS_INDEX.md`

## Required Seed/Config Objects

- System actor profile row for guest decline audit path:
  - seeded in `supabase/baseline/BASELINE_REQUIRED_SEED.sql`
  - must align with env `GUEST_INVITATION_SYSTEM_ACTOR_ID`
