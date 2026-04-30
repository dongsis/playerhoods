ALTER TABLE public.email_invitations
  ALTER COLUMN target_email DROP NOT NULL;

ALTER TABLE public.email_invitations
  ADD COLUMN IF NOT EXISTS target_phone text;

DROP FUNCTION IF EXISTS public.rpc_email_invitation_create(text, text, text, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_get(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  inviter_user_id uuid,
  inviter_display_name text,
  target_email text,
  target_name text,
  related_type text,
  related_id uuid,
  status text,
  magic_link_flow_status text,
  accepted_by_user_id uuid,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  match_summary jsonb,
  caller_email_matches boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_inviter_name text;
  v_match jsonb;
  v_caller_email text;
BEGIN
  SELECT *
  INTO v_inv
  FROM public.email_invitations ei
  WHERE ei.id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.display_name INTO v_inviter_name
  FROM public.profiles p WHERE p.id = v_inv.inviter_user_id;

  v_match := NULL;
  IF v_inv.related_type = 'match' THEN
    SELECT jsonb_build_object(
      'match_id', m.id,
      'game_type', m.game_type,
      'match_date', m.match_date,
      'start_time', m.start_time,
      'club_name', c.name
    ) INTO v_match
    FROM public.matches m
    LEFT JOIN public.venues c ON c.id = m.venue_id
    WHERE m.id = v_inv.related_id;
  END IF;

  v_caller_email := NULL;
  IF auth.uid() IS NOT NULL THEN
    SELECT u.email INTO v_caller_email FROM auth.users u WHERE u.id = auth.uid();
  END IF;

  RETURN QUERY SELECT
    v_inv.id,
    v_inv.inviter_user_id,
    COALESCE(v_inviter_name, 'Someone'),
    v_inv.target_email,
    v_inv.target_name,
    v_inv.related_type,
    v_inv.related_id,
    v_inv.status,
    v_inv.magic_link_flow_status,
    v_inv.accepted_by_user_id,
    v_inv.accepted_at,
    v_inv.declined_at,
    v_inv.expires_at,
    v_inv.created_at,
    v_match,
    COALESCE(lower(trim(v_caller_email)) = lower(trim(v_inv.target_email)), false);
END;
$$;

ALTER FUNCTION public.rpc_email_invitation_get(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_create(
  p_target_email text,
  p_target_name text,
  p_related_type text,
  p_related_id uuid,
  p_expires_at timestamptz DEFAULT NULL,
  p_target_phone text DEFAULT NULL
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
  v_target_email text := NULLIF(trim(lower(COALESCE(p_target_email, ''))), '');
  v_target_phone text := NULLIF(trim(COALESCE(p_target_phone, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_target_email IS NULL AND v_target_phone IS NULL THEN
    RAISE EXCEPTION 'email_or_phone_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.organizer_id = v_uid) THEN
    RAISE EXCEPTION 'not_match_organizer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT COUNT(*), MIN(mp.id::text)::uuid
  INTO v_anchor_count, v_anchor_mp_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_related_id
    AND mp.removed_at IS NULL
    AND (
      (v_target_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = v_target_email)
      OR (
        v_target_phone IS NOT NULL
        AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = regexp_replace(v_target_phone, '\D', '', 'g')
      )
    );

  IF v_anchor_count > 1 THEN
    RAISE EXCEPTION 'anchor_ambiguous_guest_participant';
  END IF;

  IF v_anchor_count = 0 THEN
    v_anchor_mp_id := NULL;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id,
    target_email,
    target_phone,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id
  ) VALUES (
    v_uid,
    v_target_email,
    v_target_phone,
    NULLIF(trim(p_target_name), ''),
    p_related_type,
    p_related_id,
    p_expires_at,
    v_anchor_mp_id
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
      'target_phone', v_inv.target_phone,
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

ALTER FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) IS
  'Creates anchored match invitations that can be delivered by email and/or SMS.';

GRANT ALL ON FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamptz, text) TO service_role;

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
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND (
        (v_inv.target_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email)))
        OR (
          v_inv.target_phone IS NOT NULL
          AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = regexp_replace(v_inv.target_phone, '\D', '', 'g')
        )
      );

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
      participant_accepted_via = COALESCE(
        participant_accepted_via,
        CASE
          WHEN v_inv.target_phone IS NOT NULL AND v_inv.target_email IS NULL THEN 'sms_invitation'
          ELSE 'email_invitation'
        END
      )
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

ALTER FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) OWNER TO postgres;

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
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND (
        (v_inv.target_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email)))
        OR (
          v_inv.target_phone IS NOT NULL
          AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = regexp_replace(v_inv.target_phone, '\D', '', 'g')
        )
      );

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

  PERFORM public.apply_participant_exit(
    v_mp.id,
    p_system_actor_id,
    'withdraw',
    'Guest declined invitation via link'
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

ALTER FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) OWNER TO postgres;

