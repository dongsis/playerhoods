## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`

| section                      | columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ## Table: clubs              | - id (uuid, NOT NULL, default: gen_random_uuid())
- name (text, NOT NULL)
- location_text (text, nullable)
- notes (text, nullable)
- created_at (timestamp with time zone, NOT NULL, default: now())                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ## Table: courts             | - id (uuid, NOT NULL, default: gen_random_uuid())
- club_id (uuid, NOT NULL)
- court_code (text, NOT NULL)
- surface (text, nullable)
- notes (text, nullable)
- created_at (timestamp with time zone, NOT NULL, default: now())                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ## Table: group_members      | - id (uuid, NOT NULL, default: gen_random_uuid())
- group_id (uuid, NOT NULL)
- user_id (uuid, NOT NULL)
- status (USER-DEFINED, NOT NULL, default: 'pending'::group_member_status)
- join_method (text, NOT NULL, default: 'invited'::text)
- invited_by (uuid, nullable)
- created_at (timestamp with time zone, NOT NULL, default: now())
- accepted_at (timestamp with time zone, nullable)
- removed_at (timestamp with time zone, nullable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ## Table: groups             | - id (uuid, NOT NULL, default: gen_random_uuid())
- name (text, NOT NULL)
- description (text, nullable)
- boundary_keeper_id (uuid, NOT NULL)
- created_by (uuid, NOT NULL)
- created_at (timestamp with time zone, NOT NULL, default: now())                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ## Table: guests             | - id (uuid, NOT NULL, default: gen_random_uuid())
- display_name (text, NOT NULL)
- notes (text, nullable)
- created_by (uuid, NOT NULL)
- created_at (timestamp with time zone, NOT NULL, default: now())                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ## Table: match_participants | - id (uuid, NOT NULL, default: gen_random_uuid())
- match_id (uuid, NOT NULL)
- status (USER-DEFINED, NOT NULL, default: 'pending'::match_participant_status)
- join_method (USER-DEFINED, NOT NULL)
- user_id (uuid, nullable)
- guest_id (uuid, nullable)
- created_by (uuid, NOT NULL)
- created_at (timestamp with time zone, NOT NULL, default: now())
- confirmed_at (timestamp with time zone, nullable)
- removed_at (timestamp with time zone, nullable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ## Table: matches            | - id (uuid, NOT NULL, default: gen_random_uuid())
- organizer_id (uuid, NOT NULL)
- status (USER-DEFINED, NOT NULL, default: 'active'::match_status)
- admission_mode (USER-DEFINED, NOT NULL, default: 'invite'::match_admission_mode)
- club_id (uuid, nullable)
- court_ids (ARRAY, NOT NULL, default: '{}'::uuid[])
- match_date (date, NOT NULL, default: ((now() AT TIME ZONE 'utc'::text))::date)
- start_time (time without time zone, NOT NULL, default: '09:00:00'::time without time zone)
- duration_minutes (integer, NOT NULL, default: 90)
- game_type (text, NOT NULL, default: 'doubles'::text)
- required_count (integer, NOT NULL, default: 4)
- invitation_scope_group_ids (ARRAY, NOT NULL, default: '{}'::uuid[])
- can_participants_invite_users (boolean, NOT NULL, default: false)
- can_participants_add_guests (boolean, NOT NULL, default: false)
- can_participants_manage_participants (boolean, NOT NULL, default: false)
- formed_at (timestamp with time zone, nullable)
- created_at (timestamp with time zone, NOT NULL, default: now()) |
| ## Table: profiles           | - id (uuid, NOT NULL)
- first_name (text, NOT NULL, default: ''::text)
- middle_name (text, nullable)
- last_name (text, NOT NULL, default: ''::text)
- display_name (text, nullable)
- avatar_url (text, nullable)
- gender (text, nullable, default: 'unspecified'::text)
- level (text, nullable)
- availability_note (text, nullable)
- plays_singles (boolean, NOT NULL, default: true)
- plays_doubles (boolean, NOT NULL, default: true)
- primary_club_id (uuid, nullable)
- secondary_club_ids (ARRAY, NOT NULL, default: '{}'::uuid[])
- created_at (timestamp with time zone, NOT NULL, default: now())
- updated_at (timestamp with time zone, NOT NULL, default: now())                                                                                                                                                                                                                                                                                                                                                              
| table_name         | constraint_name                          | constraint_type | columns             |
| ------------------ | ---------------------------------------- | --------------- | ------------------- |
| clubs              | clubs_pkey                               | PRIMARY KEY     | id                  |
| courts             | courts_pkey                              | PRIMARY KEY     | id                  |
| courts             | courts_club_id_court_code_key            | UNIQUE          | club_id, court_code |
| group_members      | group_members_pkey                       | PRIMARY KEY     | id                  |
| group_members      | group_members_group_id_user_id_key       | UNIQUE          | group_id, user_id   |
| groups             | groups_pkey                              | PRIMARY KEY     | id                  |
| guests             | guests_pkey                              | PRIMARY KEY     | id                  |
| match_participants | match_participants_pkey                  | PRIMARY KEY     | id                  |
| match_participants | match_participants_match_id_guest_id_key | UNIQUE          | match_id, guest_id  |
| match_participants | match_participants_match_id_user_id_key  | UNIQUE          | match_id, user_id   |
| matches            | matches_pkey                             | PRIMARY KEY     | id                  |
| profiles           | profiles_pkey                            | PRIMARY KEY     | id                  |                          |



| from_table         | from_column     | to_table | to_column | constraint_name                  |
| ------------------ | --------------- | -------- | --------- | -------------------------------- |
| courts             | club_id         | clubs    | id        | courts_club_id_fkey              |
| group_members      | group_id        | groups   | id        | group_members_group_id_fkey      |
| match_participants | match_id        | matches  | id        | match_participants_match_id_fkey |
| match_participants | guest_id        | guests   | id        | match_participants_guest_id_fkey |
| matches            | club_id         | clubs    | id        | matches_club_id_fkey             |
| profiles           | primary_club_id | clubs    | id        | profiles_primary_club_fk         |


| table_name         | policy_name                                           | permissive | roles           | operation | using_expression                                                                                                                                                                                                                                   | with_check_expression                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------- | ---------- | --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clubs              | clubs_select_auth                                     | PERMISSIVE | {authenticated} | SELECT    | true                                                                                                                                                                                                                                               | null                                                                                                                                                                                                                                                                                                                                                                            |
| courts             | courts_select_auth                                    | PERMISSIVE | {authenticated} | SELECT    | true                                                                                                                                                                                                                                               | null                                                                                                                                                                                                                                                                                                                                                                            |
| group_members      | group_members_insert_bk                               | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid())))) AND (invited_by = auth.uid()))                                                                                                                                                                                                                         |
| group_members      | group_members_select                                  | PERMISSIVE | {authenticated} | SELECT    | ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid())))) OR ((status = 'active'::group_member_status) AND is_group_active_member(group_id, auth.uid())) OR (user_id = auth.uid())) | null                                                                                                                                                                                                                                                                                                                                                                            |
| group_members      | group_members_select_active_roster_for_active_members | PERMISSIVE | {authenticated} | SELECT    | ((status = 'active'::group_member_status) AND is_group_active_member_any(group_id, auth.uid()))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                                                                                                            |
| group_members      | group_members_select_bk                               | PERMISSIVE | {authenticated} | SELECT    | (group_boundary_keeper_id(group_id) = auth.uid())                                                                                                                                                                                                  | null                                                                                                                                                                                                                                                                                                                                                                            |
| group_members      | group_members_select_self                             | PERMISSIVE | {authenticated} | SELECT    | (user_id = auth.uid())                                                                                                                                                                                                                             | null                                                                                                                                                                                                                                                                                                                                                                            |
| group_members      | group_members_update_bk                               | PERMISSIVE | {authenticated} | UPDATE    | (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid()))))                                                                                                                            | (EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_members.group_id) AND (g.boundary_keeper_id = auth.uid()))))                                                                                                                                                                                                                                                         |
| group_members      | group_members_update_self_accept                      | PERMISSIVE | {authenticated} | UPDATE    | ((user_id = auth.uid()) AND (status = 'pending'::group_member_status))                                                                                                                                                                             | ((user_id = auth.uid()) AND (status = 'active'::group_member_status))                                                                                                                                                                                                                                                                                                           |
| groups             | groups_insert_self                                    | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | ((created_by = auth.uid()) AND (boundary_keeper_id = auth.uid()))                                                                                                                                                                                                                                                                                                               |
| groups             | groups_select_member                                  | PERMISSIVE | {authenticated} | SELECT    | is_group_member_any(id, auth.uid())                                                                                                                                                                                                                | null                                                                                                                                                                                                                                                                                                                                                                            |
| groups             | groups_update_bk                                      | PERMISSIVE | {authenticated} | UPDATE    | (boundary_keeper_id = auth.uid())                                                                                                                                                                                                                  | (boundary_keeper_id = auth.uid())                                                                                                                                                                                                                                                                                                                                               |
| guests             | guests_insert_auth                                    | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (created_by = auth.uid())                                                                                                                                                                                                                                                                                                                                                       |
| guests             | guests_select_for_match_people                        | PERMISSIVE | {authenticated} | SELECT    | (EXISTS ( SELECT 1
   FROM (match_participants mp
     JOIN matches m ON ((m.id = mp.match_id)))
  WHERE ((mp.guest_id = guests.id) AND ((m.organizer_id = auth.uid()) OR is_match_participant_active(m.id, auth.uid())))))                        | null                                                                                                                                                                                                                                                                                                                                                                            |
