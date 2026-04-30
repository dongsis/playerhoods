ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS gender text;

UPDATE public.guests
SET gender = 'unspecified'
WHERE gender IS NULL;

ALTER TABLE public.guests
  ALTER COLUMN gender SET DEFAULT 'unspecified';

ALTER TABLE public.guests
  ALTER COLUMN gender SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guests_gender_check'
      AND conrelid = 'public.guests'::regclass
  ) THEN
    ALTER TABLE public.guests
      ADD CONSTRAINT guests_gender_check
      CHECK (gender = ANY (ARRAY['male'::text, 'female'::text, 'unspecified'::text]));
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.rpc_roster_guest_create(text, text, text, text);
DROP FUNCTION IF EXISTS public.rpc_roster_guest_create(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.rpc_roster_guest_create(
  p_display_name text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_gender text DEFAULT NULL::text
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

COMMENT ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text) IS
'Create a Contact Player private record and link it to the canonical person layer. High-confidence email/phone matches reuse the existing person node. Gender is stored on the guest/contact record.';

GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_roster_guest_create(text, text, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_contact_player_resolution();

CREATE OR REPLACE FUNCTION public.rpc_contact_player_resolution()
RETURNS TABLE(
  guest_id uuid,
  display_name text,
  email text,
  phone text,
  notes text,
  gender text,
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
'Phase 2: Contact Player resolution. Returns caller roster guests with gender, linked_user_id (nullable), and resolution_state (contact_only | linked_user). Single source for guest vs registered-user logic.';

GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO anon;
GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_contact_player_resolution() TO service_role;
