-- =============================================================================
-- Drop deprecated manual_confirm RPCs (physical removal)
-- Replaced by composed calls: delegate_confirm + org_approve, admit_user + delegate_confirm.
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_manual_confirm(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_manual_confirm_user(uuid, uuid);
