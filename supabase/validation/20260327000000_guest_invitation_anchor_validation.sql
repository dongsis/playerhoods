-- Validation checklist for:
-- 20260327000000_guest_invitation_anchor_and_guest_response_paths.sql

-- 1) Anchor column + FK + index + trigger
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'email_invitations'
  and column_name = 'match_participant_id';

select conname
from pg_constraint
where conname = 'email_invitations_match_participant_id_fkey';

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'email_invitations'
  and indexname = 'idx_email_invitations_match_participant_id';

select tgname
from pg_trigger
where tgname = 'trg_email_invitation_anchor_consistency';

-- 2) RPC presence checks
select routine_name
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'rpc_email_invitation_create',
    'rpc_email_invitation_accept_as_guest',
    'rpc_email_invitation_decline_as_guest'
  )
order by routine_name;

-- 3) Grant checks (post-hardening expected roles only)
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'rpc_email_invitation_accept_as_guest',
    'rpc_email_invitation_decline_as_guest'
  )
order by routine_name, grantee;
-- Expected:
--   include: anon, authenticated, service_role
--   exclude: PUBLIC

-- 4) Runtime behavior checks (run with realistic seeded invitation ids)
-- Replace placeholders before running:
--   :anchored_invitation_id
--   :legacy_unique_invitation_id
--   :legacy_ambiguous_invitation_id
--   :guest_decline_invitation_id
--   :system_actor_id
--
-- Accept: anchored path should update existing guest participant only.
-- select public.rpc_email_invitation_accept_as_guest(:anchored_invitation_id);
--
-- Accept: legacy unique fallback should succeed and backfill anchor.
-- select public.rpc_email_invitation_accept_as_guest(:legacy_unique_invitation_id);
--
-- Accept: ambiguous fallback must fail (participant_ambiguous_for_invitation).
-- select public.rpc_email_invitation_accept_as_guest(:legacy_ambiguous_invitation_id);
--
-- Decline: withdraw semantics + invitation declined + system actor audit.
-- select public.rpc_email_invitation_decline_as_guest(:guest_decline_invitation_id, :system_actor_id);
