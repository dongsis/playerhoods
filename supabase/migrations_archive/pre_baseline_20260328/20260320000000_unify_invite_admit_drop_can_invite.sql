-- =============================================================================
-- Unify invite/admit: Drop orphaned can_invite_user_to_match
-- =============================================================================
-- Context: rpc_match_invite_user is already a thin wrapper around rpc_match_admit_user
-- (per 20260312050000). rpc_match_admission_targets uses can_admit_user_to_match.
-- can_invite_user_to_match was used by rpc_match_invite_targets (dropped in Phase 1).
-- No current function references can_invite_user_to_match.
--
-- Part A: Canonicalization
-- - Canonical predicate: can_admit_user_to_match
-- - Canonical write: rpc_match_admit_user
-- - rpc_match_invite_user: thin wrapper (organizer check + delegates to admit_user)
-- - can_invite_user_to_match: DROP (orphaned)
-- =============================================================================

DROP FUNCTION IF EXISTS public.can_invite_user_to_match(uuid, uuid, uuid);