| match_participants | match_participants_insert_guest_by_org                | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (is_match_organizer(match_id, auth.uid()) AND (join_method = 'guest_add'::match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL))                                                                                                                                                                                                                          |
| match_participants | match_participants_insert_guest_confirmed_if_invite   | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (can_add_guests(match_id, auth.uid()) AND (join_method = 'guest_add'::match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL) AND (user_id IS NULL) AND (status = 'confirmed'::match_participant_status) AND (EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = match_participants.match_id) AND (m.admission_mode = 'invite'::match_admission_mode))))) |
| match_participants | match_participants_insert_guest_pending_if_request    | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (can_add_guests(match_id, auth.uid()) AND (join_method = 'guest_add'::match_join_method) AND (created_by = auth.uid()) AND (guest_id IS NOT NULL) AND (user_id IS NULL) AND (status = 'pending'::match_participant_status) AND (EXISTS ( SELECT 1
   FROM matches m
  WHERE ((m.id = match_participants.match_id) AND (m.admission_mode = 'request'::match_admission_mode)))))  |
| match_participants | match_participants_insert_invite_by_org               | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (can_invite_users(match_id, auth.uid()) AND (join_method = 'invited'::match_join_method) AND (status = 'pending'::match_participant_status) AND (created_by = auth.uid()) AND (user_id IS NOT NULL) AND (guest_id IS NULL))                                                                                                                                                     |
| match_participants | match_participants_insert_request                     | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | ((user_id = auth.uid()) AND (join_method = 'requested'::match_join_method) AND (status = 'pending'::match_participant_status) AND (created_by = auth.uid()) AND is_user_in_match_scope(match_id, auth.uid()))                                                                                                                                                                   |
| match_participants | match_participants_select                             | PERMISSIVE | {authenticated} | SELECT    | (is_match_organizer(match_id, auth.uid()) OR is_match_participant_active(match_id, auth.uid()))                                                                                                                                                    | null                                                                                                                                                                                                                                                                                                                                                                            |
| match_participants | match_participants_update_org_only                    | PERMISSIVE | {authenticated} | UPDATE    | is_match_organizer(match_id, auth.uid())                                                                                                                                                                                                           | is_match_organizer(match_id, auth.uid())                                                                                                                                                                                                                                                                                                                                        |
| match_participants | match_participants_update_self_invite                 | PERMISSIVE | {authenticated} | UPDATE    | ((user_id = auth.uid()) AND (join_method = 'invited'::match_join_method) AND (status = 'pending'::match_participant_status))                                                                                                                       | ((user_id = auth.uid()) AND (join_method = 'invited'::match_join_method) AND (status = ANY (ARRAY['confirmed'::match_participant_status, 'removed'::match_participant_status])))                                                                                                                                                                                                |
| match_participants | match_participants_update_self_leave                  | PERMISSIVE | {authenticated} | UPDATE    | ((user_id = auth.uid()) AND (status = ANY (ARRAY['pending'::match_participant_status, 'confirmed'::match_participant_status])))                                                                                                                    | ((user_id = auth.uid()) AND (status = 'removed'::match_participant_status))                                                                                                                                                                                                                                                                                                     |
| matches            | matches_insert_self                                   | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (organizer_id = auth.uid())                                                                                                                                                                                                                                                                                                                                                     |
| matches            | matches_select_visibility                             | PERMISSIVE | {authenticated} | SELECT    | ((organizer_id = auth.uid()) OR is_match_participant_active(id, auth.uid()))                                                                                                                                                                       | null                                                                                                                                                                                                                                                                                                                                                                            |
| matches            | matches_update_organizer                              | PERMISSIVE | {authenticated} | UPDATE    | (organizer_id = auth.uid())                                                                                                                                                                                                                        | (organizer_id = auth.uid())                                                                                                                                                                                                                                                                                                                                                     |
| profiles           | profiles_select_self                                  | PERMISSIVE | {authenticated} | SELECT    | (id = auth.uid())                                                                                                                                                                                                                                  | null                                                                                                                                                                                                                                                                                                                                                                            |
| profiles           | profiles_update_self                                  | PERMISSIVE | {authenticated} | UPDATE    | (id = auth.uid())                                                                                                                                                                                                                                  | (id = auth.uid())                                                                                                                                                                                                                                                                                                                                                               |
| profiles           | profiles_upsert_self                                  | PERMISSIVE | {authenticated} | INSERT    | null                                                                                                                                                                                                                                               | (id = auth.uid())                                                                                                                                                                                                                                                                                                                                                               |



