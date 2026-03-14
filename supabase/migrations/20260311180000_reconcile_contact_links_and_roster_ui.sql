-- 1) Extend reconcile: also create contact links (guest_id -> user_id)
--    When guest participant email matches user, link the guest (contact) to user.
--    Owner can then see "已加入 playerhoods.com" and Invite to Group.

CREATE OR REPLACE FUNCTION public.rpc_reconcile_identity_guest_participants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(trim(u.email::text)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- 1a) Link guest match participants (guest_participant)
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, v_uid, 'guest_participant', mp.id, v_uid
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE lower(trim(g.email)) = v_email
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;

  -- 1b) Link guests (contact) — so roster owner can see "已加入" and Invite to Group
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, v_uid, 'contact', g.id, v_uid
  FROM public.guests g
  WHERE lower(trim(g.email)) = v_email
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.rpc_reconcile_identity_guest_participants() IS
'Link guest participants + contact (guest) to current user by email. Idempotent.';

-- 2) RPC: roster owner checks which guests have contact links (became users)
--    Returns (guest_id, user_id) for caller's roster guests that have identity_links(linked_type='contact').

CREATE OR REPLACE FUNCTION public.rpc_roster_guest_contact_links(p_guest_ids uuid[])
RETURNS TABLE (guest_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.id AS guest_id, il.user_id
  FROM unnest(p_guest_ids) AS gid
  JOIN public.guests g ON g.id = gid
  JOIN public.user_roster_guests urg ON urg.guest_id = g.id AND urg.owner_user_id = auth.uid()
  JOIN public.identity_links il ON il.linked_type = 'contact' AND il.linked_id = g.id
  WHERE il.user_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.rpc_roster_guest_contact_links(uuid[]) IS
'For roster owner: which of my guests have registered (identity_links contact). Returns guest_id, user_id for Invite to Group.';

GRANT EXECUTE ON FUNCTION public.rpc_roster_guest_contact_links(uuid[]) TO authenticated;
