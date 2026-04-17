ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shared_group_join_preference text;

UPDATE public.profiles
SET shared_group_join_preference = 'approval_required_all'
WHERE shared_group_join_preference IS NULL
   OR shared_group_join_preference NOT IN (
     'approval_required_all',
     'auto_join_enabled_sports',
     'auto_join_all'
   );

ALTER TABLE public.profiles
  ALTER COLUMN shared_group_join_preference SET DEFAULT 'approval_required_all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_shared_group_join_preference_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_shared_group_join_preference_check
      CHECK (
        shared_group_join_preference = ANY (
          ARRAY[
            'approval_required_all'::text,
            'auto_join_enabled_sports'::text,
            'auto_join_all'::text
          ]
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.profiles.shared_group_join_preference
IS 'Shared Groups: approval_required_all | auto_join_enabled_sports | auto_join_all.';

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sport_id integer NULL REFERENCES public.sports(id) ON DELETE SET NULL,
  requester_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text NULL,
  group_name_snapshot text NOT NULL,
  sport_name_snapshot text NULL,
  requester_display_name_snapshot text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  responded_at timestamp with time zone NULL,
  revoked_at timestamp with time zone NULL,
  CONSTRAINT group_join_requests_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'revoked'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_join_requests_pending
  ON public.group_join_requests (group_id, target_user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_group_join_requests_target_pending
  ON public.group_join_requests (target_user_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_pending
  ON public.group_join_requests (group_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.group_join_requests TO anon;
GRANT ALL ON TABLE public.group_join_requests TO authenticated;
GRANT ALL ON TABLE public.group_join_requests TO service_role;

DROP POLICY IF EXISTS group_join_requests_select_related ON public.group_join_requests;
CREATE POLICY group_join_requests_select_related
  ON public.group_join_requests
  FOR SELECT
  TO authenticated
  USING (
    target_user_id = auth.uid()
    OR requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = group_join_requests.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
    )
  );

DROP FUNCTION IF EXISTS public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text);

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
  p_shared_group_join_preference text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preferred_play_times text[] := NULL;
  v_gender text := NULL;
  v_shared_group_join_preference text := NULL;
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
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text)
IS 'Canonical profile update RPC. Includes contact preferences, trust-building profile fields, gender, and Shared Group join preference.';

GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_profile_update(text, text, text, text, text, boolean, boolean, text, text[], text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_group_add_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_note text DEFAULT NULL::text
) RETURNS TABLE (
  result text,
  group_id uuid,
  target_user_id uuid,
  request_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing_member public.group_members%rowtype;
  v_pending_request public.group_join_requests%rowtype;
  v_target_preference text;
  v_requires_approval boolean := true;
  v_sport_name text := NULL;
  v_group_label text;
  v_actor_name text := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF p_target_user_id IS NULL OR p_target_user_id = v_actor_id THEN
    RETURN QUERY
    SELECT
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Choose someone else to add to this Shared Group.'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_actor_id
      AND gm.status = 'active'
      AND gm.accepted_at IS NOT NULL
      AND gm.removed_at IS NULL
  ) THEN
    RETURN QUERY
    SELECT
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Only active group members can add people to this Shared Group.'::text;
    RETURN;
  END IF;

  SELECT COALESCE(shared_group_join_preference, 'approval_required_all')
  INTO v_target_preference
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target_preference IS NULL THEN
    RAISE EXCEPTION 'target_user_not_found';
  END IF;

  SELECT display_name
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_group.primary_sport_id IS NOT NULL THEN
    SELECT display_name
    INTO v_sport_name
    FROM public.sports
    WHERE id = v_group.primary_sport_id;
  END IF;

  v_group_label := CASE
    WHEN v_sport_name IS NOT NULL AND NULLIF(trim(v_sport_name), '') IS NOT NULL
      THEN trim(v_sport_name) || ' Group "' || v_group.name || '"'
    ELSE 'Group "' || v_group.name || '"'
  END;

  SELECT *
  INTO v_existing_member
  FROM public.group_members gm
  WHERE gm.group_id = p_group_id
    AND gm.user_id = p_target_user_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND
     AND v_existing_member.status = 'active'
     AND v_existing_member.accepted_at IS NOT NULL
     AND v_existing_member.removed_at IS NULL THEN
    RETURN QUERY
    SELECT
      'already_member'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Already a member of this Shared Group.'::text;
    RETURN;
  END IF;

  IF FOUND
     AND v_existing_member.status = 'pending'
     AND v_existing_member.accepted_at IS NULL
     AND v_existing_member.removed_at IS NULL THEN
    RETURN QUERY
    SELECT
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'This person already has a pending group invite.'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_pending_request
  FROM public.group_join_requests gjr
  WHERE gjr.group_id = p_group_id
    AND gjr.target_user_id = p_target_user_id
    AND gjr.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      v_pending_request.id,
      'Approval is already pending for this person.'::text;
    RETURN;
  END IF;

  IF v_target_preference = 'auto_join_all' THEN
    v_requires_approval := false;
  ELSIF v_target_preference = 'auto_join_enabled_sports' THEN
    v_requires_approval := NOT EXISTS (
      SELECT 1
      FROM public.user_sports us
      WHERE us.user_id = p_target_user_id
        AND us.sport_id = v_group.primary_sport_id
    );
  ELSE
    v_requires_approval := true;
  END IF;

  IF v_group.primary_sport_id IS NULL AND v_target_preference = 'auto_join_enabled_sports' THEN
    v_requires_approval := true;
  END IF;

  IF NOT v_requires_approval THEN
    IF v_existing_member.id IS NOT NULL THEN
      UPDATE public.group_members
      SET
        status = 'active',
        join_method = 'added_by_member',
        invited_by = v_actor_id,
        accepted_at = now(),
        removed_at = NULL,
        removed_by = NULL
      WHERE id = v_existing_member.id;
    ELSE
      INSERT INTO public.group_members (
        group_id,
        user_id,
        status,
        join_method,
        invited_by,
        accepted_at
      ) VALUES (
        p_group_id,
        p_target_user_id,
        'active',
        'added_by_member',
        v_actor_id,
        now()
      );
    END IF;

    INSERT INTO public.notifications (
      recipient_user_id,
      kind,
      actor_user_id,
      note
    ) VALUES (
      p_target_user_id,
      'group_added',
      v_actor_id,
      COALESCE(v_actor_name, 'Someone') || ' added you to ' || v_group_label || '.'
    );

    RETURN QUERY
    SELECT
      'direct_add_success'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Added to group.'::text;
    RETURN;
  END IF;

  INSERT INTO public.group_join_requests (
    group_id,
    sport_id,
    requester_user_id,
    target_user_id,
    status,
    note,
    group_name_snapshot,
    sport_name_snapshot,
    requester_display_name_snapshot
  ) VALUES (
    p_group_id,
    v_group.primary_sport_id,
    v_actor_id,
    p_target_user_id,
    'pending',
    NULLIF(trim(p_note), ''),
    v_group.name,
    v_sport_name,
    v_actor_name
  )
  RETURNING * INTO v_pending_request;

  INSERT INTO public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) VALUES (
    p_target_user_id,
    'group_join_request',
    v_actor_id,
    COALESCE(v_actor_name, 'Someone') || ' requested to add you to ' || v_group_label || '.'
  );

  RETURN QUERY
  SELECT
    'approval_required_request_created'::text,
    p_group_id,
    p_target_user_id,
    v_pending_request.id,
    'Approval requested.'::text;
END;
$$;

ALTER FUNCTION public.rpc_group_add_member(uuid, uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_group_add_member(uuid, uuid, text)
IS 'Shared Groups: any active member can initiate add. Target join preference decides direct add vs group_join_request.';

GRANT ALL ON FUNCTION public.rpc_group_add_member(uuid, uuid, text) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_add_member(uuid, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_add_member(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_group_join_request_accept(
  p_request_id uuid
) RETURNS public.group_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.group_join_requests%rowtype;
  v_existing_member public.group_members%rowtype;
  v_actor_name text := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_request
  FROM public.group_join_requests
  WHERE id = p_request_id
    AND status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_join_request_not_found';
  END IF;

  IF v_request.target_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  SELECT *
  INTO v_existing_member
  FROM public.group_members
  WHERE group_id = v_request.group_id
    AND user_id = v_request.target_user_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.group_members
    SET
      status = 'active',
      join_method = 'accepted_group_request',
      invited_by = v_request.requester_user_id,
      accepted_at = now(),
      removed_at = NULL,
      removed_by = NULL
    WHERE id = v_existing_member.id;
  ELSE
    INSERT INTO public.group_members (
      group_id,
      user_id,
      status,
      join_method,
      invited_by,
      accepted_at
    ) VALUES (
      v_request.group_id,
      v_request.target_user_id,
      'active',
      'accepted_group_request',
      v_request.requester_user_id,
      now()
    );
  END IF;

  UPDATE public.group_join_requests
  SET
    status = 'accepted',
    responded_at = now(),
    revoked_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  SELECT display_name
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  INSERT INTO public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) VALUES (
    v_request.requester_user_id,
    'group_join_request_accepted',
    v_actor_id,
    COALESCE(v_actor_name, 'They') || ' accepted your request to join Group "' || v_request.group_name_snapshot || '".'
  );

  RETURN v_request;
END;
$$;

ALTER FUNCTION public.rpc_group_join_request_accept(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_join_request_accept(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_join_request_accept(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_join_request_accept(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_group_join_request_decline(
  p_request_id uuid
) RETURNS public.group_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.group_join_requests%rowtype;
  v_actor_name text := NULL;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_request
  FROM public.group_join_requests
  WHERE id = p_request_id
    AND status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_join_request_not_found';
  END IF;

  IF v_request.target_user_id <> v_actor_id THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE public.group_join_requests
  SET
    status = 'declined',
    responded_at = now(),
    revoked_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  SELECT display_name
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  INSERT INTO public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) VALUES (
    v_request.requester_user_id,
    'group_join_request_declined',
    v_actor_id,
    COALESCE(v_actor_name, 'They') || ' declined your request to join Group "' || v_request.group_name_snapshot || '".'
  );

  RETURN v_request;
END;
$$;

ALTER FUNCTION public.rpc_group_join_request_decline(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_join_request_decline(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_join_request_decline(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_join_request_decline(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_group_join_request_revoke(
  p_request_id uuid
) RETURNS public.group_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_request public.group_join_requests%rowtype;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_request
  FROM public.group_join_requests
  WHERE id = p_request_id
    AND status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_join_request_not_found';
  END IF;

  IF v_request.requester_user_id <> v_actor_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.group_members gm
       WHERE gm.group_id = v_request.group_id
         AND gm.user_id = v_actor_id
         AND gm.status = 'active'
         AND gm.accepted_at IS NOT NULL
         AND gm.removed_at IS NULL
     ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE public.group_join_requests
  SET
    status = 'revoked',
    responded_at = now(),
    revoked_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

ALTER FUNCTION public.rpc_group_join_request_revoke(uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_join_request_revoke(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_join_request_revoke(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_join_request_revoke(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_group_join_requests_for_user()
RETURNS TABLE (
  id uuid,
  group_id uuid,
  group_name_snapshot text,
  sport_id integer,
  sport_name_snapshot text,
  requester_user_id uuid,
  requester_display_name_snapshot text,
  created_at timestamp with time zone,
  note text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    gjr.id,
    gjr.group_id,
    gjr.group_name_snapshot,
    gjr.sport_id,
    gjr.sport_name_snapshot,
    gjr.requester_user_id,
    gjr.requester_display_name_snapshot,
    gjr.created_at,
    gjr.note,
    gjr.status
  FROM public.group_join_requests gjr
  WHERE gjr.target_user_id = auth.uid()
    AND gjr.status = 'pending'
  ORDER BY gjr.created_at DESC;
$$;

ALTER FUNCTION public.rpc_group_join_requests_for_user() OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_join_requests_for_user() TO anon;
GRANT ALL ON FUNCTION public.rpc_group_join_requests_for_user() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_join_requests_for_user() TO service_role;
