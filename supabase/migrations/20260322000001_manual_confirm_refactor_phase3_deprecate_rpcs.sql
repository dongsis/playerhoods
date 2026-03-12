-- =============================================================================
-- Manual Confirm Refactor Phase 3: Deprecate manual_confirm RPCs
-- Frontend now uses composed calls: delegate_confirm + org_approve, admit_user + delegate_confirm.
-- These RPCs are stubbed to raise a deprecation error.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_match_manual_confirm — stub
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm(p_match_participant_id uuid, p_note text DEFAULT NULL)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_delegate_confirm_and_org_approve'
    USING HINT = 'Call rpc_match_delegate_confirm_participant then rpc_match_org_approve_participant';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm(uuid, text) IS
'DEPRECATED: Use rpc_match_delegate_confirm_participant + rpc_match_org_approve_participant. Stub raises deprecated_use_delegate_confirm_and_org_approve.';

-- -----------------------------------------------------------------------------
-- 2) rpc_match_manual_confirm_user — stub
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_admit_user_and_delegate_confirm'
    USING HINT = 'Call rpc_match_admit_user (or rpc_match_invite_user for organizer) then rpc_match_delegate_confirm_participant';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) IS
'DEPRECATED: Use rpc_match_admit_user + rpc_match_delegate_confirm_participant. Stub raises deprecated_use_admit_user_and_delegate_confirm.';
