-- =============================================================================
-- Migration: 20260223201000_rpc_profile_set_display_name
--
-- New RPC: rpc_profile_set_display_name(p_display_name)
--
-- Purpose: Allow a user to directly set their global display_name.
--
-- Identity Model v1.5: per-club handle is deprecated as the display_name sync
-- path. This RPC provides a direct, first-class way to set the global name.
--
-- Gates:
--   1. Caller must be authenticated.
--   2. Name must be non-empty after trimming.
--   3. Max 50 characters (char_length, emoji-safe).
--   4. No control characters (U+0000–U+001F).
--
-- Note: this RPC intentionally does NOT update club_handle in club_identities.
-- The club handle ↔ display_name sync path (rpc_club_handle_set) continues to
-- work for clubs that still use it, but is considered legacy in v1.5+.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_profile_set_display_name(
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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_trimmed := trim(p_display_name);

  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  IF char_length(v_trimmed) > 50 THEN
    RAISE EXCEPTION 'display_name must be at most 50 characters';
  END IF;

  -- Reject control characters (non-printable ASCII)
  IF v_trimmed ~ '[\u0000-\u001F]' THEN
    RAISE EXCEPTION 'display_name contains invalid control characters';
  END IF;

  UPDATE public.profiles
  SET display_name = v_trimmed
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_profile_set_display_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_profile_set_display_name(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_profile_set_display_name(text) TO authenticated;

COMMIT;
