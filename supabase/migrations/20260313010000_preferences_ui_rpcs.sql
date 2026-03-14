-- =============================================================================
-- Migration: Preferences UI — minimal RPC support
-- Purpose: Allow UI to read/write global and club-scoped preference settings
-- Scope: Extend rpc_profile_update; add rpc_club_identity_set_preferences
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extend rpc_profile_update to accept global preference switches
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_contact_channel text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_show_in_club_member_discovery boolean DEFAULT NULL,
  p_allow_non_group_invites boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name      = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name       = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email','sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email   = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone   = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    show_in_club_member_discovery = CASE WHEN p_show_in_club_member_discovery IS NOT NULL THEN p_show_in_club_member_discovery ELSE show_in_club_member_discovery END,
    allow_non_group_invites       = CASE WHEN p_allow_non_group_invites IS NOT NULL THEN p_allow_non_group_invites ELSE allow_non_group_invites END,
    updated_at      = now()
  WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean) IS
'v1.7 + Phase 1: Update profile. Includes global preference switches: show_in_club_member_discovery, allow_non_group_invites.';

-- -----------------------------------------------------------------------------
-- 2) rpc_club_identity_set_preferences — update club-scoped overrides
-- Caller can only update their own row.
-- p_visible: 'true'|'false'|'inherit' (inherit = set to NULL). NULL = don't change.
-- p_accept: same.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_club_identity_set_preferences(
  p_club_id uuid,
  p_visible_in_club_member_discovery text DEFAULT NULL,
  p_accept_non_group_invites_in_club text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.club_identities
  SET
    visible_in_club_member_discovery = CASE
      WHEN p_visible_in_club_member_discovery = 'inherit' THEN NULL
      WHEN p_visible_in_club_member_discovery = 'true' THEN true
      WHEN p_visible_in_club_member_discovery = 'false' THEN false
      ELSE visible_in_club_member_discovery
    END,
    accept_non_group_invites_in_club = CASE
      WHEN p_accept_non_group_invites_in_club = 'inherit' THEN NULL
      WHEN p_accept_non_group_invites_in_club = 'true' THEN true
      WHEN p_accept_non_group_invites_in_club = 'false' THEN false
      ELSE accept_non_group_invites_in_club
    END
  WHERE club_id = p_club_id AND user_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.rpc_club_identity_set_preferences(uuid, text, text) IS
'Phase 1: Set club-scoped preference overrides. Values: true|false|inherit. inherit = use global (NULL). Only updates own row.';

GRANT EXECUTE ON FUNCTION public.rpc_club_identity_set_preferences(uuid, text, text) TO authenticated;
