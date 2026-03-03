-- =============================================================================
-- Migration: 20260223200000_rpc_group_set_display_name
--
-- New RPC: rpc_group_set_display_name(p_group_id, p_display_name)
--
-- Purpose: Allow a group member to set (or clear) their group-scoped alias
-- (group_display_name) on their own group_members row.
--
-- Identity Model v1.5 display priority:
--   personal_remark (private, set by viewer) > group_display_name > display_name
--
-- Gates:
--   1. Caller must be authenticated.
--   2. Caller must be an active member of the group (removed_at IS NULL).
--
-- Clearing: pass empty string or whitespace-only → stored as NULL.
-- Length:   max 32 characters after trimming (v1.5 emoji-safe char_length).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_group_set_display_name(
  p_group_id     uuid,
  p_display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Normalize: empty/whitespace → NULL
  v_trimmed := NULLIF(trim(p_display_name), '');

  -- Length guard (32 chars, emoji-safe)
  IF v_trimmed IS NOT NULL AND char_length(v_trimmed) > 32 THEN
    RAISE EXCEPTION 'group_display_name must be at most 32 characters';
  END IF;

  -- (Optional) reject control chars
  -- IF v_trimmed IS NOT NULL AND v_trimmed ~ '[\u0000-\u001F]' THEN
  --   RAISE EXCEPTION 'group_display_name contains invalid control characters';
  -- END IF;

  -- Gate + write in one statement; ensure true active member
  UPDATE public.group_members
  SET group_display_name = v_trimmed
  WHERE group_id = p_group_id
    AND user_id  = auth.uid()
    AND status   = 'active'
    AND removed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not an active member of this group';
  END IF;
END;
$$; 