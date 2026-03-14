-- Reconcile identity after magic link signup: link invitation + guest participants by email

CREATE OR REPLACE FUNCTION public.rpc_reconcile_identity_after_magic_link(
  p_user_id uuid,
  p_verified_email text,
  p_invitation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_email text := lower(trim(p_verified_email));
BEGIN
  IF v_email = '' OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1) Link invitation
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  VALUES ('email', v_email, p_user_id, 'invitation_target', p_invitation_id, p_user_id)
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;

  -- 2) Link guest match participants by email (guests.email = verified_email)
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, p_user_id, 'guest_participant', mp.id, p_user_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE lower(trim(g.email)) = v_email
    AND mp.removed_at IS NULL
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.rpc_reconcile_identity_after_magic_link(uuid, text, uuid) IS
'Link invitation + guest participants to user after magic link signup. Idempotent.';

GRANT EXECUTE ON FUNCTION public.rpc_reconcile_identity_after_magic_link(uuid, text, uuid) TO authenticated;

-- Call reconcile from rpc_email_invitation_accept after successful accept
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept(p_invitation_id uuid)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
  v_existing_mp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match' THEN
    SELECT mp.id INTO v_existing_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_inv.related_id AND mp.user_id = v_uid AND mp.removed_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      UPDATE public.email_invitations SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
      WHERE id = p_invitation_id AND status = 'pending';
      SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
      IF v_inv.status = 'accepted' THEN
        INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
        VALUES (v_inv.id, 'invitation_accepted', v_uid);
      END IF;
      PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
      RETURN v_inv;
    END IF;
    PERFORM public.rpc_match_accept_email_invitation(v_inv.related_id, v_uid, p_invitation_id);
  END IF;

  UPDATE public.email_invitations
  SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', v_uid);
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES ('invitation.accepted', 'email_invitation', v_inv.id, v_uid, jsonb_build_object('invitation_id', v_inv.id, 'accepted_by_user_id', v_uid));
    PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
  END IF;
  RETURN v_inv;
END;
$$;
