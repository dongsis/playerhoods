-- =============================================================================
-- Phase 1: Remove legacy target RPCs
-- rpc_match_admission_targets is the single match candidate read model.
-- API layer (getInviteTargets, getNominateTargets) now calls it directly.
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_invite_targets(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_invite_targets(uuid);
DROP FUNCTION IF EXISTS public.rpc_match_nominate_targets(uuid);
