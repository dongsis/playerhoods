ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS availability_status text,
  ADD COLUMN IF NOT EXISTS availability_until date;

UPDATE public.profiles
SET availability_status = 'available'
WHERE availability_status IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN availability_status SET DEFAULT 'available',
  ALTER COLUMN availability_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_availability_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_availability_status_check
      CHECK (availability_status IN ('available', 'busy', 'away', 'inactive'));
  END IF;
END
$$;

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS availability_status text,
  ADD COLUMN IF NOT EXISTS availability_note text,
  ADD COLUMN IF NOT EXISTS availability_until date;

UPDATE public.guests
SET availability_status = 'available'
WHERE availability_status IS NULL;

ALTER TABLE public.guests
  ALTER COLUMN availability_status SET DEFAULT 'available',
  ALTER COLUMN availability_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guests_availability_status_check'
      AND conrelid = 'public.guests'::regclass
  ) THEN
    ALTER TABLE public.guests
      ADD CONSTRAINT guests_availability_status_check
      CHECK (availability_status IN ('available', 'busy', 'away', 'inactive'));
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text);
DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text);

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
IS 'Canonical profile update RPC. Includes contact preferences, trust-building profile fields, gender, Shared Group join preference, and lightweight availability status.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_roster_guest_create(text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_roster_guest_create(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_roster_guest_create(
  p_display_name text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_gender text DEFAULT NULL::text,
  p_availability_status text DEFAULT NULL::text,
  p_availability_note text DEFAULT NULL::text,
  p_availability_until text DEFAULT NULL::text
)
RETURNS public.guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guest public.guests;
  v_person_id uuid;
  v_matched_user_id uuid;
  v_norm_email text := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_norm_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
  v_gender text := COALESCE(NULLIF(lower(trim(COALESCE(p_gender, ''))), ''), 'unspecified');
  v_availability_status text := COALESCE(NULLIF(lower(trim(COALESCE(p_availability_status, ''))), ''), 'available');
  v_availability_until date := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  IF v_gender <> ALL (ARRAY['male'::text, 'female'::text, 'unspecified'::text]) THEN
    RAISE EXCEPTION 'invalid_gender';
  END IF;

  IF v_availability_status NOT IN ('available', 'busy', 'away', 'inactive') THEN
    RAISE EXCEPTION 'invalid_availability_status';
  END IF;

  IF NULLIF(trim(COALESCE(p_availability_until, '')), '') IS NOT NULL THEN
    BEGIN
      v_availability_until := trim(p_availability_until)::date;
    EXCEPTION
      WHEN others THEN
        RAISE EXCEPTION 'invalid_availability_until';
    END;
  END IF;

  IF v_norm_email IS NOT NULL THEN
    SELECT u.id
    INTO v_matched_user_id
    FROM auth.users u
    WHERE lower(trim(u.email::text)) = v_norm_email
    LIMIT 1;
  END IF;

  IF v_matched_user_id IS NOT NULL THEN
    v_person_id := public.resolve_person_id_for_user(v_matched_user_id);
  END IF;

  IF v_person_id IS NULL THEN
    SELECT g.person_id
    INTO v_person_id
    FROM public.guests g
    WHERE g.person_id IS NOT NULL
      AND (
        (v_norm_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = v_norm_email)
        OR (
          v_norm_phone IS NOT NULL
          AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = v_norm_phone
        )
      )
    ORDER BY g.created_at
    LIMIT 1;
  END IF;

  IF v_person_id IS NULL THEN
    INSERT INTO public.people (
      person_type,
      display_name,
      linked_user_id,
      status
    )
    VALUES (
      CASE WHEN v_matched_user_id IS NOT NULL THEN 'linked_hybrid' ELSE 'limited_contact' END,
      btrim(p_display_name),
      v_matched_user_id,
      'active'
    )
    RETURNING person_id INTO v_person_id;
  END IF;

  INSERT INTO public.guests(
    display_name,
    email,
    phone,
    notes,
    gender,
    availability_status,
    availability_note,
    availability_until,
    status,
    created_by,
    created_at,
    person_id
  )
  VALUES (
    btrim(p_display_name),
    p_email,
    p_phone,
    p_notes,
    v_gender,
    v_availability_status,
    NULLIF(trim(p_availability_note), ''),
    v_availability_until,
    'active',
    auth.uid(),
    now(),
    v_person_id
  )
  RETURNING * INTO v_guest;

  INSERT INTO public.user_roster_guests(
    owner_user_id,
    guest_id,
    created_by,
    created_at
  )
  SELECT
    auth.uid(),
    v_guest.id,
    auth.uid(),
    now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = auth.uid()
      AND urg.guest_id = v_guest.id
  );

  INSERT INTO public.contact_records (
    owner_user_id,
    person_id,
    guest_id,
    raw_name,
    raw_phone,
    raw_email,
    owner_notes,
    source
  )
  VALUES (
    auth.uid(),
    v_person_id,
    v_guest.id,
    v_guest.display_name,
    v_guest.phone,
    v_guest.email,
    v_guest.notes,
    'manual'
  );

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type)
  SELECT auth.uid(), v_person_id, 'direct_contact'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = auth.uid()
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'direct_contact'
  );

  RETURN v_guest;
END;
$$;

COMMENT ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) IS
'Create a Contact Player private record and link it to the canonical person layer. High-confidence email or phone matches reuse the existing person node. Gender and lightweight availability status are stored on the guest/contact record.';

GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_contact_player_resolution();

CREATE OR REPLACE FUNCTION public.rpc_contact_player_resolution()
RETURNS TABLE(
  guest_id uuid,
  display_name text,
  email text,
  phone text,
  notes text,
  gender text,
  availability_status text,
  availability_note text,
  availability_until date,
  linked_user_id uuid,
  resolution_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.id AS guest_id,
    g.display_name,
    g.email,
    g.phone,
    g.notes,
    g.gender,
    g.availability_status,
    g.availability_note,
    g.availability_until,
    il.user_id AS linked_user_id,
    CASE WHEN il.user_id IS NOT NULL THEN 'linked_user'::text ELSE 'contact_only'::text END AS resolution_state
  FROM public.user_roster_guests urg
  JOIN public.guests g ON g.id = urg.guest_id
  LEFT JOIN public.identity_links il
    ON il.linked_type = 'guest'
   AND il.linked_id = g.id
  WHERE urg.owner_user_id = auth.uid()
    AND g.status = 'active'
  ORDER BY g.display_name;
END;
$$;

COMMENT ON FUNCTION public.rpc_contact_player_resolution() IS
'Phase 2: Contact Player resolution. Returns caller roster guests with gender, lightweight availability status, linked_user_id (nullable), and resolution_state (contact_only | linked_user).';

GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO anon;
GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO service_role;
