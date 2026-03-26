-- Identity reconcile: link guest participants to user by email.
-- Works for ALL email types: nominate, invite, time change, remove, game formed.
-- When contact player receives any email and later registers, reconcile links them.
-- Call from app on dashboard AND match detail (user may land from any email link).

-- 1) RPC: reconcile guest participants by user's auth email
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

  -- Link all guest match participants whose guest.email matches user's auth email
  -- Includes removed participants (they may have received remove email before signing up)
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, v_uid, 'guest_participant', mp.id, v_uid
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE lower(trim(g.email)) = v_email
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.rpc_reconcile_identity_guest_participants() IS
'Link guest participants to current user by email. Works for nominate, invite, time change, remove, game formed. Idempotent.';

GRANT EXECUTE ON FUNCTION public.rpc_reconcile_identity_guest_participants() TO authenticated;

-- 2) matches RLS: allow identity-linked users to see matches
DROP POLICY IF EXISTS matches_select_visibility ON public.matches;
CREATE POLICY matches_select_visibility ON public.matches
  FOR SELECT TO authenticated
  USING (
    organizer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = matches.id AND mp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      JOIN public.identity_links il ON il.linked_type = 'guest_participant' AND il.linked_id = mp.id AND il.user_id = auth.uid()
      WHERE mp.match_id = matches.id
    )
    OR public.is_caller_in_match_scope(id)
  );

-- 3) match_participants RLS: allow identity-linked users to see their guest rows
CREATE POLICY match_participants_select_identity_linked
ON public.match_participants FOR SELECT TO authenticated
USING (
  guest_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.identity_links il
    WHERE il.linked_type = 'guest_participant'
      AND il.linked_id = match_participants.id
      AND il.user_id = auth.uid()
  )
);

-- 4) is_user_match_associated: include identity-linked guest participants
CREATE OR REPLACE FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = p_user_id
      AND mp.status <> 'removed'
  )
  OR EXISTS (
    SELECT 1
    FROM public.match_participants mp
    JOIN public.identity_links il ON il.linked_type = 'guest_participant' AND il.linked_id = mp.id AND il.user_id = p_user_id
    WHERE mp.match_id = p_match_id
  );
$$;

COMMENT ON FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
IS 'v1.6.3: Returns true if user has participant row (direct or via identity_links).';
