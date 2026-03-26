CREATE OR REPLACE FUNCTION public.rpc_match_invite_guest_from_roster(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match public.matches;
  v_mp    public.match_participants;
BEGIN
  -- ------------------------------------------------------------
  -- 1. Auth check
  -- ------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ------------------------------------------------------------
  -- 2. Match existence
  -- ------------------------------------------------------------
  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- ------------------------------------------------------------
  -- 3. Match must be active
  -- ------------------------------------------------------------
  IF v_match.status <> 'active'::public.match_status THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- ------------------------------------------------------------
  -- 4. Organizer-only invite
  -- ------------------------------------------------------------
  IF v_match.organizer_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;

  -- ------------------------------------------------------------
  -- 5. Guest must be in caller's personal roster
  -- ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = auth.uid()
      AND urg.guest_id      = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  -- ------------------------------------------------------------
  -- 6. Guest must exist and be active
  -- ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  -- ------------------------------------------------------------
  -- 7. Insert participant row
  -- ------------------------------------------------------------
  INSERT INTO public.match_participants(
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    created_at,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmed_at
  )
  VALUES (
    p_match_id,
    'pending'::public.match_participant_status,
    'invited'::public.match_join_method,
    p_guest_id,
    auth.uid(),
    now(),
    now(),          -- organizer auto-approves invite
    auth.uid(),
    NULL,           -- guest has not accepted
    NULL,
    NULL
  )
  RETURNING * INTO v_mp;

  -- ------------------------------------------------------------
  -- 8. Reconcile (if function exists)
  -- ------------------------------------------------------------
  BEGIN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN v_mp;
END;
$$;
-- 🔐 必须写完整签名
GRANT EXECUTE ON FUNCTION public.rpc_match_invite_guest_from_roster(uuid, uuid)
TO authenticated;

COMMIT;