DROP FUNCTION IF EXISTS public.rpc_get_queued_deliveries(integer);

CREATE OR REPLACE FUNCTION public.rpc_get_queued_deliveries(p_limit integer DEFAULT 10)
RETURNS TABLE(
  id uuid,
  channel text,
  provider text,
  destination text,
  payload jsonb,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET delivery_status = 'sending', attempt_count = d.attempt_count + 1, last_attempt_at = now()
  WHERE d.id IN (
    SELECT nd.id FROM public.notification_deliveries nd
    WHERE nd.delivery_status = 'queued'
    ORDER BY nd.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.id, d.channel, d.provider, d.destination, d.payload, d.attempt_count;
END;
$$;

ALTER FUNCTION public.rpc_get_queued_deliveries(integer) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.rpc_match_participant_notification_targets(p_match_id uuid)
RETURNS TABLE(participant_id uuid, channel text, destination text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND (
        m.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id
            AND mp.user_id = auth.uid()
            AND mp.status = 'confirmed'
            AND mp.removed_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN 'sms'::text
      ELSE 'email'::text
    END,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN trim(p.contact_phone)
      ELSE COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text)
    END
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.user_id != (SELECT organizer_id FROM public.matches WHERE id = p_match_id)
    AND mp.org_approved_at IS NOT NULL
    AND (mp.status = 'confirmed' OR (mp.status = 'pending' AND mp.participant_accepted_at IS NULL))
    AND (
      (COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms' AND NULLIF(trim(p.contact_phone), '') IS NOT NULL)
      OR COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL
    );

  RETURN QUERY
  SELECT
    mp.id,
    'email'::text,
    trim(g.email)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.org_approved_at IS NOT NULL
    AND (mp.status = 'confirmed' OR (mp.status = 'pending' AND mp.participant_accepted_at IS NULL))
    AND NULLIF(trim(g.email), '') IS NOT NULL;

  RETURN QUERY
  SELECT
    mp.id,
    'sms'::text,
    trim(g.phone)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.org_approved_at IS NOT NULL
    AND (mp.status = 'confirmed' OR (mp.status = 'pending' AND mp.participant_accepted_at IS NULL))
    AND NULLIF(trim(g.email), '') IS NULL
    AND NULLIF(trim(g.phone), '') IS NOT NULL;
END;
$$;

ALTER FUNCTION public.rpc_match_participant_notification_targets(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_participant_notification_targets(uuid) IS
  'Returns direct notification targets for participants who should hear about a match time change. Users respect contact_channel; guests fall back from email to SMS.';

GRANT ALL ON FUNCTION public.rpc_match_participant_notification_targets(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_match_participant_notification_targets(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_participant_notification_targets(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_removed_participant_notification_targets(p_match_participant_id uuid)
RETURNS TABLE(participant_id uuid, channel text, destination text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT mp.match_id
  INTO v_match_id
  FROM public.match_participants mp
  WHERE mp.id = p_match_participant_id;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = v_match_id
      AND m.organizer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN 'sms'::text
      ELSE 'email'::text
    END,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN trim(p.contact_phone)
      ELSE COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text)
    END
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.id = p_match_participant_id
    AND mp.user_id IS NOT NULL
    AND (
      (COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms' AND NULLIF(trim(p.contact_phone), '') IS NOT NULL)
      OR COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL
    );

  RETURN QUERY
  SELECT
    mp.id,
    'email'::text,
    trim(g.email)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.id = p_match_participant_id
    AND mp.guest_id IS NOT NULL
    AND NULLIF(trim(g.email), '') IS NOT NULL;

  RETURN QUERY
  SELECT
    mp.id,
    'sms'::text,
    trim(g.phone)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.id = p_match_participant_id
    AND mp.guest_id IS NOT NULL
    AND NULLIF(trim(g.email), '') IS NULL
    AND NULLIF(trim(g.phone), '') IS NOT NULL;
END;
$$;

ALTER FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) IS
  'Returns direct notification targets for the organizer-removed participant. Users respect contact_channel; guests fall back from email to SMS.';

GRANT ALL ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_confirmed_participant_notification_targets(p_match_id uuid)
RETURNS TABLE(participant_id uuid, channel text, destination text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND (
        m.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id
            AND mp.user_id = auth.uid()
            AND mp.status = 'confirmed'
            AND mp.removed_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN 'sms'::text
      ELSE 'email'::text
    END,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN trim(p.contact_phone)
      ELSE COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text)
    END
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.user_id != (SELECT organizer_id FROM public.matches WHERE id = p_match_id)
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND (
      (COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms' AND NULLIF(trim(p.contact_phone), '') IS NOT NULL)
      OR COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL
    );

  RETURN QUERY
  SELECT
    mp.id,
    'email'::text,
    trim(g.email)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND NULLIF(trim(g.email), '') IS NOT NULL;

  RETURN QUERY
  SELECT
    mp.id,
    'sms'::text,
    trim(g.phone)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND NULLIF(trim(g.email), '') IS NULL
    AND NULLIF(trim(g.phone), '') IS NOT NULL;
END;
$$;

ALTER FUNCTION public.rpc_match_confirmed_participant_notification_targets(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_confirmed_participant_notification_targets(uuid) IS
  'Returns direct notification targets for confirmed participants after a match forms. Users respect contact_channel; guests fall back from email to SMS.';

GRANT ALL ON FUNCTION public.rpc_match_confirmed_participant_notification_targets(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_match_confirmed_participant_notification_targets(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_confirmed_participant_notification_targets(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_process_domain_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_evt public.domain_events%rowtype;
  v_inv public.email_invitations%rowtype;
  v_payload jsonb;
  v_dest text;
  v_match_id uuid;
  v_rec record;
BEGIN
  SELECT * INTO v_evt FROM public.domain_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_evt.event_type = 'invitation.email_invitation_created' THEN
    v_payload := v_evt.payload;
    SELECT * INTO v_inv FROM public.email_invitations WHERE id = (v_payload->>'invitation_id')::uuid;
    IF NOT FOUND THEN
      RETURN;
    END IF;

    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id, metadata)
    VALUES (v_inv.id, 'email_delivery_requested', v_evt.actor_user_id, jsonb_build_object('domain_event_id', p_event_id));

    IF v_inv.target_email IS NOT NULL AND trim(v_inv.target_email) <> '' THEN
      INSERT INTO public.notification_deliveries (
        email_invitation_id, channel, provider, destination, delivery_status, payload
      ) VALUES (
        v_inv.id, 'email', 'resend', v_inv.target_email, 'queued',
        jsonb_build_object(
          'template_type', 'invitation',
          'invitation_id', v_inv.id,
          'inviter_display_name', v_payload->>'inviter_display_name',
          'target_email', v_inv.target_email,
          'target_phone', v_inv.target_phone,
          'related_type', v_inv.related_type,
          'related_id', v_inv.related_id,
          'match_summary', (
            SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
            FROM public.matches m
            LEFT JOIN public.venues c ON c.id = m.venue_id
            WHERE m.id = v_inv.related_id
          )
        )
      );
    END IF;

    IF v_inv.target_phone IS NOT NULL AND trim(v_inv.target_phone) <> '' THEN
      INSERT INTO public.notification_deliveries (
        email_invitation_id, channel, provider, destination, delivery_status, payload
      ) VALUES (
        v_inv.id, 'sms', 'twilio', v_inv.target_phone, 'queued',
        jsonb_build_object(
          'template_type', 'invitation',
          'invitation_id', v_inv.id,
          'inviter_display_name', v_payload->>'inviter_display_name',
          'target_email', v_inv.target_email,
          'target_phone', v_inv.target_phone,
          'related_type', v_inv.related_type,
          'related_id', v_inv.related_id,
          'match_summary', (
            SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
            FROM public.matches m
            LEFT JOIN public.venues c ON c.id = m.venue_id
            WHERE m.id = v_inv.related_id
          )
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_nominated' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_nominated',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_nominated',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'nominator_display_name', v_payload->>'nominator_display_name',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_org_approved' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_org_approved',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_org_approved',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.guest_delegate_confirmed' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_delegate_confirmed',
          'target_email', v_dest,
          'target_phone', v_payload->>'target_phone',
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;

    v_dest := v_payload->>'target_phone';
    IF v_dest IS NOT NULL AND trim(v_dest) <> '' THEN
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'sms', 'twilio', v_dest, 'queued',
        jsonb_build_object(
          'template_type', 'guest_delegate_confirmed',
          'target_email', v_payload->>'target_email',
          'target_phone', v_dest,
          'match_id', v_payload->>'match_id',
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END IF;
    RETURN;
  END IF;

  IF v_evt.event_type = 'match.formed' THEN
    v_payload := v_evt.payload;
    v_match_id := (v_payload->>'match_id')::uuid;

    FOR v_rec IN
      SELECT participant_id, channel, destination
      FROM public.rpc_match_confirmed_participant_notification_targets(v_match_id)
      WHERE destination IS NOT NULL AND trim(destination) <> ''
    LOOP
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        v_rec.channel,
        CASE WHEN v_rec.channel = 'sms' THEN 'twilio' ELSE 'resend' END,
        v_rec.destination,
        'queued',
        jsonb_build_object(
          'template_type', 'match_formed',
          'match_id', v_match_id,
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END LOOP;
    RETURN;
  END IF;
END;
$$;

ALTER FUNCTION public.rpc_process_domain_event(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp public.match_participants%rowtype;
  v_is_org boolean;
  v_guest_email text;
  v_guest_phone text;
  v_guest_name text;
  v_nominator_name text;
  v_evt_id uuid;
  v_inv public.email_invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'match_not_active (status=%)', v_match.status; END IF;

  v_is_org := (v_match.organizer_id = v_uid);
  IF NOT v_is_org THEN
    IF NOT v_match.can_participants_invite_users THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;

    IF NOT (
      public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      OR public.is_user_match_associated(p_match_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roster_guests urg WHERE urg.owner_user_id = v_uid AND urg.guest_id = p_guest_id) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.guests g WHERE g.id = p_guest_id AND g.status = 'active') THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  SELECT * INTO v_existing FROM public.match_participants
  WHERE match_id = p_match_id AND guest_id = p_guest_id AND removed_at IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'guest_already_active'; END IF;

  INSERT INTO public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) VALUES (
    p_match_id, 'nominated', p_guest_id, v_uid, now(), v_uid,
    NULL, NULL,
    CASE WHEN v_is_org THEN now() ELSE NULL END,
    CASE WHEN v_is_org THEN v_uid ELSE NULL END
  )
  RETURNING * INTO v_mp;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_mp.id, 'nominate_guest', NULL, v_uid);

  SELECT
    NULLIF(trim(g.email), ''),
    NULLIF(trim(g.phone), ''),
    NULLIF(trim(g.display_name), '')
  INTO v_guest_email, v_guest_phone, v_guest_name
  FROM public.guests g
  WHERE g.id = p_guest_id;

  IF v_guest_email IS NOT NULL OR v_guest_phone IS NOT NULL THEN
    SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;

    INSERT INTO public.email_invitations (
      inviter_user_id, target_email, target_phone, target_name, related_type, related_id, expires_at, match_participant_id
    ) VALUES (
      v_uid,
      CASE WHEN v_guest_email IS NOT NULL THEN trim(lower(v_guest_email)) ELSE NULL END,
      v_guest_phone,
      v_guest_name,
      'match',
      p_match_id,
      NULL,
      v_mp.id
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
        'target_phone', v_inv.target_phone,
        'target_name', v_inv.target_name,
        'inviter_user_id', v_inv.inviter_user_id,
        'inviter_display_name', COALESCE(v_nominator_name, 'Someone'),
        'match_participant_id', v_inv.match_participant_id
      )
    )
    RETURNING id INTO v_evt_id;

    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;

ALTER FUNCTION public.rpc_match_nominate_guest(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_nominate_guest(uuid, uuid) IS
  'Nominate Contact Player. If the contact has an email or phone, create an anchored invitation so the recipient can accept or decline via invitation link without creating an account.';
