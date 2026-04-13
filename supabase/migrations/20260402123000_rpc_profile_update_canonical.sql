DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text);
DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL::text,
  p_last_name text DEFAULT NULL::text,
  p_contact_channel text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_contact_phone text DEFAULT NULL::text,
  p_show_in_venue_member_discovery boolean DEFAULT NULL::boolean,
  p_allow_non_group_invites boolean DEFAULT NULL::boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email', 'sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    show_in_venue_member_discovery = CASE
      WHEN p_show_in_venue_member_discovery IS NOT NULL THEN p_show_in_venue_member_discovery
      ELSE show_in_venue_member_discovery
    END,
    allow_non_group_invites = CASE
      WHEN p_allow_non_group_invites IS NOT NULL THEN p_allow_non_group_invites
      ELSE allow_non_group_invites
    END,
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean)
IS 'Canonical profile update RPC. Includes contact preferences and global venue discovery/invite switches.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean) TO service_role;
