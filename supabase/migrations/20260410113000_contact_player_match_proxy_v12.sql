-- Contact Player + Match Proxy canonical spec v1.2
-- Introduces person/contact/proxy/group-contact layers and retires ad-hoc delegate authority.

CREATE TABLE IF NOT EXISTS public.people (
  person_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type text NOT NULL DEFAULT 'limited_contact'
    CHECK (person_type = ANY (ARRAY['registered_user'::text, 'limited_contact'::text, 'linked_hybrid'::text])),
  display_name text NOT NULL,
  avatar_url text,
  linked_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  primary_sport_id smallint REFERENCES public.sports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_people_linked_user
  ON public.people (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

COMMENT ON TABLE public.people IS
'Canonical shared person-node layer. Contact Player is a limited person node here; registered users also resolve here.';

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(person_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.contact_records (
  contact_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  raw_name text,
  raw_phone text,
  raw_email text,
  owner_notes text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_records_owner
  ON public.contact_records (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_records_person
  ON public.contact_records (person_id);

COMMENT ON TABLE public.contact_records IS
'Owner-private Contact Player records. Private phone/email/notes live here, not on the shared person node.';

CREATE TABLE IF NOT EXISTS public.person_relationships (
  relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
  relationship_type text NOT NULL
    CHECK (relationship_type = ANY (ARRAY[
      'saved'::text,
      'shared_match'::text,
      'same_group'::text,
      'group_contact'::text,
      'direct_contact'::text,
      'linked'::text,
      'imported_by'::text
    ])),
  source_group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  source_match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_relationships_actor
  ON public.person_relationships (actor_user_id, relationship_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_person_relationships_person
  ON public.person_relationships (person_id, relationship_type, created_at DESC);

COMMENT ON TABLE public.person_relationships IS
'Relationship layer between a user and a canonical person node.';

CREATE TABLE IF NOT EXISTS public.person_match_proxies (
  binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  principal_person_id uuid NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
  proxy_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'manage_match_participation'
    CHECK (scope = 'manage_match_participation'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'rejected'::text, 'revoked'::text, 'expired'::text])),
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_via text,
  invited_to text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_person_match_proxy
  ON public.person_match_proxies (principal_person_id, proxy_user_id, scope)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_person_match_proxies_proxy
  ON public.person_match_proxies (proxy_user_id, status, created_at DESC);

COMMENT ON TABLE public.person_match_proxies IS
'Explicit Match Proxy bindings. Participant-side authority for another person comes only from active rows here.';

CREATE TABLE IF NOT EXISTS public.group_contacts (
  group_contact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(person_id) ON DELETE CASCADE,
  membership_type text NOT NULL DEFAULT 'group_contact'
    CHECK (membership_type = ANY (ARRAY['group_contact'::text, 'limited_group_member'::text])),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_contacts_active
  ON public.group_contacts (group_id, person_id)
  WHERE removed_at IS NULL;

COMMENT ON TABLE public.group_contacts IS
'Contact Players added to groups as limited contacts, not as full registered group members.';

INSERT INTO public.people (person_type, display_name, avatar_url, linked_user_id, status)
SELECT
  'registered_user',
  COALESCE(NULLIF(trim(p.display_name), ''), p.id::text),
  p.avatar_url,
  p.id,
  'active'
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.people people_existing
  WHERE people_existing.linked_user_id = p.id
);

UPDATE public.people people_existing
SET
  display_name = COALESCE(NULLIF(trim(p.display_name), ''), p.id::text),
  avatar_url = COALESCE(p.avatar_url, people_existing.avatar_url),
  status = 'active',
  updated_at = now()
FROM public.profiles p
WHERE people_existing.linked_user_id = p.id;

WITH guest_keys AS (
  SELECT
    g.id AS guest_id,
    CASE
      WHEN NULLIF(lower(trim(g.email)), '') IS NOT NULL THEN 'email:' || lower(trim(g.email))
      WHEN NULLIF(regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN 'phone:' || regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g')
      ELSE 'guest:' || g.id::text
    END AS canonical_key,
    COALESCE(NULLIF(trim(g.display_name), ''), g.id::text) AS display_name
  FROM public.guests g
  WHERE g.person_id IS NULL
),
canonical_people AS (
  SELECT DISTINCT ON (canonical_key)
    canonical_key,
    gen_random_uuid() AS person_id,
    display_name
  FROM guest_keys
  ORDER BY canonical_key, display_name
),
inserted AS (
  INSERT INTO public.people (person_id, person_type, display_name, status)
  SELECT cp.person_id, 'limited_contact', cp.display_name, 'active'
  FROM canonical_people cp
  RETURNING person_id
)
UPDATE public.guests g
SET person_id = cp.person_id
FROM guest_keys gk
JOIN canonical_people cp
  ON cp.canonical_key = gk.canonical_key
WHERE g.id = gk.guest_id
  AND g.person_id IS NULL;

INSERT INTO public.contact_records (
  owner_user_id,
  person_id,
  guest_id,
  raw_name,
  raw_phone,
  raw_email,
  owner_notes,
  source
)
SELECT
  urg.owner_user_id,
  g.person_id,
  g.id,
  g.display_name,
  g.phone,
  g.email,
  g.notes,
  'roster_guest'
FROM public.user_roster_guests urg
JOIN public.guests g
  ON g.id = urg.guest_id
LEFT JOIN public.contact_records cr
  ON cr.owner_user_id = urg.owner_user_id
 AND cr.guest_id = g.id
WHERE g.person_id IS NOT NULL
  AND cr.contact_record_id IS NULL;

INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type)
SELECT DISTINCT
  urg.owner_user_id,
  g.person_id,
  'direct_contact'
FROM public.user_roster_guests urg
JOIN public.guests g
  ON g.id = urg.guest_id
LEFT JOIN public.person_relationships pr
  ON pr.actor_user_id = urg.owner_user_id
 AND pr.person_id = g.person_id
 AND pr.relationship_type = 'direct_contact'
WHERE g.person_id IS NOT NULL
  AND pr.relationship_id IS NULL;

INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type)
SELECT
  p.linked_user_id,
  p.person_id,
  'linked'
FROM public.people p
LEFT JOIN public.person_relationships pr
  ON pr.actor_user_id = p.linked_user_id
 AND pr.person_id = p.person_id
 AND pr.relationship_type = 'linked'
WHERE p.linked_user_id IS NOT NULL
  AND pr.relationship_id IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_person_id_for_user(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT person_id
  INTO v_person_id
  FROM public.people
  WHERE linked_user_id = p_user_id
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    RETURN v_person_id;
  END IF;

  INSERT INTO public.people (person_type, display_name, avatar_url, linked_user_id, status)
  SELECT
    'registered_user',
    COALESCE(NULLIF(trim(p.display_name), ''), p.id::text),
    p.avatar_url,
    p.id,
    'active'
  FROM public.profiles p
  WHERE p.id = p_user_id
  RETURNING person_id INTO v_person_id;

  RETURN v_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_person_id_for_guest(
  p_guest_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_guest_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT person_id
  INTO v_person_id
  FROM public.guests
  WHERE id = p_guest_id;

  IF v_person_id IS NOT NULL THEN
    RETURN v_person_id;
  END IF;

  INSERT INTO public.people (person_type, display_name, status)
  SELECT
    'limited_contact',
    COALESCE(NULLIF(trim(g.display_name), ''), g.id::text),
    'active'
  FROM public.guests g
  WHERE g.id = p_guest_id
  RETURNING person_id INTO v_person_id;

  UPDATE public.guests
  SET person_id = v_person_id
  WHERE id = p_guest_id;

  RETURN v_person_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_roster_guest_create(
  p_display_name text,
  p_email text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS public.guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guest public.guests;
  v_person_id uuid;
  v_matched_user_id uuid;
  v_norm_email text := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_norm_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  IF v_norm_email IS NOT NULL THEN
    SELECT u.id
    INTO v_matched_user_id
    FROM auth.users u
    WHERE lower(trim(u.email::text)) = v_norm_email
    LIMIT 1;
  END IF;

  IF v_matched_user_id IS NOT NULL THEN
    v_person_id := public.resolve_person_id_for_user(v_matched_user_id);
  END IF;

  IF v_person_id IS NULL THEN
    SELECT g.person_id
    INTO v_person_id
    FROM public.guests g
    WHERE g.person_id IS NOT NULL
      AND (
        (v_norm_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = v_norm_email)
        OR (
          v_norm_phone IS NOT NULL
          AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = v_norm_phone
        )
      )
    ORDER BY g.created_at
    LIMIT 1;
  END IF;

  IF v_person_id IS NULL THEN
    INSERT INTO public.people (
      person_type,
      display_name,
      linked_user_id,
      status
    )
    VALUES (
      CASE WHEN v_matched_user_id IS NOT NULL THEN 'linked_hybrid' ELSE 'limited_contact' END,
      btrim(p_display_name),
      v_matched_user_id,
      'active'
    )
    RETURNING person_id INTO v_person_id;
  END IF;

  INSERT INTO public.guests(
    display_name,
    email,
    phone,
    notes,
    status,
    created_by,
    created_at,
    person_id
  )
  VALUES (
    btrim(p_display_name),
    p_email,
    p_phone,
    p_notes,
    'active',
    auth.uid(),
    now(),
    v_person_id
  )
  RETURNING * INTO v_guest;

  INSERT INTO public.user_roster_guests(
    owner_user_id,
    guest_id,
    created_by,
    created_at
  )
  SELECT
    auth.uid(),
    v_guest.id,
    auth.uid(),
    now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = auth.uid()
      AND urg.guest_id = v_guest.id
  );

  INSERT INTO public.contact_records (
    owner_user_id,
    person_id,
    guest_id,
    raw_name,
    raw_phone,
    raw_email,
    owner_notes,
    source
  )
  VALUES (
    auth.uid(),
    v_person_id,
    v_guest.id,
    v_guest.display_name,
    v_guest.phone,
    v_guest.email,
    v_guest.notes,
    'manual'
  );

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type)
  SELECT auth.uid(), v_person_id, 'direct_contact'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = auth.uid()
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'direct_contact'
  );

  RETURN v_guest;
END;
$$;

COMMENT ON FUNCTION public.rpc_roster_guest_create(text, text, text, text) IS
'Create a Contact Player private record and link it to the canonical person layer. High-confidence email/phone matches reuse the existing person node.';

CREATE OR REPLACE FUNCTION public.is_active_match_proxy_for_participant(
  p_match_participant_id uuid,
  p_proxy_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_match_participant_id IS NULL OR p_proxy_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN mp.user_id IS NOT NULL THEN public.resolve_person_id_for_user(mp.user_id)
      WHEN mp.guest_id IS NOT NULL THEN public.resolve_person_id_for_guest(mp.guest_id)
      ELSE NULL
    END
  INTO v_person_id
  FROM public.match_participants mp
  WHERE mp.id = p_match_participant_id
    AND mp.removed_at IS NULL;

  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.person_match_proxies pmp
    WHERE pmp.principal_person_id = v_person_id
      AND pmp.proxy_user_id = p_proxy_user_id
      AND pmp.scope = 'manage_match_participation'
      AND pmp.status = 'active'
      AND pmp.revoked_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_match_proxy_for_person(
  p_principal_person_id uuid,
  p_proxy_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.person_match_proxies pmp
    WHERE pmp.principal_person_id = p_principal_person_id
      AND pmp.proxy_user_id = p_proxy_user_id
      AND pmp.scope = 'manage_match_participation'
      AND pmp.status = 'active'
      AND pmp.revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.match_proxy_verification_email(
  p_principal_person_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT lower(trim(u.email::text))
      FROM public.people p
      JOIN auth.users u
        ON u.id = p.linked_user_id
      WHERE p.person_id = p_principal_person_id
        AND NULLIF(trim(u.email::text), '') IS NOT NULL
      LIMIT 1
    ),
    (
      SELECT lower(trim(g.email))
      FROM public.guests g
      WHERE g.person_id = p_principal_person_id
        AND g.status = 'active'
        AND NULLIF(trim(g.email), '') IS NOT NULL
      ORDER BY g.created_at
      LIMIT 1
    ),
    (
      SELECT lower(trim(cr.raw_email))
      FROM public.contact_records cr
      WHERE cr.person_id = p_principal_person_id
        AND NULLIF(trim(cr.raw_email), '') IS NOT NULL
      ORDER BY cr.created_at
      LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_user_request_match_proxy_for_guest(
  p_guest_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_guest_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN
    EXISTS (
      SELECT 1
      FROM public.user_roster_guests urg
      WHERE urg.owner_user_id = p_actor_user_id
        AND urg.guest_id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      WHERE pr.actor_user_id = p_actor_user_id
        AND pr.person_id = v_person_id
        AND pr.relationship_type IN ('saved', 'direct_contact', 'group_contact')
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_contacts gc
      JOIN public.group_members gm
        ON gm.group_id = gc.group_id
       AND gm.user_id = p_actor_user_id
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE gc.person_id = v_person_id
        AND gc.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp_actor
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = mp_actor.match_id
       AND mp_guest.guest_id = p_guest_id
        AND mp_guest.removed_at IS NULL
      WHERE mp_actor.user_id = p_actor_user_id
        AND mp_actor.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = m.id
       AND mp_guest.guest_id = p_guest_id
       AND mp_guest.removed_at IS NULL
      WHERE m.organizer_id = p_actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.person_id = v_person_id
        AND p.linked_user_id = p_actor_user_id
    )
    OR public.is_active_match_proxy_for_person(v_person_id, p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_user_view_contact_player(
  p_guest_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.can_user_request_match_proxy_for_guest(p_guest_id, p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_contact_player_lookup(
  p_guest_ids uuid[]
)
RETURNS TABLE(
  guest_id uuid,
  person_id uuid,
  display_name text,
  avatar_url text,
  primary_sport_id integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    g.id AS guest_id,
    g.person_id,
    COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
    p.avatar_url,
    p.primary_sport_id
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.status = 'active'
    AND g.id = ANY(COALESCE(p_guest_ids, ARRAY[]::uuid[]))
    AND public.can_user_view_contact_player(g.id, auth.uid());
$$;

COMMENT ON FUNCTION public.rpc_contact_player_lookup(uuid[]) IS
'Scoped Contact Player lookup. Returns minimum display data only for trusted callers with an owner, saved, shared-match, group-contact, linked, organizer, or active Match Proxy path.';

CREATE OR REPLACE FUNCTION public.activate_match_proxy_binding(
  p_binding_id uuid,
  p_invited_via text,
  p_invited_to text
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'binding_not_pending';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'active',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    confirmed_at = COALESCE(confirmed_at, now()),
    rejected_at = NULL,
    revoked_at = NULL,
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_match_proxy_binding(
  p_binding_id uuid,
  p_invited_via text,
  p_invited_to text
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'rejected' THEN
    RETURN v_row;
  END IF;

  IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
    RAISE EXCEPTION 'binding_already_active';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'rejected',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    rejected_at = COALESCE(rejected_at, now()),
    confirmed_at = NULL,
    revoked_at = NULL,
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_match_proxy_binding(
  p_binding_id uuid,
  p_invited_via text,
  p_invited_to text
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'revoked' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'active' OR v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'binding_not_active';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'revoked',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    revoked_at = COALESCE(revoked_at, now()),
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_request_self(
  p_proxy_user_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
  v_verification_email text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_proxy_user_id IS NULL OR p_proxy_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid_proxy_user';
  END IF;

  v_person_id := public.resolve_person_id_for_user(v_uid);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'principal_person_not_found';
  END IF;

  v_verification_email := public.match_proxy_verification_email(v_person_id);
  IF v_verification_email IS NULL THEN
    RAISE EXCEPTION 'principal_verification_email_required';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), v_uid::text)
  INTO v_target_name
  FROM public.people p
  WHERE p.person_id = v_person_id;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE principal_person_id = v_person_id
    AND proxy_user_id = p_proxy_user_id
    AND scope = 'manage_match_participation'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
      RETURN v_row;
    END IF;

    UPDATE public.person_match_proxies
    SET
      status = 'pending',
      requested_by_user_id = v_uid,
      invited_via = 'principal_email_verification',
      invited_to = v_verification_email,
      confirmed_at = NULL,
      rejected_at = NULL,
      revoked_at = NULL,
      updated_at = now()
    WHERE binding_id = v_row.binding_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.person_match_proxies (
      principal_person_id,
      proxy_user_id,
      scope,
      status,
      requested_by_user_id,
      invited_via,
      invited_to,
      created_at,
      updated_at
    )
    VALUES (
      v_person_id,
      p_proxy_user_id,
      'manage_match_participation',
      'pending',
      v_uid,
      'principal_email_verification',
      v_verification_email,
      now(),
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id,
    target_email,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id
  )
  VALUES (
    v_uid,
    v_verification_email,
    NULLIF(trim(v_target_name), ''),
    'match_proxy_binding',
    v_row.binding_id,
    NULL,
    NULL
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_confirm_self(
  p_binding_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
BEGIN
  RAISE EXCEPTION 'proxy_self_confirmation_requires_email_verification'
    USING HINT = 'Use the verification email invitation flow to activate this Match Proxy binding.';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_reject_self(
  p_binding_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
BEGIN
  RAISE EXCEPTION 'proxy_self_rejection_requires_email_verification'
    USING HINT = 'Use the verification email invitation flow to reject this Match Proxy binding.';
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_revoke_self(
  p_binding_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_person_id := public.resolve_person_id_for_user(v_uid);

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.principal_person_id <> v_person_id THEN
    RAISE EXCEPTION 'not_binding_principal';
  END IF;

  RETURN public.revoke_match_proxy_binding(
    p_binding_id,
    'self_authenticated',
    'in_app_revocation'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_request_contact_player(
  p_guest_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
  v_verification_email text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_guest_id IS NULL THEN
    RAISE EXCEPTION 'guest_required';
  END IF;

  IF NOT public.can_user_request_match_proxy_for_guest(p_guest_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_request_contact_proxy';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'principal_person_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.person_id = v_person_id
      AND p.linked_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_proxy_self';
  END IF;

  v_verification_email := public.match_proxy_verification_email(v_person_id);
  IF v_verification_email IS NULL THEN
    RAISE EXCEPTION 'principal_verification_email_required';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), p_guest_id::text)
  INTO v_target_name
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.id = p_guest_id;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE principal_person_id = v_person_id
    AND proxy_user_id = v_uid
    AND scope = 'manage_match_participation'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
      RETURN v_row;
    END IF;

    UPDATE public.person_match_proxies
    SET
      status = 'pending',
      requested_by_user_id = v_uid,
      invited_via = 'contact_email_verification',
      invited_to = v_verification_email,
      confirmed_at = NULL,
      rejected_at = NULL,
      revoked_at = NULL,
      updated_at = now()
    WHERE binding_id = v_row.binding_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.person_match_proxies (
      principal_person_id,
      proxy_user_id,
      scope,
      status,
      requested_by_user_id,
      invited_via,
      invited_to,
      created_at,
      updated_at
    )
    VALUES (
      v_person_id,
      v_uid,
      'manage_match_participation',
      'pending',
      v_uid,
      'contact_email_verification',
      v_verification_email,
      now(),
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id,
    target_email,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id
  )
  VALUES (
    v_uid,
    v_verification_email,
    NULLIF(trim(v_target_name), ''),
    'match_proxy_binding',
    v_row.binding_id,
    NULL,
    NULL
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_manageable_participants(
  p_match_id uuid
)
RETURNS TABLE(match_participant_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT mp.id
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.removed_at IS NULL
    AND public.is_active_match_proxy_for_participant(mp.id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_withdraw_participant(
  p_match_participant_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mp public.match_participants%rowtype;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF NOT public.is_active_match_proxy_for_participant(p_match_participant_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_proxy_manage';
  END IF;

  v_note := CASE
    WHEN v_mp.join_method = 'invited' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined invitation on behalf of participant'
    WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined nomination on behalf of participant'
    WHEN v_mp.confirmed_at IS NOT NULL THEN 'Proxy withdrew participation on behalf of participant'
    ELSE 'Proxy withdrew on behalf of participant'
  END;

  RETURN public.apply_participant_exit(
    p_match_participant_id,
    v_uid,
    'withdraw',
    v_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_decline_participant(
  p_match_participant_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.rpc_match_proxy_withdraw_participant(p_match_participant_id);
END;
$$;

CREATE OR REPLACE VIEW public.contact_player_public AS
SELECT
  g.id AS guest_id,
  g.person_id,
  COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
  p.avatar_url,
  p.primary_sport_id
FROM public.guests g
LEFT JOIN public.people p
  ON p.person_id = g.person_id
WHERE g.status = 'active';

COMMENT ON VIEW public.contact_player_public IS
'Internal Contact Player helper view. Public and broad authenticated discovery must use scoped RPCs, not direct view access.';

DROP POLICY IF EXISTS "guests_select_for_match_people" ON public.guests;
DROP POLICY IF EXISTS "guests_select_authenticated" ON public.guests;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guests'
      AND policyname = 'guests_select_owner_private'
  ) THEN
    CREATE POLICY guests_select_owner_private
      ON public.guests
      FOR SELECT
      TO authenticated
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.user_roster_guests urg
          WHERE urg.guest_id = guests.id
            AND urg.owner_user_id = auth.uid()
        )
      );
  END IF;
END
$$;

ALTER TABLE public.contact_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_match_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_records'
      AND policyname = 'contact_records_select_owner'
  ) THEN
    CREATE POLICY contact_records_select_owner
      ON public.contact_records
      FOR SELECT
      TO authenticated
      USING (owner_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'person_relationships'
      AND policyname = 'person_relationships_select_actor'
  ) THEN
    CREATE POLICY person_relationships_select_actor
      ON public.person_relationships
      FOR SELECT
      TO authenticated
      USING (actor_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'person_match_proxies'
      AND policyname = 'person_match_proxies_select_party'
  ) THEN
    CREATE POLICY person_match_proxies_select_party
      ON public.person_match_proxies
      FOR SELECT
      TO authenticated
      USING (
        proxy_user_id = auth.uid()
        OR principal_person_id = public.resolve_person_id_for_user(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_contacts'
      AND policyname = 'group_contacts_select_group_members'
  ) THEN
    CREATE POLICY group_contacts_select_group_members
      ON public.group_contacts
      FOR SELECT
      TO authenticated
      USING (
        removed_at IS NULL
        AND (
          public.is_group_active_member(group_id, auth.uid())
          OR public.group_boundary_keeper_id(group_id) = auth.uid()
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  DROP POLICY IF EXISTS matches_select_proxy_participation ON public.matches;
  CREATE POLICY matches_select_proxy_participation
    ON public.matches
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.match_participants mp
        WHERE mp.match_id = matches.id
          AND public.is_active_match_proxy_for_participant(mp.id, auth.uid())
      )
    );

  DROP POLICY IF EXISTS match_courts_select_proxy_participation ON public.match_courts;
  CREATE POLICY match_courts_select_proxy_participation
    ON public.match_courts
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.match_participants mp
        WHERE mp.match_id = match_courts.match_id
          AND public.is_active_match_proxy_for_participant(mp.id, auth.uid())
      )
    );

  DROP POLICY IF EXISTS match_participants_select_proxy_binding ON public.match_participants;
  CREATE POLICY match_participants_select_proxy_binding
    ON public.match_participants
    FOR SELECT
    TO authenticated
    USING (
      public.is_active_match_proxy_for_participant(id, auth.uid())
    );

  DROP POLICY IF EXISTS match_participant_actions_select_proxy_binding ON public.match_participant_actions;
  CREATE POLICY match_participant_actions_select_proxy_binding
    ON public.match_participant_actions
    FOR SELECT
    TO authenticated
    USING (
      public.is_active_match_proxy_for_participant(match_participant_id, auth.uid())
    );
END
$$;

ALTER TABLE public.match_participants
  DROP CONSTRAINT IF EXISTS chk_participant_accepted_via;

ALTER TABLE public.match_participants
  ADD CONSTRAINT chk_participant_accepted_via
  CHECK (
    participant_accepted_via IS NULL
    OR participant_accepted_via = ANY (ARRAY[
      'in_app'::text,
      'manual'::text,
      'delegate_manual'::text,
      'email_invitation'::text,
      'proxy'::text
    ])
  );

ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_check;

ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_chk;

ALTER TABLE public.match_participant_actions
  ADD CONSTRAINT match_participant_actions_action_type_check
  CHECK (
    action_type = ANY (ARRAY[
      'invite'::text,
      'nominate'::text,
      'request_join'::text,
      'reenter'::text,
      'accept'::text,
      'approve'::text,
      'withdraw'::text,
      'decline'::text,
      'reject_request'::text,
      'revoke_invite'::text,
      'reject_nomination'::text,
      'remove_confirmed'::text,
      'remove'::text,
      'add_guest_org'::text,
      'add_guest_participant'::text,
      'manual_confirm'::text,
      'invited'::text,
      'nominated'::text,
      'requested'::text,
      'accepted'::text,
      'approved'::text,
      'withdrawn'::text,
      'removed'::text,
      'guest_added'::text,
      'declined'::text,
      'delegate_manual_confirm'::text,
      'revoke_delegate_confirm'::text,
      'nominate_guest'::text,
      'proxy_confirm'::text
    ])
  );

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(
  p_mp_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp record;
  v_is_ready boolean := false;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    participant_accepted_at,
    org_approved_at,
    removed_at,
    confirmed_at,
    waiting_list_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  IF v_mp.removed_at IS NOT NULL OR v_mp.status::text = 'removed' THEN
    UPDATE public.match_participants
    SET
      status = 'removed',
      confirmed_at = NULL,
      waiting_list_at = NULL,
      removed_at = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status::text <> 'removed'
        OR confirmed_at IS NOT NULL
        OR waiting_list_at IS NOT NULL
        OR removed_at IS NULL
      );
    RETURN;
  END IF;

  IF v_mp.user_id IS NULL AND v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
  END IF;

  v_is_ready := v_mp.participant_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL;

  IF v_is_ready THEN
    IF v_mp.status::text = 'waiting_list' THEN
      UPDATE public.match_participants
      SET
        status = 'waiting_list',
        confirmed_at = NULL,
        waiting_list_at = COALESCE(waiting_list_at, now())
      WHERE id = p_mp_id
        AND (
          status::text <> 'waiting_list'
          OR confirmed_at IS NOT NULL
          OR waiting_list_at IS NULL
        );
    ELSE
      UPDATE public.match_participants
      SET
        status = 'confirmed',
        confirmed_at = COALESCE(confirmed_at, now()),
        waiting_list_at = NULL
      WHERE id = p_mp_id
        AND (
          status::text <> 'confirmed'
          OR confirmed_at IS NULL
          OR waiting_list_at IS NOT NULL
        );
    END IF;
    RETURN;
  END IF;

  UPDATE public.match_participants
  SET
    status = 'pending',
    confirmed_at = NULL,
    waiting_list_at = NULL
  WHERE id = p_mp_id
    AND (
      status::text <> 'pending'
      OR confirmed_at IS NOT NULL
      OR waiting_list_at IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(uuid) IS
'Canonical participant status reconciliation for Contact Player + Match Proxy v1.2. Both registered users and Contact Players require participant-side acceptance plus organizer approval to become confirmed.';

CREATE OR REPLACE FUNCTION public.apply_participant_acceptance(
  p_mp_id uuid,
  p_actor_id uuid,
  p_is_self boolean,
  p_action_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.match_participants
  SET
    participant_accepted_at = now(),
    participant_accepted_via = CASE WHEN p_is_self THEN 'in_app' ELSE 'proxy' END,
    manual_confirmed_by = CASE WHEN p_is_self THEN NULL ELSE p_actor_id END
  WHERE id = p_mp_id;

  PERFORM public.match_participant_reconcile_status(p_mp_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  SELECT mp.match_id, p_mp_id, p_action_type, NULL, p_actor_id
  FROM public.match_participants mp
  WHERE mp.id = p_mp_id;
END;
$$;

COMMENT ON FUNCTION public.apply_participant_acceptance(uuid, uuid, boolean, text) IS
'Participant-side acceptance helper. Self writes in_app; non-self writes proxy. Ad-hoc delegate semantics are retired.';

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_confirm_participant(
  p_match_participant_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  IF NOT public.is_active_match_proxy_for_participant(p_match_participant_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_proxy_confirm';
  END IF;

  PERFORM public.apply_participant_acceptance(
    p_match_participant_id,
    v_uid,
    false,
    'proxy_confirm'
  );

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_proxy_confirm_participant(uuid) IS
'Canonical Match Proxy confirm RPC. Active Match Proxy records participant-side confirmation for a principal. Shared-group and ad-hoc delegate semantics are retired.';

CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_participant(
  p_match_participant_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.rpc_match_proxy_confirm_participant(p_match_participant_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) IS
'Deprecated compatibility wrapper. Use rpc_match_proxy_confirm_participant for canonical Match Proxy confirmation semantics.';

CREATE OR REPLACE FUNCTION public.rpc_match_revoke_delegate_confirm_participant(
  p_match_participant_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated_delegate_revoke_removed'
    USING HINT = 'Use self withdraw or explicit proxy-managed participation actions instead.';
END;
$$;

COMMENT ON FUNCTION public.rpc_match_revoke_delegate_confirm_participant(uuid) IS
'Deprecated compatibility stub. Ad-hoc delegate revoke is retired under the Match Proxy model.';

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_bind_self(
  p_proxy_user_id uuid
)
RETURNS public.person_match_proxies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.rpc_match_proxy_request_self(p_proxy_user_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_proxy_bind_self(uuid) IS
'Compatibility-named RPC. Current behavior: create or refresh a pending Match Proxy request for a registered principal. Activation now requires explicit principal confirmation.';

CREATE OR REPLACE FUNCTION public.rpc_group_add_contact_player(
  p_group_id uuid,
  p_guest_id uuid
)
RETURNS public.group_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.group_contacts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF public.group_boundary_keeper_id(p_group_id) <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  SELECT *
  INTO v_row
  FROM public.group_contacts
  WHERE group_id = p_group_id
    AND person_id = v_person_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.group_contacts
    SET
      membership_type = 'group_contact',
      removed_at = NULL
    WHERE group_contact_id = v_row.group_contact_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.group_contacts (
      group_id,
      person_id,
      membership_type,
      created_by,
      created_at
    )
    VALUES (
      p_group_id,
      v_person_id,
      'group_contact',
      v_uid,
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type, source_group_id)
  SELECT v_uid, v_person_id, 'group_contact', p_group_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = v_uid
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'group_contact'
      AND pr.source_group_id = p_group_id
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_group_add_contact_player(uuid, uuid) IS
'Add a Contact Player to a group as a limited group contact. Does not create full registered membership or proxy authority.';

CREATE OR REPLACE FUNCTION public.rpc_group_contact_list(
  p_group_id uuid
)
RETURNS TABLE(
  group_contact_id uuid,
  guest_id uuid,
  person_id uuid,
  display_name text,
  avatar_url text,
  membership_type text,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    public.is_group_active_member(p_group_id, auth.uid())
    OR public.group_boundary_keeper_id(p_group_id) = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gc.group_contact_id,
    g.id AS guest_id,
    gc.person_id,
    p.display_name,
    p.avatar_url,
    gc.membership_type,
    gc.created_by,
    gc.created_at
  FROM public.group_contacts gc
  JOIN LATERAL (
    SELECT g.id
    FROM public.guests g
    WHERE g.person_id = gc.person_id
      AND g.status = 'active'
    ORDER BY g.created_at
    LIMIT 1
  ) g ON TRUE
  JOIN public.people p
    ON p.person_id = gc.person_id
  WHERE gc.group_id = p_group_id
    AND gc.removed_at IS NULL
  ORDER BY p.display_name, gc.created_at;
END;
$$;

COMMENT ON FUNCTION public.rpc_group_contact_list(uuid) IS
'List Contact Players included in a group as limited group contacts.';

CREATE OR REPLACE FUNCTION public.rpc_contact_player_save(
  p_guest_id uuid,
  p_source text DEFAULT 'manual',
  p_group_id uuid DEFAULT NULL::uuid,
  p_match_id uuid DEFAULT NULL::uuid
)
RETURNS public.person_relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_relationships;
  v_allowed boolean := false;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'manual');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  IF v_source NOT IN ('manual', 'direct_contact', 'shared_match', 'group_contact') THEN
    v_source := 'manual';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_match_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.match_participants mp_target
       JOIN public.guests g
         ON g.id = mp_target.guest_id
       WHERE mp_target.match_id = p_match_id
         AND g.person_id = v_person_id
     )
     AND (
       public.is_user_match_associated(p_match_id, v_uid)
       OR EXISTS (
         SELECT 1
         FROM public.matches m
         WHERE m.id = p_match_id
           AND m.organizer_id = v_uid
       )
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_group_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.group_contacts gc
       JOIN public.group_members gm
         ON gm.group_id = gc.group_id
        AND gm.user_id = v_uid
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
       WHERE gc.group_id = p_group_id
         AND gc.person_id = v_person_id
         AND gc.removed_at IS NULL
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_authorized_to_save_contact_player';
  END IF;

  SELECT *
  INTO v_row
  FROM public.person_relationships pr
  WHERE pr.actor_user_id = v_uid
    AND pr.person_id = v_person_id
    AND pr.relationship_type = 'saved'
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.person_relationships (
    actor_user_id,
    person_id,
    relationship_type,
    source_group_id,
    source_match_id
  )
  VALUES (
    v_uid,
    v_person_id,
    'saved',
    CASE WHEN v_source = 'group_contact' THEN p_group_id ELSE NULL END,
    CASE WHEN v_source = 'shared_match' THEN p_match_id ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) IS
'Save a Contact Player person node after owner, shared-match, or group-contact trust exposure. Save never creates proxy authority.';

CREATE OR REPLACE FUNCTION public.rpc_match_accept_email_invitation(
  p_match_id uuid,
  p_user_id uuid,
  p_invitation_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_match public.matches%rowtype;
  v_user_email text;
  v_target_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND OR v_inv.related_type <> 'match' OR v_inv.related_id <> p_match_id THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND OR v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  SELECT * INTO v_target_mp
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = p_user_id
    AND removed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF v_inv.match_participant_id IS NOT NULL THEN
      SELECT * INTO v_target_mp
      FROM public.match_participants
      WHERE id = v_inv.match_participant_id
        AND match_id = p_match_id
        AND removed_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'anchored_participant_not_found';
      END IF;
    ELSE
      SELECT COUNT(*), MIN(mp.id::text)::uuid
      INTO v_match_count, v_match_mp_id
      FROM public.match_participants mp
      JOIN public.guests g
        ON g.id = mp.guest_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

      IF v_match_count > 1 THEN
        RAISE EXCEPTION 'participant_ambiguous_for_invitation';
      END IF;

      IF v_match_count = 1 THEN
        SELECT * INTO v_target_mp
        FROM public.match_participants
        WHERE id = v_match_mp_id;
      END IF;
    END IF;
  END IF;

  IF v_target_mp.id IS NOT NULL THEN
    UPDATE public.match_participants
    SET participant_accepted_at = COALESCE(participant_accepted_at, now()),
        participant_accepted_via = CASE
          WHEN participant_accepted_at IS NULL THEN 'email_invitation'
          ELSE participant_accepted_via
        END
    WHERE id = v_target_mp.id
    RETURNING * INTO v_target_mp;

    PERFORM public.match_participant_reconcile_status(v_target_mp.id);

    SELECT * INTO v_target_mp
    FROM public.match_participants
    WHERE id = v_target_mp.id;

    RETURN v_target_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id,
    user_id,
    join_method,
    participant_accepted_at,
    participant_accepted_via,
    org_approved_at,
    org_approved_by,
    created_by
  )
  VALUES (
    p_match_id,
    p_user_id,
    'invited',
    now(),
    'email_invitation',
    NULL,
    NULL,
    v_inv.inviter_user_id
  )
  RETURNING * INTO v_target_mp;

  PERFORM public.match_participant_reconcile_status(v_target_mp.id);

  SELECT * INTO v_target_mp
  FROM public.match_participants
  WHERE id = v_target_mp.id;

  RETURN v_target_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_accept_email_invitation(uuid, uuid, uuid) IS
'Registered-user email invitation acceptance is participant-side only. It reuses an anchored Contact Player participant when present, avoids duplicate guest/user rows, and never auto-writes organizer approval.';

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept(
  p_invitation_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.activate_match_proxy_binding(
      v_inv.related_id,
      'registered_email_accept',
      trim(lower(v_user_email))
    );
  ELSIF v_inv.related_type = 'match' THEN
    PERFORM public.rpc_match_accept_email_invitation(v_inv.related_id, v_uid, p_invitation_id);
  END IF;

  UPDATE public.email_invitations
  SET status = 'accepted',
      accepted_by_user_id = v_uid,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', v_uid);

    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'invitation.accepted',
      'email_invitation',
      v_inv.id,
      v_uid,
      jsonb_build_object('invitation_id', v_inv.id, 'accepted_by_user_id', v_uid)
    );

    PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
  END IF;

  RETURN v_inv;
END;
$$;

COMMENT ON FUNCTION public.rpc_email_invitation_accept(uuid) IS
'Accept an email invitation for the authenticated user. Match acceptance reuses canonical participant rows and leaves organizer approval unchanged. Match Proxy binding invitations activate only after explicit verification acceptance.';

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_decline(
  p_invitation_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.reject_match_proxy_binding(
      v_inv.related_id,
      'registered_email_decline',
      trim(lower(v_user_email))
    );
  END IF;

  UPDATE public.email_invitations
  SET status = 'declined',
      declined_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', v_uid);
  END IF;

  RETURN v_inv;
END;
$$;

COMMENT ON FUNCTION public.rpc_email_invitation_decline(uuid) IS
'Decline an email invitation as an authenticated user. Match Proxy binding invitations are marked rejected when declined.';

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept_as_guest(
  p_invitation_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.activate_match_proxy_binding(
      v_inv.related_id,
      'guest_email_accept',
      trim(lower(v_inv.target_email))
    );

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
    JOIN public.guests g
      ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

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

COMMENT ON FUNCTION public.rpc_email_invitation_accept_as_guest(uuid) IS
'Accept a private email invitation without registration. Supports both Contact Player match participation and Contact Player Match Proxy verification links.';

CREATE OR REPLACE FUNCTION public.rpc_email_invitation_decline_as_guest(
  p_invitation_id uuid,
  p_system_actor_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.reject_match_proxy_binding(
      v_inv.related_id,
      'guest_email_decline',
      trim(lower(v_inv.target_email))
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
    JOIN public.guests g
      ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

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

COMMENT ON FUNCTION public.rpc_email_invitation_decline_as_guest(uuid, uuid) IS
'Decline a private email invitation without registration. Supports both Contact Player match participation and Contact Player Match Proxy verification links.';

CREATE OR REPLACE FUNCTION public.rpc_match_admission_targets(
  p_match_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  target_kind text,
  target_id uuid,
  display_name text,
  avatar_url text,
  venue_handle text,
  source text,
  action_kind text,
  can_admit boolean,
  eligible_via text,
  sort_name text,
  contact_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
  v_club_context uuid;
  v_can_call boolean;
  v_search text := NULLIF(trim(p_search), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_can_call := public.is_match_organizer(p_match_id, v_uid)
    OR (
      v_match.can_participants_invite_users = true
      AND (
        public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
        OR public.is_user_match_associated(p_match_id, v_uid)
      )
    );

  IF NOT v_can_call THEN
    RETURN;
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);
  v_club_context := COALESCE(
    v_match.venue_id,
    (SELECT primary_venue_id FROM public.profiles WHERE id = v_match.organizer_id)
  );

  RETURN QUERY
  WITH already_active_users AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  already_active_guests AS (
    SELECT mp.guest_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed', 'waiting_list')
      AND mp.removed_at IS NULL
      AND mp.guest_id IS NOT NULL
  ),
  reentry_src AS (
    SELECT DISTINCT mp.user_id, 'reentry'::text AS src
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status = 'removed'
      AND mp.user_id <> v_match.organizer_id
      AND mp.user_id <> v_uid
      AND mp.user_id NOT IN (SELECT user_id FROM already_active_users)
  ),
  invite_circle_src AS (
    SELECT uic.target_user_id AS user_id, 'invite_circle'::text AS src
    FROM public.user_invite_circle uic
    WHERE uic.owner_user_id = v_uid
      AND uic.target_user_id <> v_match.organizer_id
      AND uic.target_user_id <> v_uid
      AND uic.target_user_id NOT IN (SELECT user_id FROM already_active_users)
  ),
  club_members_src AS (
    SELECT ci.user_id, 'club_members'::text AS src
    FROM public.venue_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.venue_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND ci.user_id <> v_uid
      AND p.show_in_venue_member_discovery = true
      AND COALESCE(ci.visible_in_venue_member_discovery, true) = true
      AND ci.user_id NOT IN (SELECT user_id FROM already_active_users)
      AND EXISTS (
        SELECT 1 FROM public.venue_identities ci_caller
        WHERE ci_caller.venue_id = v_club_context AND ci_caller.user_id = v_uid
      )
  ),
  scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_scope_ids)
      AND gm.status = 'active'
      AND gm.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND gm_other.user_id <> v_match.organizer_id
      AND g.group_kind = 'friend'
  ),
  groups_src AS (
    SELECT sm.user_id, 'groups'::text AS src FROM scope_members sm
    UNION
    SELECT sg.user_id, 'groups'::text AS src FROM shared_group_members sg
  ),
  all_user_sources AS (
    SELECT user_id, src, 1 AS pri FROM reentry_src
    UNION ALL
    SELECT user_id, src, 2 AS pri FROM invite_circle_src
    UNION ALL
    SELECT user_id, src, 3 AS pri FROM club_members_src
    UNION ALL
    SELECT user_id, src, 4 AS pri FROM groups_src
  ),
  deduped_users AS (
    SELECT DISTINCT ON (user_id) user_id, src
    FROM all_user_sources
    WHERE user_id <> v_uid
    ORDER BY user_id, pri
  ),
  user_rows AS (
    SELECT
      'user'::text AS target_kind,
      c.user_id AS target_id,
      p.display_name,
      p.avatar_url,
      ci.venue_handle,
      c.src AS source,
      'admit_user'::text AS action_kind,
      public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS can_admit,
      CASE
        WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
        ELSE 'admit_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.venue_handle, c.user_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM deduped_users c
    JOIN public.profiles p ON p.id = c.user_id
    LEFT JOIN public.venue_identities ci
      ON ci.user_id = c.user_id AND ci.venue_id = v_club_context
    WHERE (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
      OR ci.venue_handle ILIKE '%' || v_search || '%'
    )
  ),
  roster_contacts_src AS (
    SELECT
      g.id AS guest_id,
      g.person_id,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
      g.email,
      g.phone
    FROM public.user_roster_guests urg
    JOIN public.guests g ON g.id = urg.guest_id
    LEFT JOIN public.people p ON p.person_id = g.person_id
    LEFT JOIN public.identity_links il
      ON il.linked_type = 'contact' AND il.linked_id = g.id
    WHERE urg.owner_user_id = v_uid
      AND g.status = 'active'
      AND il.user_id IS NULL
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
  ),
  saved_contact_src AS (
    SELECT DISTINCT ON (pr.person_id)
      g.id AS guest_id,
      pr.person_id,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
      NULL::text AS email,
      NULL::text AS phone
    FROM public.person_relationships pr
    JOIN public.people p
      ON p.person_id = pr.person_id
    JOIN public.guests g
      ON g.person_id = pr.person_id
     AND g.status = 'active'
    WHERE pr.actor_user_id = v_uid
      AND pr.relationship_type = 'saved'
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
    ORDER BY pr.person_id, g.created_at
  ),
  group_contact_src AS (
    SELECT DISTINCT ON (gc.person_id)
      g.id AS guest_id,
      gc.person_id,
      p.display_name,
      NULL::text AS email,
      NULL::text AS phone
    FROM public.group_contacts gc
    JOIN public.group_members gm
      ON gm.group_id = gc.group_id
     AND gm.user_id = v_uid
     AND gm.status = 'active'
     AND gm.accepted_at IS NOT NULL
     AND gm.removed_at IS NULL
    JOIN public.people p
      ON p.person_id = gc.person_id
    JOIN public.guests g
      ON g.person_id = gc.person_id
     AND g.status = 'active'
    WHERE gc.removed_at IS NULL
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
    ORDER BY gc.person_id, g.created_at
  ),
  contact_player_rows AS (
    SELECT
      'contact_player'::text AS target_kind,
      r.guest_id AS target_id,
      r.display_name,
      NULL::text AS avatar_url,
      NULL::text AS venue_handle,
      'roster_contacts'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(r.display_name), ''), r.guest_id::text)) AS sort_name,
      r.email AS contact_email
    FROM roster_contacts_src r
    WHERE (
      v_search IS NULL
      OR r.display_name ILIKE '%' || v_search || '%'
      OR r.email ILIKE '%' || v_search || '%'
      OR r.phone ILIKE '%' || v_search || '%'
    )

    UNION ALL

    SELECT
      'contact_player'::text AS target_kind,
      sc.guest_id AS target_id,
      sc.display_name,
      NULL::text AS avatar_url,
      NULL::text AS venue_handle,
      'saved_contact'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(sc.display_name), ''), sc.guest_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM saved_contact_src sc
    WHERE NOT EXISTS (
      SELECT 1
      FROM roster_contacts_src rc
      WHERE rc.person_id = sc.person_id
    )
      AND (
        v_search IS NULL
        OR sc.display_name ILIKE '%' || v_search || '%'
      )

    UNION ALL

    SELECT
      'contact_player'::text AS target_kind,
      gc.guest_id AS target_id,
      gc.display_name,
      NULL::text AS avatar_url,
      NULL::text AS venue_handle,
      'group_contact'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(gc.display_name), ''), gc.guest_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM group_contact_src gc
    WHERE NOT EXISTS (
      SELECT 1
      FROM roster_contacts_src rc
      WHERE rc.person_id = gc.person_id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM saved_contact_src sc
        WHERE sc.person_id = gc.person_id
      )
      AND (
        v_search IS NULL
        OR gc.display_name ILIKE '%' || v_search || '%'
      )
  ),
  combined AS (
    SELECT * FROM user_rows
    UNION ALL
    SELECT * FROM contact_player_rows
  )
  SELECT
    c.target_kind,
    c.target_id,
    c.display_name,
    c.avatar_url,
    c.venue_handle,
    c.source,
    c.action_kind,
    c.can_admit,
    c.eligible_via,
    c.sort_name,
    c.contact_email
  FROM combined c
  ORDER BY c.sort_name NULLS LAST, c.target_kind, c.target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp public.match_participants%rowtype;
  v_is_org boolean;
  v_guest_email text;
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

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.user_roster_guests urg
      WHERE urg.owner_user_id = v_uid
        AND urg.guest_id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.guests g
      JOIN public.group_contacts gc
        ON gc.person_id = g.person_id
       AND gc.removed_at IS NULL
      JOIN public.group_members gm
        ON gm.group_id = gc.group_id
       AND gm.user_id = v_uid
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE g.id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      JOIN public.guests g
        ON g.person_id = pr.person_id
      WHERE pr.actor_user_id = v_uid
        AND pr.relationship_type = 'saved'
        AND g.id = p_guest_id
    )
  ) THEN
    RAISE EXCEPTION 'guest_not_accessible';
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
    COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''))
  INTO v_guest_email, v_guest_name
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.id = p_guest_id;

  IF v_guest_email IS NOT NULL THEN
    SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;

    INSERT INTO public.email_invitations (
      inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
    ) VALUES (
      v_uid,
      trim(lower(v_guest_email)),
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

GRANT ALL ON TABLE public.people TO anon;
GRANT ALL ON TABLE public.people TO authenticated;
GRANT ALL ON TABLE public.people TO service_role;

GRANT ALL ON TABLE public.contact_records TO authenticated;
GRANT ALL ON TABLE public.contact_records TO service_role;

GRANT ALL ON TABLE public.person_relationships TO authenticated;
GRANT ALL ON TABLE public.person_relationships TO service_role;

GRANT ALL ON TABLE public.person_match_proxies TO authenticated;
GRANT ALL ON TABLE public.person_match_proxies TO service_role;

GRANT ALL ON TABLE public.group_contacts TO authenticated;
GRANT ALL ON TABLE public.group_contacts TO service_role;

REVOKE ALL ON public.contact_player_public FROM anon;
REVOKE ALL ON public.contact_player_public FROM authenticated;
GRANT SELECT ON public.contact_player_public TO service_role;

GRANT ALL ON FUNCTION public.resolve_person_id_for_user(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_person_id_for_user(uuid) TO service_role;

GRANT ALL ON FUNCTION public.resolve_person_id_for_guest(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_person_id_for_guest(uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_active_match_proxy_for_participant(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_active_match_proxy_for_participant(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_active_match_proxy_for_person(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_active_match_proxy_for_person(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.match_proxy_verification_email(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.match_proxy_verification_email(uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_user_request_match_proxy_for_guest(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_user_request_match_proxy_for_guest(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_user_view_contact_player(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_user_view_contact_player(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_contact_player_lookup(uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_contact_player_lookup(uuid[]) TO service_role;

GRANT ALL ON FUNCTION public.activate_match_proxy_binding(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.activate_match_proxy_binding(uuid, text, text) TO service_role;

GRANT ALL ON FUNCTION public.reject_match_proxy_binding(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.reject_match_proxy_binding(uuid, text, text) TO service_role;

GRANT ALL ON FUNCTION public.revoke_match_proxy_binding(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_match_proxy_binding(uuid, text, text) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_bind_self(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_bind_self(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_request_self(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_request_self(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_confirm_self(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_confirm_self(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_reject_self(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_reject_self(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_revoke_self(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_revoke_self(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_request_contact_player(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_request_contact_player(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_confirm_participant(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_confirm_participant(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_manageable_participants(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_manageable_participants(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_withdraw_participant(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_withdraw_participant(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_participant(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_participant(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_group_add_contact_player(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_add_contact_player(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_group_contact_list(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_contact_list(uuid) TO service_role;

GRANT ALL ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) TO service_role;
