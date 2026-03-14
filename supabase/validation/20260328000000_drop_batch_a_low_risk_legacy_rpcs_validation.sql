-- Validation for migration:
--   20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql
--
-- Goal:
--   1) Confirm dropped RPC is absent
--   2) Confirm invitation/guest mainline RPCs still exist
--   3) Provide smoke-check checklist for staging run

-- -----------------------------------------------------------------------------
-- 1) Dropped function must be absent
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'rpc_email_invitation_update_flow_status';
-- Expected: 0 rows

-- -----------------------------------------------------------------------------
-- 2) Mainline invitation functions must remain available
-- -----------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'rpc_email_invitation_create',
    'rpc_email_invitation_get',
    'rpc_email_invitation_accept_as_guest',
    'rpc_email_invitation_decline_as_guest'
  )
ORDER BY p.proname, identity_args;
-- Expected: rows present for all listed functions

-- -----------------------------------------------------------------------------
-- 3) Optional grants sanity (guest-path RPCs should still be callable)
-- -----------------------------------------------------------------------------
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE specific_schema = 'public'
  AND routine_name IN (
    'rpc_email_invitation_accept_as_guest',
    'rpc_email_invitation_decline_as_guest'
  )
ORDER BY routine_name, grantee;
-- Expected: anon/authenticated grants remain

-- -----------------------------------------------------------------------------
-- 4) Staging smoke checklist (manual run sequence)
-- -----------------------------------------------------------------------------
-- [A] Create invitation from organizer flow and verify:
--     - invitation row created
--     - no call path depends on rpc_email_invitation_update_flow_status
--
-- [B] Accept as guest and verify:
--     - existing guest participant updated (participant_accepted_at / via)
--     - no new user participant row created
--
-- [C] Decline as guest and verify:
--     - participant exits via withdraw semantics
--     - invitation.status becomes declined
--     - system actor is recorded (if configured)

