CREATE OR REPLACE FUNCTION public.rpc_roster_guest_update(
  p_guest_id uuid,
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
  v_uid uuid := auth.uid();
  v_guest public.guests;
  v_display_name text := NULLIF(trim(COALESCE(p_display_name, '')), '');
  v_email text := NULLIF(trim(COALESCE(p_email, '')), '');
  v_phone text := NULLIF(trim(COALESCE(p_phone, '')), '');
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_gender text := NULLIF(lower(trim(COALESCE(p_gender, ''))), '');
  v_availability_status text := COALESCE(NULLIF(lower(trim(COALESCE(p_availability_status, ''))), ''), 'available');
  v_availability_note text := NULLIF(trim(COALESCE(p_availability_note, '')), '');
  v_availability_until date := NULLIF(trim(COALESCE(p_availability_until, '')), '')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_guest_id IS NULL THEN
    RAISE EXCEPTION 'guest_id_required';
  END IF;

  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'unspecified') THEN
    RAISE EXCEPTION 'invalid_gender';
  END IF;

  IF v_availability_status NOT IN ('available', 'busy', 'away', 'inactive') THEN
    RAISE EXCEPTION 'invalid_availability_status';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.guests g
  SET
    display_name = v_display_name,
    email = v_email,
    phone = v_phone,
    notes = v_notes,
    gender = COALESCE(v_gender, g.gender),
    availability_status = COALESCE(v_availability_status, g.availability_status),
    availability_note = v_availability_note,
    availability_until = v_availability_until
  WHERE g.id = p_guest_id
    AND g.status = 'active'
  RETURNING g.* INTO v_guest;

  IF v_guest.id IS NULL THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  RETURN v_guest;
END;
$$;

COMMENT ON FUNCTION public.rpc_roster_guest_update(uuid, text, text, text, text, text, text, text, text) IS
'Update a caller-owned Contact Player in roster with lightweight availability fields.';

GRANT ALL ON FUNCTION public.rpc_roster_guest_update(uuid, text, text, text, text, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_roster_guest_update(uuid, text, text, text, text, text, text, text, text) TO service_role;
