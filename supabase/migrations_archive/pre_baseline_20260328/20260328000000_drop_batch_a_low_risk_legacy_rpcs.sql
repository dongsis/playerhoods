-- =============================================================================
-- Batch A: Drop low-risk legacy RPCs
-- Scope: only remove functions already classified as "Can Remove Now"
-- =============================================================================

-- Invitation flow status tracker RPC (unused in current app call chain)
DROP FUNCTION IF EXISTS public.rpc_email_invitation_update_flow_status(uuid, text);
