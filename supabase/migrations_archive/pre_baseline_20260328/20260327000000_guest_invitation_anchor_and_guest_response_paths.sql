-- Phase 1 foundation:
-- 1) add invitation anchor `match_participant_id`
-- 2) bind anchor in invitation create flow (strict/unique only)
-- 3) add guest accept/decline RPCs that operate on guest participant rows

-- -----------------------------------------------------------------------------
-- 1) Schema: add anchor field + index + consistency trigger
-- -----------------------------------------------------------------------------
ALTER TABLE public.email_invitations
  ADD COLUMN IF NOT EXISTS match_participant_id uuid NULL;

ALTER TABLE public.email_invitations
  DROP CONSTRAINT IF EXISTS email_invitations_match_participant_id_fkey;

ALTER TABLE public.email_invitations
  ADD CONSTRAINT email_invitations_match_participant_id_fkey
  FOREIGN KEY (match_participant_id)
  REFERENCES public.match_participants(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_invitations_match_participant_id
  ON public.email_invitations (match_participant_id);

CREATE OR REPLACE FUNCTION public.trg_email_invitation_anchor_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp_match_id uuid;
  v_mp_guest_id uuid;
BEGIN
  IF NEW.match_participant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.related_type <> 'match' THEN
    RAISE EXCEPTION 'anchor_requires_match_related_type';
  END IF;

  SELECT mp.match_id, mp.guest_id
  INTO v_mp_match_id, v_mp_guest_id
  FROM public.match_participants mp
  WHERE mp.id = NEW.match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anchor_match_participant_not_found';
  END IF;

  IF v_mp_match_id <> NEW.related_id THEN
    RAISE EXCEPTION 'anchor_participant_match_mismatch';
  END IF;

  IF v_mp_guest_id IS NULL THEN
    RAISE EXCEPTION 'anchor_requires_guest_participant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_invitation_anchor_consistency ON public.email_invitations;
CREATE TRIGGER trg_email_invitation_anchor_consistency
BEFORE INSERT OR UPDATE OF match_participant_id, related_type, related_id
ON public.email_invitations
FOR EACH ROW
EXECUTE FUNCTION public.trg_email_invitation_anchor_consistency();


-- -----------------------------------------------------------------------------
-- 2) Create flow: strict unique anchor binding if guest participant exists
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_create(
  p_target_email text,
  p_target_name text,
  p_related_type text,
  p_related_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_anchor_count int := 0;
  v_anchor_mp_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.organizer_id = v_uid) THEN
    RAISE EXCEPTION 'not_match_organizer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- Bind anchor only when there is exactly one active guest participant by match + email.
  -- Zero match: keep NULL (legacy/non-guest invitation path).
  -- Multi-match: fail fast, never guess.
  SELECT COUNT(*), MIN(mp.id)
  INTO v_anchor_count, v_anchor_mp_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_related_id
    AND mp.removed_at IS NULL
    AND lower(trim(coalesce(g.email, ''))) = lower(trim(p_target_email));

  IF v_anchor_count > 1 THEN
    RAISE EXCEPTION 'anchor_ambiguous_guest_participant';
  END IF;

  IF v_anchor_count = 0 THEN
    v_anchor_mp_id := NULL;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
  ) VALUES (
    v_uid, trim(lower(p_target_email)), NULLIF(trim(p_target_name), ''), p_related_type, p_related_id, p_expires_at, v_anchor_mp_id
  )
  RETURNING * INTO v_inv;

  INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
  VALUES (
    'invitation.email_invitation_created',
    'email_invitation',
    v_inv.id,
    v_uid,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'related_type', v_inv.related_type,
      'related_id', v_inv.related_id,
      'target_email', v_inv.target_email,
      'target_name', v_inv.target_name,
      'inviter_user_id', v_inv.inviter_user_id,
      'inviter_display_name', (SELECT display_name FROM public.profiles WHERE id = v_uid),
      'match_participant_id', v_inv.match_participant_id
    )
  );

  PERFORM public.rpc_process_domain_event((
    SELECT id
    FROM public.domain_events
    WHERE aggregate_id = v_inv.id
      AND event_type = 'invitation.email_invitation_created'
    ORDER BY created_at DESC
    LIMIT 1
  ));

  RETURN v_inv;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3) Guest accept/decline primary paths
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept_as_guest(
  p_invitation_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    SELECT COUNT(*), MIN(mp.id)
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  UPDATE public.match_participants
  SET participant_accepted_at = COALESCE(participant_accepted_at, now()),
      participant_accepted_via = COALESCE(participant_accepted_via, 'email_invitation')
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  UPDATE public.email_invitations
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', NULL);
  END IF;

  RETURN v_inv;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_decline_as_guest(
  p_invitation_id uuid,
  p_system_actor_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  IF p_system_actor_id IS NULL THEN
    RAISE EXCEPTION 'system_actor_required';
  END IF;

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    SELECT COUNT(*), MIN(mp.id)
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  -- Decline semantics: participant exits with withdraw-equivalent behavior.
  PERFORM public.apply_participant_exit(
    v_mp.id,
    p_system_actor_id,
    'withdraw',
    'Guest declined invitation via email'
  );

  UPDATE public.email_invitations
  SET status = 'declined',
      declined_at = COALESCE(declined_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', p_system_actor_id);
  END IF;

  RETURN v_inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) TO authenticated;
