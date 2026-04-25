CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL::text,
  p_last_name text DEFAULT NULL::text,
  p_contact_channel text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text,
  p_contact_phone text DEFAULT NULL::text,
  p_show_in_venue_member_discovery boolean DEFAULT NULL::boolean,
  p_allow_non_group_invites boolean DEFAULT NULL::boolean,
  p_looking_to_play text DEFAULT NULL::text,
  p_preferred_play_times text[] DEFAULT NULL::text[],
  p_gender text DEFAULT NULL::text,
  p_shared_group_join_preference text DEFAULT NULL::text,
  p_availability_status text DEFAULT NULL::text,
  p_availability_note text DEFAULT NULL::text,
  p_availability_until text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preferred_play_times text[] := NULL;
  v_gender text := NULL;
  v_shared_group_join_preference text := NULL;
  v_availability_status text := NULL;
  v_availability_until date := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_looking_to_play IS NOT NULL
    AND NULLIF(trim(p_looking_to_play), '') IS NOT NULL
    AND trim(p_looking_to_play) NOT IN (
      'very_open',
      'open',
      'occasional',
      'quite_full',
      'not_looking'
    ) THEN
    RAISE EXCEPTION 'invalid_looking_to_play';
  END IF;

  IF p_preferred_play_times IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_preferred_play_times) AS raw_value
    WHERE NULLIF(trim(raw_value), '') IS NOT NULL
      AND char_length(trim(raw_value)) > 80
  ) THEN
    RAISE EXCEPTION 'invalid_preferred_play_times';
  END IF;

  IF p_gender IS NOT NULL THEN
    v_gender := NULLIF(trim(lower(p_gender)), '');
    IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'unspecified') THEN
      RAISE EXCEPTION 'invalid_gender';
    END IF;
  END IF;

  IF p_shared_group_join_preference IS NOT NULL THEN
    v_shared_group_join_preference := NULLIF(trim(lower(p_shared_group_join_preference)), '');
    IF v_shared_group_join_preference IS NOT NULL
      AND v_shared_group_join_preference NOT IN (
        'approval_required_all',
        'auto_join_enabled_sports',
        'auto_join_all'
      ) THEN
      RAISE EXCEPTION 'invalid_shared_group_join_preference';
    END IF;
  END IF;

  IF p_availability_status IS NOT NULL THEN
    v_availability_status := COALESCE(NULLIF(trim(lower(p_availability_status)), ''), 'available');
    IF v_availability_status NOT IN ('available', 'busy', 'away', 'inactive') THEN
      RAISE EXCEPTION 'invalid_availability_status';
    END IF;
  END IF;

  IF p_availability_until IS NOT NULL AND NULLIF(trim(p_availability_until), '') IS NOT NULL THEN
    BEGIN
      v_availability_until := trim(p_availability_until)::date;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'invalid_availability_until';
    END;
  END IF;

  IF p_preferred_play_times IS NOT NULL THEN
    SELECT COALESCE(array_agg(value ORDER BY value), '{}'::text[])
      INTO v_preferred_play_times
    FROM (
      SELECT DISTINCT trim(raw_value) AS value
      FROM unnest(p_preferred_play_times) AS raw_value
      WHERE NULLIF(trim(raw_value), '') IS NOT NULL
    ) deduped;
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
    shared_group_join_preference = CASE
      WHEN p_shared_group_join_preference IS NOT NULL THEN COALESCE(v_shared_group_join_preference, 'approval_required_all')
      ELSE shared_group_join_preference
    END,
    looking_to_play = CASE
      WHEN p_looking_to_play IS NOT NULL THEN NULLIF(trim(p_looking_to_play), '')
      ELSE looking_to_play
    END,
    preferred_play_times = CASE
      WHEN p_preferred_play_times IS NOT NULL THEN v_preferred_play_times
      ELSE preferred_play_times
    END,
    gender = CASE
      WHEN p_gender IS NOT NULL THEN COALESCE(v_gender, 'unspecified')
      ELSE gender
    END,
    availability_status = CASE
      WHEN p_availability_status IS NOT NULL THEN COALESCE(v_availability_status, 'available')
      ELSE availability_status
    END,
    availability_note = CASE
      WHEN p_availability_note IS NOT NULL THEN NULLIF(trim(p_availability_note), '')
      ELSE availability_note
    END,
    availability_until = CASE
      WHEN p_availability_until IS NOT NULL THEN v_availability_until
      ELSE availability_until
    END,
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text)
IS 'Canonical profile update RPC. Includes contact preferences, trust-building profile fields, gender, Shared Group join preference, lightweight availability status, and preset or custom preferred times.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO service_role;
