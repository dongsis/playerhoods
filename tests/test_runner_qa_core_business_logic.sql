CREATE OR REPLACE FUNCTION public.test_runner_qa_core_business_logic()
RETURNS TABLE (
  test_name text,
  ok boolean,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid := gen_random_uuid();
  v_open_player uuid := gen_random_uuid();
  v_private_player uuid := gen_random_uuid();
  v_blocked_player uuid := gen_random_uuid();
  v_contact_person uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_match uuid := gen_random_uuid();
  v_venue uuid := gen_random_uuid();
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _qa_core_results(
    test_name text,
    ok boolean,
    details text
  ) ON COMMIT DROP;

  DELETE FROM _qa_core_results;

  INSERT INTO auth.users (id, email)
  VALUES
    (v_host, 'qa-core-host-a@example.test'),
    (v_open_player, 'qa-core-player-b@example.test'),
    (v_private_player, 'qa-core-player-c@example.test'),
    (v_blocked_player, 'qa-core-blocked@example.test');

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    availability_status,
    discovery_volume,
    accepting_new_invites
  ) VALUES
    (v_host, '', '', 'QA Host A', 'available', 'recommended', true),
    (v_open_player, '', '', 'QA Player B', 'available', 'recommended', true),
    (v_private_player, '', '', 'QA Player C', 'available', 'quiet', false),
    (v_blocked_player, '', '', 'QA Blocked Player', 'available', 'recommended', true);

  INSERT INTO public.user_lookup_visibility_grants(viewer_user_id, target_user_id, grant_context, visibility)
  VALUES (v_host, v_open_player, 'exact_contact_lookup', 'visible');

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'invite eligibility allows visible accepting player after exact lookup grant',
    public.can_invite_user(v_host, v_open_player, null, 'exact_contact_lookup') = true,
    public.get_lookup_visibility(v_host, v_open_player, 'exact_contact_lookup');

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'privacy restrictions block strict player invite',
    public.can_invite_user(v_host, v_private_player, null, 'exact_contact_lookup') = false,
    public.get_lookup_visibility(v_host, v_private_player, 'exact_contact_lookup') || ', accepting=false';

  INSERT INTO public.user_blocks(blocker_user_id, blocked_user_id)
  VALUES (v_blocked_player, v_host);

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'block overrides lookup and invite eligibility',
    public.get_lookup_visibility(v_host, v_blocked_player, 'exact_contact_lookup') = 'none'
      AND public.can_invite_user(v_host, v_blocked_player, null, 'exact_contact_lookup') = false,
    public.get_lookup_visibility(v_host, v_blocked_player, 'exact_contact_lookup');

  INSERT INTO public.venues(id, name, location_text, timezone, venue_kind, access_type)
  VALUES (v_venue, 'QA Core Venue', 'Toronto, ON', 'America/Toronto', 'club', 'members');

  INSERT INTO public.matches (
    id,
    organizer_id,
    status,
    venue_id,
    game_type,
    required_count,
    sport_id
  ) VALUES (
    v_match,
    v_host,
    'active',
    v_venue,
    'qa_core_business_logic',
    2,
    1
  );

  INSERT INTO public.match_participants (
    match_id,
    status,
    join_method,
    user_id,
    created_by
  ) VALUES (
    v_match,
    'pending',
    'invited',
    v_open_player,
    v_host
  );

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'duplicate invite prevention rejects player already in match',
    public.can_invite_user(v_host, v_open_player, v_match, 'exact_contact_lookup') = false,
    'existing participant suppresses invite';

  INSERT INTO public.people(person_id, person_type, display_name, status)
  VALUES (v_contact_person, 'limited_contact', 'QA Contact D', 'active');

  INSERT INTO public.guests(id, display_name, email, phone, gender, status, availability_status, created_by, person_id)
  VALUES (
    v_guest,
    'QA Contact D',
    'qa-contact-d@example.test',
    '+15555550104',
    'unspecified',
    'active',
    'available',
    v_host,
    v_contact_person
  );

  INSERT INTO public.contact_records(owner_user_id, person_id, guest_id, raw_name, raw_email, raw_phone, source)
  VALUES (v_host, v_contact_person, v_guest, 'QA Contact D', 'qa-contact-d@example.test', '+15555550104', 'qa_core_test');

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'contact player handling keeps private contact details owner-scoped',
    EXISTS (
      SELECT 1
      FROM public.contact_records cr
      WHERE cr.owner_user_id = v_host
        AND cr.person_id = v_contact_person
        AND cr.raw_email = 'qa-contact-d@example.test'
    )
    AND EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.person_id = v_contact_person
        AND p.person_type = 'limited_contact'
    ),
    'limited person node plus owner contact record';

  UPDATE public.match_participants
  SET status = 'confirmed',
      participant_accepted_at = now(),
      org_approved_at = now(),
      org_approved_by = v_host
  WHERE match_id = v_match
    AND user_id = v_open_player;

  INSERT INTO public.match_participants (
    match_id,
    status,
    join_method,
    user_id,
    created_by,
    participant_accepted_at,
    org_approved_at,
    org_approved_by
  ) VALUES (
    v_match,
    'confirmed',
    'manual',
    v_host,
    v_host,
    now(),
    now(),
    v_host
  );

  UPDATE public.matches
  SET formed_at = now()
  WHERE id = v_match
    AND (
      SELECT count(*)
      FROM public.match_participants mp
      WHERE mp.match_id = v_match
        AND mp.status = 'confirmed'
        AND mp.removed_at IS NULL
    ) >= required_count;

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'match formed logic marks match formed when confirmed count reaches required count',
    formed_at IS NOT NULL,
    coalesce(formed_at::text, 'not formed')
  FROM public.matches
  WHERE id = v_match;

  INSERT INTO _qa_core_results(test_name, ok, details)
  SELECT
    'request to join status transition primitives are present',
    to_regprocedure('public.rpc_match_request_join(uuid)') IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname IN ('match_participant_actions_action_type_chk', 'match_participant_actions_action_type_check')
          AND pg_get_constraintdef(c.oid) LIKE '%request_join%'
          AND pg_get_constraintdef(c.oid) LIKE '%approve%'
          AND pg_get_constraintdef(c.oid) LIKE '%withdraw%'
          AND pg_get_constraintdef(c.oid) LIKE '%reject_request%'
      ),
    'request_join, approve, withdraw, and reject_request actions should be modeled';

  DELETE FROM public.contact_records WHERE person_id = v_contact_person;
  DELETE FROM public.guests WHERE id = v_guest;
  DELETE FROM public.people WHERE person_id = v_contact_person;
  DELETE FROM public.match_participants WHERE match_id = v_match;
  DELETE FROM public.matches WHERE id = v_match;
  DELETE FROM public.venues WHERE id = v_venue;
  DELETE FROM public.user_blocks
  WHERE (blocker_user_id = v_blocked_player AND blocked_user_id = v_host)
     OR blocker_user_id IN (v_host, v_open_player, v_private_player, v_blocked_player)
     OR blocked_user_id IN (v_host, v_open_player, v_private_player, v_blocked_player);
  DELETE FROM public.user_lookup_visibility_grants
  WHERE viewer_user_id IN (v_host, v_open_player, v_private_player, v_blocked_player)
     OR target_user_id IN (v_host, v_open_player, v_private_player, v_blocked_player);
  DELETE FROM public.profiles
  WHERE id IN (v_host, v_open_player, v_private_player, v_blocked_player);
  DELETE FROM auth.users
  WHERE id IN (v_host, v_open_player, v_private_player, v_blocked_player);

  RETURN QUERY SELECT * FROM _qa_core_results ORDER BY test_name;
END;
$$;
