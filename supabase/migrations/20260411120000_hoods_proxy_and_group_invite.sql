CREATE TABLE IF NOT EXISTS public.match_group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_group_invitations_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_match_group_invitation
  ON public.match_group_invitations (match_id, group_id)
  WHERE status = 'active' AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_match_group_invitations_match
  ON public.match_group_invitations (match_id, status, created_at DESC);

COMMENT ON TABLE public.match_group_invitations IS
  'Group-level invitations for matches. These do not create participant rows until a registered group member accepts.';

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_dashboard()
RETURNS TABLE(
  binding_id uuid,
  principal_person_id uuid,
  proxy_user_id uuid,
  scope text,
  status text,
  requested_by_user_id uuid,
  invited_via text,
  invited_to text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  principal_name text,
  principal_linked_user_id uuid,
  proxy_name text,
  relationship_role text,
  can_approve boolean,
  can_decline boolean,
  can_revoke boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid := public.find_person_id_for_user(auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    pmp.binding_id,
    pmp.principal_person_id,
    pmp.proxy_user_id,
    pmp.scope,
    pmp.status,
    pmp.requested_by_user_id,
    pmp.invited_via,
    pmp.invited_to,
    pmp.confirmed_at,
    pmp.rejected_at,
    pmp.revoked_at,
    pmp.created_at,
    pmp.updated_at,
    COALESCE(NULLIF(trim(principal.display_name), ''), pmp.principal_person_id::text) AS principal_name,
    principal.linked_user_id AS principal_linked_user_id,
    COALESCE(NULLIF(trim(proxy_profile.display_name), ''), pmp.proxy_user_id::text) AS proxy_name,
    CASE
      WHEN pmp.principal_person_id = v_person_id THEN 'for_me'
      WHEN pmp.proxy_user_id = v_uid THEN 'i_act_for'
      ELSE 'related'
    END AS relationship_role,
    (
      pmp.principal_person_id = v_person_id
      AND principal.linked_user_id = v_uid
      AND pmp.status = 'pending'
    ) AS can_approve,
    (
      pmp.principal_person_id = v_person_id
      AND principal.linked_user_id = v_uid
      AND pmp.status = 'pending'
    ) AS can_decline,
    (
      pmp.principal_person_id = v_person_id
      AND pmp.status IN ('pending', 'active')
    ) AS can_revoke
  FROM public.person_match_proxies pmp
  LEFT JOIN public.people principal
    ON principal.person_id = pmp.principal_person_id
  LEFT JOIN public.profiles proxy_profile
    ON proxy_profile.id = pmp.proxy_user_id
  WHERE pmp.proxy_user_id = v_uid
     OR pmp.principal_person_id = v_person_id
  ORDER BY
    CASE pmp.status
      WHEN 'pending' THEN 0
      WHEN 'active' THEN 1
      WHEN 'revoked' THEN 2
      WHEN 'rejected' THEN 3
      ELSE 4
    END,
    pmp.updated_at DESC,
    pmp.created_at DESC;
END;
$$;

ALTER FUNCTION public.rpc_match_proxy_dashboard() OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_proxy_dashboard()
IS 'Returns the caller-visible Match Proxy bindings with resolved names and in-app action flags for the Hoods Proxy management view.';

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_approve_binding(p_binding_id uuid)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid := public.find_person_id_for_user(auth.uid());
  v_row public.person_match_proxies;
  v_principal public.people%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  SELECT * INTO v_principal
  FROM public.people
  WHERE person_id = v_row.principal_person_id;

  IF NOT FOUND OR v_row.principal_person_id <> v_person_id OR v_principal.linked_user_id <> v_uid THEN
    RAISE EXCEPTION 'not_binding_principal';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'binding_not_pending';
  END IF;

  RETURN public.activate_match_proxy_binding(
    p_binding_id,
    'self_authenticated',
    'in_app_approval'
  );
END;
$$;

ALTER FUNCTION public.rpc_match_proxy_approve_binding(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_proxy_approve_binding(uuid)
IS 'In-app approval for pending Match Proxy bindings when the principal is the authenticated registered user.';

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_decline_binding(p_binding_id uuid)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid := public.find_person_id_for_user(auth.uid());
  v_row public.person_match_proxies;
  v_principal public.people%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  SELECT * INTO v_principal
  FROM public.people
  WHERE person_id = v_row.principal_person_id;

  IF NOT FOUND OR v_row.principal_person_id <> v_person_id OR v_principal.linked_user_id <> v_uid THEN
    RAISE EXCEPTION 'not_binding_principal';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'binding_not_pending';
  END IF;

  RETURN public.reject_match_proxy_binding(
    p_binding_id,
    'self_authenticated',
    'in_app_decline'
  );
END;
$$;

ALTER FUNCTION public.rpc_match_proxy_decline_binding(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_proxy_decline_binding(uuid)
IS 'In-app decline for pending Match Proxy bindings when the principal is the authenticated registered user.';

CREATE OR REPLACE FUNCTION public.rpc_match_invite_group(p_match_id uuid, p_group_id uuid)
RETURNS TABLE(group_id uuid, group_name text, status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_group public.groups%rowtype;
  v_row public.match_group_invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.primary_sport_id IS NOT NULL AND v_group.primary_sport_id <> v_match.sport_id THEN
    RAISE EXCEPTION 'group_sport_mismatch';
  END IF;

  SELECT * INTO v_row
  FROM public.match_group_invitations
  WHERE match_id = p_match_id
    AND group_id = p_group_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.match_group_invitations
    SET
      invited_by_user_id = v_uid,
      status = 'active',
      revoked_at = NULL,
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.match_group_invitations (
      match_id,
      group_id,
      invited_by_user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      p_match_id,
      p_group_id,
      v_uid,
      'active',
      now(),
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY
  SELECT v_row.group_id, v_group.name, v_row.status, v_row.created_at;
END;
$$;

ALTER FUNCTION public.rpc_match_invite_group(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_invite_group(uuid, uuid)
IS 'Creates or reactivates a group-level invitation for a match. No participant rows are created until a registered member accepts.';

CREATE OR REPLACE FUNCTION public.rpc_match_group_invitations(p_match_id uuid)
RETURNS TABLE(
  group_id uuid,
  group_name text,
  status text,
  created_at timestamptz,
  member_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF NOT (
    v_match.organizer_id = v_uid
    OR public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
    OR EXISTS (
      SELECT 1
      FROM public.match_group_invitations mgi
      JOIN public.group_members gm
        ON gm.group_id = mgi.group_id
       AND gm.user_id = v_uid
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE mgi.match_id = p_match_id
        AND mgi.status = 'active'
        AND mgi.revoked_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mgi.group_id,
    g.name,
    mgi.status,
    mgi.created_at,
    (
      SELECT count(*)
      FROM public.group_members gm
      WHERE gm.group_id = mgi.group_id
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
    )::bigint AS member_count
  FROM public.match_group_invitations mgi
  JOIN public.groups g
    ON g.id = mgi.group_id
  WHERE mgi.match_id = p_match_id
    AND mgi.status = 'active'
    AND mgi.revoked_at IS NULL
  ORDER BY mgi.created_at DESC, g.name ASC;
END;
$$;

ALTER FUNCTION public.rpc_match_group_invitations(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_group_invitations(uuid)
IS 'Lists active group-level invitations for a match.';

CREATE OR REPLACE FUNCTION public.rpc_match_my_group_invites(p_match_id uuid)
RETURNS TABLE(group_id uuid, group_name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    mgi.group_id,
    g.name,
    mgi.created_at
  FROM public.match_group_invitations mgi
  JOIN public.groups g
    ON g.id = mgi.group_id
  JOIN public.group_members gm
    ON gm.group_id = mgi.group_id
   AND gm.user_id = v_uid
   AND gm.status = 'active'
   AND gm.accepted_at IS NOT NULL
   AND gm.removed_at IS NULL
  WHERE mgi.match_id = p_match_id
    AND mgi.status = 'active'
    AND mgi.revoked_at IS NULL
  ORDER BY mgi.created_at DESC, g.name ASC;
END;
$$;

ALTER FUNCTION public.rpc_match_my_group_invites(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_my_group_invites(uuid)
IS 'Lists the active match group invitations that apply to the authenticated registered user.';

CREATE OR REPLACE FUNCTION public.rpc_match_accept_group_invite(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_mp public.match_participants%rowtype;
  v_confirmed_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_group_invitations mgi
    JOIN public.group_members gm
      ON gm.group_id = mgi.group_id
     AND gm.user_id = v_uid
     AND gm.status = 'active'
     AND gm.accepted_at IS NOT NULL
     AND gm.removed_at IS NULL
    WHERE mgi.match_id = p_match_id
      AND mgi.status = 'active'
      AND mgi.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no_active_group_invite';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = v_uid
      AND mp.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_participant';
  END IF;

  SELECT count(*) INTO v_confirmed_count
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed';

  IF v_confirmed_count >= v_match.required_count THEN
    RAISE EXCEPTION 'match_full';
  END IF;

  v_mp := public.apply_participant_admission(
    p_match_id,
    v_uid,
    v_match.organizer_id,
    'invited'
  );

  PERFORM public.apply_participant_acceptance(
    v_mp.id,
    v_uid,
    true,
    'accept'
  );

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = v_mp.id;

  RETURN v_mp;
END;
$$;

ALTER FUNCTION public.rpc_match_accept_group_invite(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_accept_group_invite(uuid)
IS 'Accepts a group-level match invitation for the authenticated registered member. Creates the participant row only on acceptance and uses the organizer-approved invite path.';

GRANT ALL ON TABLE public.match_group_invitations TO authenticated;
GRANT ALL ON TABLE public.match_group_invitations TO service_role;

ALTER TABLE public.match_group_invitations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON FUNCTION public.rpc_match_proxy_dashboard() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_dashboard() TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_proxy_approve_binding(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_approve_binding(uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_binding(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_binding(uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_invite_group(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_invite_group(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_group_invitations(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_group_invitations(uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_my_group_invites(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_my_group_invites(uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_match_accept_group_invite(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_accept_group_invite(uuid) TO service_role;
