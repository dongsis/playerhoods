Database Facts: Functions — Index (public)
## Match / Participants RPCs

**Flows & scope (invite, nominate, confirm, accept, remove):** see `docs/specs/Match_Participation_Flows_and_Scope.md`.

public.rpc_match_create(p_required_count integer, p_game_type text, p_match_date date, p_start_time time without time zone, p_duration_minutes integer, p_club_id uuid, p_court_ids uuid[], p_invitation_scope_group_ids uuid[], p_can_participants_invite_users boolean, p_can_participants_add_guests boolean, p_can_participants_manage_participants boolean) -> returns matches | SECURITY DEFINER | plpgsql

public.rpc_match_accept_invite(p_match_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_request_join(p_match_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_user_withdraw(p_match_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_manual_confirm(p_match_participant_id uuid, p_note text) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_org_approve_participant(p_match_participant_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_remove_participant(p_match_participant_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_invite_guest_from_roster(p_match_id uuid, p_guest_id uuid) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_add_guest_org(p_match_id uuid, p_guest_display_name text, p_guest_notes text) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_add_guest_org(p_match_id uuid, p_guest_display_name text, p_guest_notes text, p_note text) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text) -> returns match_participants | SECURITY DEFINER | plpgsql

public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text, p_note text) -> returns match_participants | SECURITY DEFINER | plpgsql

## Targets RPCs

public.rpc_match_admission_targets(p_match_id uuid, p_search text) -> returns TABLE(user_id, display_name, avatar_url, club_handle, source, eligible, eligible_via, sort_name) | SECURITY DEFINER | plpgsql

public.rpc_match_delegate_manual_confirm_targets(p_match_id uuid) -> returns TABLE(user_id uuid, display_name text) | SECURITY DEFINER | plpgsql

## Group RPCs

public.rpc_group_create(p_name text, p_description text) -> returns groups | SECURITY DEFINER | plpgsql

public.rpc_group_invite_user(p_group_id uuid, p_user_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_group_accept_invite(p_group_id uuid) -> returns group_members | SECURITY DEFINER | plpgsql

public.rpc_group_leave(p_group_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_group_set_display_name(p_group_id uuid, p_display_name text) -> returns void | SECURITY DEFINER | plpgsql

## Club / Court RPCs

public.rpc_club_create(p_name text, p_location_text text, p_timezone text, p_notes text) -> returns clubs | SECURITY DEFINER | plpgsql

public.rpc_club_update(p_club_id uuid, p_name text, p_location_text text, p_timezone text, p_notes text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_club_join(p_club_id uuid, p_handle text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_club_handle_set(p_club_id uuid, p_new_handle text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_club_admin_grant(p_user_id uuid, p_club_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_club_admin_revoke(p_user_id uuid, p_club_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_court_create(p_club_id uuid, p_court_code text, p_surface text, p_notes text) -> returns courts | SECURITY DEFINER | plpgsql

public.rpc_court_update(p_court_id uuid, p_court_code text, p_surface text, p_notes text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_court_delete(p_court_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_club_handle_check(p_club_id uuid, p_handle text) -> returns TABLE(available boolean, suggestions text[]) | SECURITY INVOKER | plpgsql

public.validate_club_handle(p_handle text) -> returns text | SECURITY INVOKER | plpgsql

public.is_club_admin(p_club_id uuid) -> returns boolean | SECURITY DEFINER | sql

Profile / Admin / Roster / Sports RPCs

public.rpc_profile_init(p_display_name text, p_first_name text, p_last_name text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_profile_update(p_first_name text, p_last_name text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_profile_set_display_name(p_display_name text) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_profile_set_primary_club(p_club_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_admin_user_search(p_query text) -> returns TABLE(user_id uuid, display_name text, email text) | SECURITY DEFINER | plpgsql

public.rpc_roster_guest_create(p_display_name text, p_email text, p_phone text) -> returns guests | SECURITY DEFINER | plpgsql

public.rpc_roster_guest_create(p_display_name text, p_email text, p_phone text, p_notes text) -> returns guests | SECURITY DEFINER | plpgsql

public.rpc_roster_guest_list() -> returns SETOF guests | SECURITY DEFINER | sql

public.rpc_sports_list() -> returns SETOF sports | SECURITY DEFINER | sql

public.rpc_user_sports_set(p_sport_codes text[]) -> returns void | SECURITY DEFINER | plpgsql

public.rpc_guest_sports_set(p_guest_id uuid, p_sport_codes text[]) -> returns void | SECURITY DEFINER | plpgsql

## Core helpers / gates / identity

public.do_users_share_group(p_user_a uuid, p_user_b uuid) -> returns boolean | SECURITY DEFINER | sql

public.sharegroup_exists(p_user_a uuid, p_user_b uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.can_add_guests(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.can_invite_users(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.can_manage_participants(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.group_boundary_keeper_id(p_group_id uuid) -> returns uuid | SECURITY DEFINER | sql

public.is_group_active_member(p_group_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_group_active_member_any(p_group_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_group_member_any(p_group_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_guest_in_any_group_roster(p_guest_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_match_organizer(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.match_organizer_id(p_match_id uuid) -> returns uuid | SECURITY DEFINER | plpgsql

public.is_match_participant_active(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_match_participant_confirmed(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_user_in_match_scope(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.is_user_in_scope_groups(p_scope_group_ids uuid[], p_user_id uuid) -> returns boolean | SECURITY DEFINER | sql

public.is_user_match_associated(p_match_id uuid, p_user_id uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.is_caller_in_match_scope(p_match_id uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.is_caller_match_associated(p_match_id uuid) -> returns boolean | SECURITY DEFINER | plpgsql

public.match_participant_reconcile_status(p_mp_id uuid) -> returns void | SECURITY DEFINER | plpgsql

public.log_participant_action(p_match_participant_id uuid, p_action_type text, p_note text, p_created_by uuid) -> returns void | SECURITY INVOKER | plpgsql

## Trigger functions

public.fn_match_detail_change_reconfirm() -> returns trigger | SECURITY DEFINER | plpgsql

public.handle_new_user() -> returns trigger | SECURITY DEFINER | plpgsql

public.trg_notify_delegator_on_mp_change() -> returns trigger | SECURITY DEFINER | plpgsql

public.trg_set_formed_at_once() -> returns trigger | SECURITY DEFINER | plpgsql

public.compute_match_start_at_utc() -> returns trigger | SECURITY INVOKER | plpgsql

public.fn_guard_participant_state() -> returns trigger | SECURITY INVOKER | plpgsql

public.tg__set_updated_at() -> returns trigger | SECURITY INVOKER | plpgsql

public.trg_set_removed_at_from_status() -> returns trigger | SECURITY INVOKER | plpgsql

public.trg_set_removed_at_from_status() -> returns trigger | SECURITY INVOKER | plpgsql (listed once in code; keep single entry in file)

## Tests

public.test_runner_v161() -> returns TABLE(test_name text, ok boolean, details text, match_id uuid) | SECURITY DEFINER | plpgsql

public.test_runner_v161_cleanup() -> returns integer | SECURITY DEFINER | plpgsql

public.test_runner_v161_cleanup(p_run_suffix text) -> returns integer | SECURITY DEFINER | plpgsql

## Details

### `public.can_add_guests`
- **Kind:** Helper
- **Signature:** `public.can_add_guests("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** `public.is_match_organizer`, `public.is_match_participant_confirmed`
- **Notes:** —

### `public.can_invite_users`
- **Kind:** Helper
- **Signature:** `public.can_invite_users("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** `public.is_match_organizer`, `public.is_match_participant_confirmed`
- **Notes:** —

### `public.can_manage_participants`
- **Kind:** Helper
- **Signature:** `public.can_manage_participants("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** `public.is_match_organizer`, `public.is_match_participant_confirmed`
- **Notes:** —

### `public.compute_match_start_at_utc`
- **Kind:** Trigger function
- **Signature:** `public.compute_match_start_at_utc()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `—`
- **Reads:** `public.clubs`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.do_users_share_group`
- **Kind:** Helper
- **Signature:** `public.do_users_share_group("p_user_a" "uuid", "p_user_b" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.fn_guard_participant_state`
- **Kind:** Trigger function
- **Signature:** `public.fn_guard_participant_state()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.fn_match_detail_change_reconfirm`
- **Kind:** Trigger function
- **Signature:** `public.fn_match_detail_change_reconfirm()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`
- **Writes:** `public.match_participants`
- **Calls:** —
- **Notes:** ⚠️ **Direct `match_participants.status` write detected** (check against reconciliation invariant). ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.group_boundary_keeper_id`
- **Kind:** Helper
- **Signature:** `public.group_boundary_keeper_id("p_group_id" "uuid")`
- **Returns:** `"uuid"`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.groups`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.handle_new_user`
- **Kind:** Trigger function
- **Signature:** `public.handle_new_user()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.profiles`
- **Writes:** `public.profiles`
- **Calls:** —
- **Notes:** —

### `public.is_caller_in_match_scope`
- **Kind:** Helper
- **Signature:** `public.is_caller_in_match_scope("p_match_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** —
- **Writes:** —
- **Calls:** `public.is_user_in_match_scope`
- **Notes:** —

### `public.is_caller_match_associated`
- **Kind:** Helper
- **Signature:** `public.is_caller_match_associated("p_match_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** —
- **Writes:** —
- **Calls:** `public.is_user_match_associated`
- **Notes:** —

### `public.is_club_admin`
- **Kind:** Helper
- **Signature:** `public.is_club_admin("p_club_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.club_admins`, `public.profiles`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_group_active_member`
- **Kind:** Helper
- **Signature:** `public.is_group_active_member("p_group_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_group_active_member_any`
- **Kind:** Helper
- **Signature:** `public.is_group_active_member_any("p_group_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_group_member_any`
- **Kind:** Helper
- **Signature:** `public.is_group_member_any("p_group_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_guest_in_any_group_roster`
- **Kind:** Helper
- **Signature:** `public.is_guest_in_any_group_roster("p_guest_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_match_organizer`
- **Kind:** Helper
- **Signature:** `public.is_match_organizer("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_match_participant_active`
- **Kind:** Helper
- **Signature:** `public.is_match_participant_active("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.match_participants`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_match_participant_confirmed`
- **Kind:** Helper
- **Signature:** `public.is_match_participant_confirmed("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.match_participants`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_user_in_match_scope`
- **Kind:** Helper
- **Signature:** `public.is_user_in_match_scope("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** `public.is_group_active_member`
- **Notes:** —

### `public.is_user_in_scope_groups`
- **Kind:** Helper
- **Signature:** `public.is_user_in_scope_groups("p_scope_group_ids" "uuid"[], "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.is_user_match_associated`
- **Kind:** Helper
- **Signature:** `public.is_user_match_associated("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.match_participants`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.log_participant_action`
- **Kind:** Helper
- **Signature:** `public.log_participant_action("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT "auth"."uid"())`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.match_organizer_id`
- **Kind:** Helper
- **Signature:** `public.match_organizer_id("p_match_id" "uuid")`
- **Returns:** `"uuid"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.matches`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.match_participant_reconcile_status`
- **Kind:** Helper
- **Signature:** `public.match_participant_reconcile_status("p_mp_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`
- **Writes:** `public.match_participants`
- **Calls:** —
- **Notes:** ⚠️ **Direct `match_participants.status` write detected** (check against reconciliation invariant). ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_admin_user_search`
- **Kind:** RPC
- **Signature:** `public.rpc_admin_user_search("p_query" "text")`
- **Returns:** `TABLE("user_id" "uuid", "display_name" "text", "email" "text")`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.profiles`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.rpc_club_admin_grant`
- **Kind:** RPC
- **Signature:** `public.rpc_club_admin_grant("p_user_id" "uuid", "p_club_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.club_admins`, `public.clubs`, `public.profiles`
- **Writes:** `public.club_admins`
- **Calls:** —
- **Notes:** —

### `public.rpc_club_admin_revoke`
- **Kind:** RPC
- **Signature:** `public.rpc_club_admin_revoke("p_user_id" "uuid", "p_club_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.club_admins`, `public.profiles`
- **Writes:** `public.club_admins`
- **Calls:** —
- **Notes:** —

### `public.rpc_club_create`
- **Kind:** RPC
- **Signature:** `public.rpc_club_create("p_name" "text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT 'America/Toronto'::"text", "p_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."clubs"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.clubs`, `public.profiles`
- **Writes:** `public.clubs`
- **Calls:** —
- **Notes:** —

### `public.rpc_club_handle_check`
- **Kind:** RPC
- **Signature:** `public.rpc_club_handle_check("p_club_id" "uuid", "p_handle" "text")`
- **Returns:** `TABLE("available" boolean, "suggestions" "text"[])`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `stable`
- **Reads:** `public.club_identities`
- **Writes:** —
- **Calls:** `public.validate_club_handle`
- **Notes:** —

### `public.rpc_club_handle_set`
- **Kind:** RPC
- **Signature:** `public.rpc_club_handle_set("p_club_id" "uuid", "p_new_handle" "text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.club_identities`, `public.profiles`
- **Writes:** `public.club_identities`, `public.profiles`
- **Calls:** `public.validate_club_handle`
- **Notes:** —

### `public.rpc_club_join`
- **Kind:** RPC
- **Signature:** `public.rpc_club_join("p_club_id" "uuid", "p_handle" "text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.club_identities`, `public.clubs`, `public.profiles`
- **Writes:** `public.club_identities`, `public.profiles`
- **Calls:** `public.validate_club_handle`
- **Notes:** —

### `public.rpc_club_update`
- **Kind:** RPC
- **Signature:** `public.rpc_club_update("p_club_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.clubs`
- **Writes:** `public.clubs`
- **Calls:** `public.is_club_admin`
- **Notes:** —

### `public.rpc_court_create`
- **Kind:** RPC
- **Signature:** `public.rpc_court_create("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."courts"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.courts`
- **Writes:** `public.courts`
- **Calls:** `public.is_club_admin`
- **Notes:** —

### `public.rpc_court_delete`
- **Kind:** RPC
- **Signature:** `public.rpc_court_delete("p_court_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.courts`
- **Writes:** `public.courts`
- **Calls:** `public.is_club_admin`
- **Notes:** —

### `public.rpc_court_update`
- **Kind:** RPC
- **Signature:** `public.rpc_court_update("p_court_id" "uuid", "p_court_code" "text" DEFAULT NULL::"text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.courts`
- **Writes:** `public.courts`
- **Calls:** `public.is_club_admin`
- **Notes:** —

### `public.rpc_group_accept_invite`
- **Kind:** RPC
- **Signature:** `public.rpc_group_accept_invite("p_group_id" "uuid")`
- **Returns:** `"public"."group_members"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.group_members`
- **Writes:** `public.group_members`
- **Calls:** —
- **Notes:** —

### `public.rpc_group_create`
- **Kind:** RPC
- **Signature:** `public.rpc_group_create("p_name" "text", "p_description" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."groups"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.group_members`, `public.groups`
- **Writes:** `public.group_members`, `public.groups`
- **Calls:** —
- **Notes:** —

### `public.rpc_group_invite_user`
- **Kind:** RPC
- **Signature:** `public.rpc_group_invite_user("p_group_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.groups`, `public.group_members`
- **Writes:** `public.group_members`
- **Calls:** `public.do_users_share_group`
- **Notes:** Boundary keeper can invite any user. Active members (non–boundary keeper) can also invite, but only users who share at least one group with the caller (`do_users_share_group`). Handles re-invite of removed members.

### `public.rpc_group_leave`
- **Kind:** RPC
- **Signature:** `public.rpc_group_leave("p_group_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.rpc_group_set_display_name`
- **Kind:** RPC
- **Signature:** `public.rpc_group_set_display_name("p_group_id" "uuid", "p_display_name" "text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.group_members`
- **Writes:** `public.group_members`
- **Calls:** —
- **Notes:** —

### `public.rpc_guest_sports_set`
- **Kind:** RPC
- **Signature:** `public.rpc_guest_sports_set("p_guest_id" "uuid", "p_sport_codes" "text"[])`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guest_sports`, `public.guests`, `public.sports`
- **Writes:** `public.guest_sports`
- **Calls:** —
- **Notes:** —

### `public.rpc_match_accept_invite`
- **Kind:** RPC
- **Signature:** `public.rpc_match_accept_invite("p_match_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_add_guest_org`
- **Kind:** RPC
- **Signature:** `public.rpc_match_add_guest_org("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guests`, `public.match_participants`
- **Writes:** `public.guests`, `public.match_participants`
- **Calls:** `public.is_match_organizer`, `public.match_participant_reconcile_status`
- **Notes:** —

### `public.rpc_match_nominate_guest`
- **Kind:** RPC
- **Signature:** `public.rpc_match_nominate_guest("p_match_id" "uuid", "p_guest_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.matches`, `public.user_roster_guests`, `public.guests`, `public.match_participants`
- **Writes:** `public.match_participants`
- **Calls:** `public.is_match_organizer`, `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** Unified **Contact Player / guest** entry point. Caller must be **organizer or active participant** *and* must own the guest in `user_roster_guests`. Inserts a single `match_participants` row with `guest_id`, `join_method='nominated'`, `status='pending'`, `nominated_by=auth.uid()`. For organizer callers, `org_approved_at/By` is written immediately; for others it stays `NULL`. `participant_accepted_at` is always `NULL` at insert — must be set by `rpc_match_delegate_confirm_guest`. Invariant: `confirmed ⇔ participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL` (enforced by `match_participant_reconcile_status`). Rejects duplicate active rows for the same `(match_id, guest_id)` with `guest_already_active`.

### `public.rpc_match_delegate_confirm_guest`
- **Kind:** RPC
- **Signature:** `public.rpc_match_delegate_confirm_guest("p_match_participant_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`
- **Writes:** `public.match_participants`, `public.match_participant_actions`
- **Calls:** `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** Any **active participant** in the match (including the organizer) can confirm that a guest (Contact Player) can attend. Only valid for `guest_id IS NOT NULL` and `removed_at IS NULL`. Writes `participant_accepted_at = now()` and `participant_accepted_via = 'delegate_manual'` **only** — never touches `org_approved_at`. Adds `match_participant_actions` row with `action_type='delegate_manual_confirm'`. Combined with `rpc_match_org_approve_participant` this yields `confirmed` when both timestamps are present.

### `public.rpc_match_add_guest_org` *(deprecated)*
- **Kind:** RPC
- **Signature:** `public.rpc_match_add_guest_org(...)`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** **Deprecated.** Old “add guest and auto-confirm” path (wrote `participant_accepted_at` + `org_approved_at` in one step). Now implemented as a thin wrapper that always raises `deprecated_use_rpc_match_nominate_guest`. Frontend must use `rpc_match_nominate_guest` + `rpc_match_delegate_confirm_guest` + `rpc_match_org_approve_participant` instead.

### `public.rpc_match_add_guest_participant` *(deprecated)*
- **Kind:** RPC
- **Signature:** `public.rpc_match_add_guest_participant(...)`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** **Deprecated.** Old “participant adds guest” shortcut. Function body now raises `deprecated_use_rpc_match_nominate_guest`. Replaced by `rpc_roster_guest_create` (to create Contact Player + add to roster) followed by `rpc_match_nominate_guest`.

### `public.rpc_match_create`
- **Kind:** RPC
- **Signature:** `public.rpc_match_create("p_required_count" integer DEFAULT 4, "p_game_type" "text" DEFAULT 'doubles'::"text", "p_match_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_duration_minutes" integer DEFAULT NULL::integer, "p_club_id" "uuid" DEFAULT NULL::"uuid", "p_court_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_invitation_scope_group_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_can_participants_invite_users" boolean DEFAULT false, "p_can_participants_add_guests" boolean DEFAULT false, "p_can_participants_manage_participants" boolean DEFAULT false)`
- **Returns:** `"public"."matches"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`, `public.matches`
- **Writes:** `public.match_participants`, `public.matches`
- **Calls:** `public.match_participant_reconcile_status`
- **Notes:** —

### `public.rpc_match_delegate_confirm_user`
- **Kind:** RPC
- **Signature:** `public.rpc_match_delegate_confirm_user("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.do_users_share_group`, `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_delegate_manual_confirm_targets`
- **Kind:** RPC
- **Signature:** `public.rpc_match_delegate_manual_confirm_targets("p_match_id" "uuid")`
- **Returns:** `TABLE("user_id" "uuid", "display_name" "text")`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.group_members`, `public.match_participants`, `public.matches`
- **Writes:** —
- **Calls:** `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.is_user_match_associated`
- **Notes:** —

### `public.rpc_match_invite_guest_from_roster` *(deprecated)*
- **Kind:** RPC
- **Signature:** `public.rpc_match_invite_guest_from_roster("p_match_id" "uuid", "p_guest_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guests`, `public.match_participants`, `public.matches`, `public.user_roster_guests`
- **Writes:** `public.match_participants`
- **Calls:** `public.match_participant_reconcile_status`
- **Notes:** **Deprecated.** Previously let organizers invite a Contact Player from personal roster with mixed semantics. Now implemented as a stub that raises `deprecated_use_rpc_match_nominate_guest`. All guest flows must go through the nominate / delegate-confirm / org-approve pipeline.

### `public.rpc_match_invite_user`
- **Kind:** RPC
- **Signature:** `public.rpc_match_invite_user("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.do_users_share_group`, `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine). ℹ️ Mentions `user_accepted_at` (deprecated in your v1.6.3 spec).

### `public.rpc_match_manual_confirm`
- **Kind:** RPC
- **Signature:** `public.rpc_match_manual_confirm("p_match_participant_id" "uuid", "p_note" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_manual_confirm_user`
- **Kind:** RPC
- **Signature:** `public.rpc_match_manual_confirm_user("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.do_users_share_group`, `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_nominate_user`
- **Kind:** RPC
- **Signature:** `public.rpc_match_nominate_user("p_match_id" "uuid", "p_user_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.do_users_share_group`, `public.is_match_organizer`, `public.is_user_in_scope_groups`, `public.is_user_match_associated`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine). ℹ️ Mentions `user_accepted_at` (deprecated in your v1.6.3 spec).

### `public.rpc_match_org_approve_participant`
- **Kind:** RPC
- **Signature:** `public.rpc_match_org_approve_participant("p_match_participant_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.is_match_organizer`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_remove_participant`
- **Kind:** RPC
- **Signature:** `public.rpc_match_remove_participant("p_match_participant_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.is_match_organizer`, `public.is_match_participant_confirmed`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_request_join`
- **Kind:** RPC
- **Signature:** `public.rpc_match_request_join("p_match_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.is_user_in_scope_groups`, `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_match_user_withdraw`
- **Kind:** RPC
- **Signature:** `public.rpc_match_user_withdraw("p_match_id" "uuid")`
- **Returns:** `"public"."match_participants"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`
- **Writes:** `public.match_participant_actions`, `public.match_participants`
- **Calls:** `public.match_participant_reconcile_status`
- **Notes:** ⚠️ **Re-entry / removed_* mutation detected** (check against restart-channel doctrine).

### `public.rpc_profile_init`
- **Kind:** RPC
- **Signature:** `public.rpc_profile_init("p_display_name" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.profiles`
- **Writes:** `public.profiles`
- **Calls:** —
- **Notes:** —

### `public.rpc_profile_set_display_name`
- **Kind:** RPC
- **Signature:** `public.rpc_profile_set_display_name("p_display_name" "text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.profiles`
- **Writes:** `public.profiles`
- **Calls:** —
- **Notes:** —

### `public.rpc_profile_set_primary_club`
- **Kind:** RPC
- **Signature:** `public.rpc_profile_set_primary_club("p_club_id" "uuid")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.club_identities`, `public.profiles`
- **Writes:** `public.profiles`
- **Calls:** —
- **Notes:** —

### `public.rpc_profile_update`
- **Kind:** RPC
- **Signature:** `public.rpc_profile_update("p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text")`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.profiles`
- **Writes:** `public.profiles`
- **Calls:** —
- **Notes:** —

### `public.rpc_roster_guest_create`
- **Kind:** RPC
- **Signature:** `public.rpc_roster_guest_create("p_display_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."guests"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guests`, `public.user_roster_guests`
- **Writes:** `public.guests`, `public.user_roster_guests`
- **Calls:** —
- **Notes:** —

### `public.rpc_roster_guest_create`
- **Kind:** RPC
- **Signature:** `public.rpc_roster_guest_create("p_display_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text")`
- **Returns:** `"public"."guests"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guests`, `public.user_roster_guests`
- **Writes:** `public.guests`, `public.user_roster_guests`
- **Calls:** —
- **Notes:** —

### `public.rpc_roster_guest_list`
- **Kind:** RPC
- **Signature:** `public.rpc_roster_guest_list()`
- **Returns:** `SETOF "public"."guests"`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.guests`, `public.user_roster_guests`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.rpc_sports_list`
- **Kind:** RPC
- **Signature:** `public.rpc_sports_list()`
- **Returns:** `SETOF "public"."sports"`
- **Language:** `sql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.sports`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.rpc_user_sports_set`
- **Kind:** RPC
- **Signature:** `public.rpc_user_sports_set("p_sport_codes" "text"[])`
- **Returns:** `"void"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.sports`, `public.user_sports`
- **Writes:** `public.user_sports`
- **Calls:** —
- **Notes:** —

### `public.sharegroup_exists`
- **Kind:** Helper
- **Signature:** `public.sharegroup_exists("p_user_a" "uuid", "p_user_b" "uuid")`
- **Returns:** `boolean`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `stable`
- **Reads:** `public.group_members`
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.test_runner_v161`
- **Kind:** Test helper
- **Signature:** `public.test_runner_v161()`
- **Returns:** `TABLE("test_name" "text", "ok" boolean, "details" "text", "match_id" "uuid")`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`, `public.matches`
- **Writes:** `public.match_participants`, `public.matches`
- **Calls:** `public.do_users_share_group`, `public.is_user_match_associated`, `public.rpc_match_delegate_confirm_user`, `public.rpc_match_manual_confirm_user`, `public.rpc_match_nominate_user`
- **Notes:** ⚠️ **Direct `match_participants.status` write detected** (check against reconciliation invariant).

### `public.test_runner_v161_cleanup`
- **Kind:** Test helper
- **Signature:** `public.test_runner_v161_cleanup()`
- **Returns:** `integer`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Calls:** —
- **Notes:** —

### `public.test_runner_v161_cleanup`
- **Kind:** Test helper
- **Signature:** `public.test_runner_v161_cleanup("p_run_suffix" "text")`
- **Returns:** `integer`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Writes:** `public.match_participant_actions`, `public.match_participants`, `public.matches`
- **Calls:** —
- **Notes:** —

### `public.tg__set_updated_at`
- **Kind:** Trigger function
- **Signature:** `public.tg__set_updated_at()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.trg_notify_delegator_on_mp_change`
- **Kind:** Trigger function
- **Signature:** `public.trg_notify_delegator_on_mp_change()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.matches`, `public.notifications`
- **Writes:** `public.notifications`
- **Calls:** —
- **Notes:** —

### `public.trg_set_formed_at_once`
- **Kind:** Trigger function
- **Signature:** `public.trg_set_formed_at_once()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY DEFINER**
- **Volatility:** `—`
- **Reads:** `public.match_participants`, `public.matches`
- **Writes:** `public.matches`
- **Calls:** —
- **Notes:** —

### `public.trg_set_removed_at_from_status`
- **Kind:** Trigger function
- **Signature:** `public.trg_set_removed_at_from_status()`
- **Returns:** `"trigger"`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `—`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —

### `public.validate_club_handle`
- **Kind:** Helper
- **Signature:** `public.validate_club_handle("p_handle" "text")`
- **Returns:** `"text"`
- **Language:** `plpgsql`
- **Security:** **SECURITY INVOKER**
- **Volatility:** `immutable`
- **Reads:** —
- **Writes:** —
- **Calls:** —
- **Notes:** —