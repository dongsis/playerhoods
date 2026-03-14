-- =============================================================================
-- Migration: Play Network Core — Step 2: Minimal Invite Circle RPCs
-- Purpose: Save, remove, list for Invite Circle. Private, one-way, silent.
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, playerhoods_five_pillars_implementation_v1.md
-- Scope: RPC-only. No discovery, match invite, can_*, UI, triggers, events.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_invite_circle_save_user
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_invite_circle_save_user(
  p_target_user_id uuid,
  p_source text DEFAULT 'manual'
)
RETURNS public.user_invite_circle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_row   public.user_invite_circle;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_save_self';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('manual', 'played_with_auto') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  -- Idempotent + race-safe: ON CONFLICT DO UPDATE with no-op returns existing row
  INSERT INTO public.user_invite_circle (owner_user_id, target_user_id, source)
  VALUES (v_uid, p_target_user_id, p_source)
  ON CONFLICT (owner_user_id, target_user_id)
  DO UPDATE SET source = user_invite_circle.source  -- no-op: keep existing
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_invite_circle_save_user(uuid, text) IS
'Phase 1: Save target to caller Invite Circle. Idempotent. Private, silent, no notification.';

GRANT EXECUTE ON FUNCTION public.rpc_invite_circle_save_user(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2) rpc_invite_circle_remove_user
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_invite_circle_remove_user(p_target_user_id uuid)
RETURNS TABLE(removed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_del int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.user_invite_circle
  WHERE owner_user_id = v_uid AND target_user_id = p_target_user_id;

  GET DIAGNOSTICS v_del = ROW_COUNT;

  RETURN QUERY SELECT (v_del > 0);
END;
$$;

COMMENT ON FUNCTION public.rpc_invite_circle_remove_user(uuid) IS
'Phase 1: Remove target from caller Invite Circle. Idempotent (no error if not present).';

GRANT EXECUTE ON FUNCTION public.rpc_invite_circle_remove_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) rpc_invite_circle_list
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_invite_circle_list()
RETURNS TABLE(
  id uuid,
  owner_user_id uuid,
  target_user_id uuid,
  source text,
  created_at timestamptz,
  target_display_name text,
  target_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    uic.id,
    uic.owner_user_id,
    uic.target_user_id,
    uic.source,
    uic.created_at,
    p.display_name AS target_display_name,   -- profiles.display_name
    p.avatar_url AS target_avatar_url       -- profiles.avatar_url
  FROM public.user_invite_circle uic
  LEFT JOIN public.profiles p ON p.id = uic.target_user_id
  WHERE uic.owner_user_id = v_uid
  ORDER BY uic.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.rpc_invite_circle_list() IS
'Phase 1: List caller Invite Circle. Owner-only. Ordered by created_at desc.';

GRANT EXECUTE ON FUNCTION public.rpc_invite_circle_list() TO authenticated;