| table_name         | rls_enabled | rls_forced |
| ------------------ | ----------- | ---------- |
| clubs              | true        | false      |
| courts             | true        | false      |
| group_members      | true        | false      |
| groups             | true        | false      |
| guests             | true        | false      |
| match_participants | true        | false      |
| matches            | true        | false      |
| profiles           | true        | false      |



| tablename          | indexname                                | indexdef                                                                                                                   |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| clubs              | clubs_pkey                               | CREATE UNIQUE INDEX clubs_pkey ON public.clubs USING btree (id)                                                            |
| courts             | courts_club_id_court_code_key            | CREATE UNIQUE INDEX courts_club_id_court_code_key ON public.courts USING btree (club_id, court_code)                       |
| courts             | courts_pkey                              | CREATE UNIQUE INDEX courts_pkey ON public.courts USING btree (id)                                                          |
| group_members      | group_members_group_id_user_id_key       | CREATE UNIQUE INDEX group_members_group_id_user_id_key ON public.group_members USING btree (group_id, user_id)             |
| group_members      | group_members_pkey                       | CREATE UNIQUE INDEX group_members_pkey ON public.group_members USING btree (id)                                            |
| groups             | groups_pkey                              | CREATE UNIQUE INDEX groups_pkey ON public.groups USING btree (id)                                                          |
| guests             | guests_pkey                              | CREATE UNIQUE INDEX guests_pkey ON public.guests USING btree (id)                                                          |
| match_participants | match_participants_match_id_guest_id_key | CREATE UNIQUE INDEX match_participants_match_id_guest_id_key ON public.match_participants USING btree (match_id, guest_id) |
| match_participants | match_participants_match_id_user_id_key  | CREATE UNIQUE INDEX match_participants_match_id_user_id_key ON public.match_participants USING btree (match_id, user_id)   |
| match_participants | match_participants_pkey                  | CREATE UNIQUE INDEX match_participants_pkey ON public.match_participants USING btree (id)                                  |
| matches            | matches_pkey                             | CREATE UNIQUE INDEX matches_pkey ON public.matches USING btree (id)                                                        |
| profiles           | profiles_pkey                            | CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)                                                      |


| trigger_name             | event  | table_name         | action_statement                          |
| ------------------------ | ------ | ------------------ | ----------------------------------------- |
| set_formed_at_once_on_mp | INSERT | match_participants | EXECUTE FUNCTION trg_set_formed_at_once() |
| set_formed_at_once_on_mp | UPDATE | match_participants | EXECUTE FUNCTION trg_set_formed_at_once() |

| enum_name                | values                        |
| ------------------------ | ----------------------------- |
| group_member_status      | pending, active, removed      |
| match_admission_mode     | invite, request               |
| match_join_method        | invited, requested, guest_add |
| match_participant_status | pending, confirmed, removed   |
| match_status             | active, cancelled, archived   |



| schemaname | table_name         | estimated_row_count |
| ---------- | ------------------ | ------------------- |
| public     | match_participants | 14                  |
| public     | matches            | 8                   |
| public     | groups             | 6                   |
| public     | group_members      | 4                   |
| public     | guests             | 3                   |
| public     | profiles           | 0                   |
| public     | courts             | 0                   |
| public     | clubs              | 0                   |