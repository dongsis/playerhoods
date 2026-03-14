-- v1.7: Deprecate all add_guest / invite_guest_from_roster RPCs uniformly.
--       They create dual admission semantics (direct confirmed vs nominate flow).
--       DROP all overloads, leave single deprecated stub per RPC to eliminate overload risk.
--
-- Use: rpc_match_nominate_guest + rpc_match_delegate_confirm_guest + rpc_match_org_approve_participant

-- =============================================================================
-- 1) DROP all overloads
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_add_guest_org(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_add_guest_org(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_add_guest_participant(uuid, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_add_guest_participant(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_match_invite_guest_from_roster(uuid, uuid);

-- =============================================================================
-- 2) Create single deprecated stub per RPC (no overloads)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model: use rpc_match_nominate_guest instead';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_add_guest_org(uuid, text, text, text) IS
'DEPRECATED. Use rpc_match_nominate_guest. Old direct-confirmed path conflicted with nominate flow.';

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model: use rpc_match_nominate_guest instead';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_add_guest_participant(uuid, text, text, text) IS
'DEPRECATED. Use rpc_match_nominate_guest. Old direct-confirmed path conflicted with nominate flow.';

CREATE OR REPLACE FUNCTION public.rpc_match_invite_guest_from_roster(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_use_nominate_guest_model: use rpc_match_nominate_guest instead';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_guest_from_roster(uuid, uuid) IS
'DEPRECATED. Use rpc_match_nominate_guest. Old path conflicted with nominate flow.';

-- Re-grant (DROP removes grants)
GRANT EXECUTE ON FUNCTION public.rpc_match_add_guest_org(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_match_add_guest_participant(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_match_invite_guest_from_roster(uuid, uuid) TO authenticated;
