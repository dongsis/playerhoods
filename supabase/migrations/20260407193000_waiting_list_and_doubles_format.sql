ALTER TYPE public.match_participant_status ADD VALUE IF NOT EXISTS 'waiting_list';

DO $$
BEGIN
  CREATE TYPE public.match_doubles_format AS ENUM (
    'open',
    'mens_doubles',
    'womens_doubles',
    'mixed_doubles'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TYPE public.match_doubles_format OWNER TO postgres;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS doubles_format public.match_doubles_format DEFAULT 'open'::public.match_doubles_format;

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS waiting_list_at timestamp with time zone;

UPDATE public.profiles
SET gender = 'unspecified'
WHERE gender IS NULL OR gender NOT IN ('male', 'female', 'unspecified');

ALTER TABLE public.profiles
  ALTER COLUMN gender SET DEFAULT 'unspecified'::text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_gender_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'unspecified'::text]));
  END IF;
END;
$$;

COMMENT ON COLUMN public.matches.doubles_format IS 'Organizer-set doubles roster target. Guides needed display and waiting-list auto-fill, but does not hard-block approvals.';
COMMENT ON COLUMN public.match_participants.waiting_list_at IS 'Timestamp when a fully-ready participant was moved onto the waiting list.';

DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[]);

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
  p_gender text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preferred_play_times text[] := NULL;
  v_gender text := NULL;
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
      AND trim(raw_value) NOT IN (
        'weekday_mornings',
        'weekday_afternoons',
        'weekday_evenings',
        'saturday_mornings',
        'saturday_afternoons',
        'sunday_mornings',
        'sunday_afternoons',
        'flexible'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_preferred_play_times';
  END IF;

  IF p_gender IS NOT NULL THEN
    v_gender := NULLIF(trim(lower(p_gender)), '');
    IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'unspecified') THEN
      RAISE EXCEPTION 'invalid_gender';
    END IF;
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
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text)
IS 'Canonical profile update RPC. Includes contact preferences, trust-building profile fields, and gender for doubles roster guidance.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text) TO service_role;
