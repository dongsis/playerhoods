DO $$
BEGIN
  CREATE TYPE public.venue_relationship_type AS ENUM (
    'member',
    'guest',
    'starred'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON TYPE public.venue_relationship_type
  IS 'v1 venue relationship model. Only member, guest, and starred are allowed.';

CREATE TABLE IF NOT EXISTS public.venue_user_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relationship_type public.venue_relationship_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_user_relationships
  IS 'Simplified user <-> venue relationship model. Replaces overloading venue_identities and secondary_venue_ids for membership/follow behavior.';

COMMENT ON COLUMN public.venue_user_relationships.relationship_type
  IS 'member = formal belonging, guest = actually used venue as guest, starred = saved/followed venue.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_user_relationships_venue_user_type
  ON public.venue_user_relationships (venue_id, user_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_venue_user_relationships_venue_type_user
  ON public.venue_user_relationships (venue_id, relationship_type, user_id);

CREATE INDEX IF NOT EXISTS idx_venue_user_relationships_user_type_venue
  ON public.venue_user_relationships (user_id, relationship_type, venue_id);

CREATE OR REPLACE FUNCTION public.trg_validate_venue_user_relationships()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kind text;
BEGIN
  SELECT v.venue_kind
  INTO v_kind
  FROM public.venues v
  WHERE v.id = NEW.venue_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;

  IF v_kind IN ('park', 'community_centre') AND NEW.relationship_type <> 'starred' THEN
    RAISE EXCEPTION 'relationship_not_allowed_for_venue_kind';
  END IF;

  IF NEW.relationship_type = 'guest' AND EXISTS (
    SELECT 1
    FROM public.venue_user_relationships vur
    WHERE vur.venue_id = NEW.venue_id
      AND vur.user_id = NEW.user_id
      AND vur.relationship_type = 'member'
      AND vur.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'guest_conflicts_with_member';
  END IF;

  IF NEW.relationship_type = 'member' AND EXISTS (
    SELECT 1
    FROM public.venue_user_relationships vur
    WHERE vur.venue_id = NEW.venue_id
      AND vur.user_id = NEW.user_id
      AND vur.relationship_type = 'guest'
      AND vur.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'member_conflicts_with_guest';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_validate_venue_user_relationships()
  IS 'Validates venue relationship type by venue_kind. park/community_centre only allow starred. member and guest are mutually exclusive for the same venue/user.';

DROP TRIGGER IF EXISTS trg_validate_venue_user_relationships ON public.venue_user_relationships;
CREATE TRIGGER trg_validate_venue_user_relationships
BEFORE INSERT OR UPDATE ON public.venue_user_relationships
FOR EACH ROW
EXECUTE FUNCTION public.trg_validate_venue_user_relationships();

DROP TRIGGER IF EXISTS tg__venue_user_relationships_updated_at ON public.venue_user_relationships;
CREATE TRIGGER tg__venue_user_relationships_updated_at
BEFORE UPDATE ON public.venue_user_relationships
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

ALTER TABLE public.venue_user_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_user_relationships_select_own
  ON public.venue_user_relationships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY venue_user_relationships_insert_own
  ON public.venue_user_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY venue_user_relationships_update_own
  ON public.venue_user_relationships
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY venue_user_relationships_delete_own
  ON public.venue_user_relationships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

GRANT ALL ON TABLE public.venue_user_relationships TO authenticated;
GRANT ALL ON TABLE public.venue_user_relationships TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_venue_relationship_set(
  p_venue_id uuid,
  p_relationship_type public.venue_relationship_type
) RETURNS public.venue_user_relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.venue_user_relationships;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.venue_user_relationships (
    venue_id,
    user_id,
    relationship_type
  )
  VALUES (
    p_venue_id,
    v_uid,
    p_relationship_type
  )
  ON CONFLICT (venue_id, user_id, relationship_type)
  DO UPDATE SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_venue_relationship_set(uuid, public.venue_relationship_type)
  IS 'Idempotently records a simplified venue relationship for the current user. Validation is enforced by trigger logic on venue_user_relationships.';

CREATE OR REPLACE FUNCTION public.rpc_venue_relationship_remove(
  p_venue_id uuid,
  p_relationship_type public.venue_relationship_type
) RETURNS boolean
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

  DELETE FROM public.venue_user_relationships
  WHERE venue_id = p_venue_id
    AND user_id = v_uid
    AND relationship_type = p_relationship_type;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.rpc_venue_relationship_remove(uuid, public.venue_relationship_type)
  IS 'Removes a simplified venue relationship for the current user.';

CREATE OR REPLACE FUNCTION public.rpc_venue_people_discovery_v2(
  p_venue_id uuid,
  p_search text DEFAULT NULL
) RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  relationship_type public.venue_relationship_type
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text;
  v_required_type public.venue_relationship_type;
  v_search text := NULLIF(trim(p_search), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT venue_kind
  INTO v_kind
  FROM public.venues
  WHERE id = p_venue_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;

  IF v_kind IN ('club', 'private_facility', 'condo', 'school') THEN
    v_required_type := 'member';
  ELSIF v_kind IN ('park', 'community_centre') THEN
    v_required_type := 'starred';
  ELSE
    RAISE EXCEPTION 'unsupported_venue_kind';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_user_relationships self_rel
    WHERE self_rel.venue_id = p_venue_id
      AND self_rel.user_id = v_uid
      AND self_rel.relationship_type = v_required_type
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_venue_discovery';
  END IF;

  RETURN QUERY
  SELECT
    rel.user_id,
    p.display_name,
    p.avatar_url,
    rel.relationship_type
  FROM public.venue_user_relationships rel
  JOIN public.profiles p
    ON p.id = rel.user_id
  WHERE rel.venue_id = p_venue_id
    AND rel.relationship_type = v_required_type
    AND rel.user_id <> v_uid
    AND (
      v_search IS NULL
      OR COALESCE(p.display_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.first_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.last_name, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), rel.user_id::text));
END;
$$;

COMMENT ON FUNCTION public.rpc_venue_people_discovery_v2(uuid, text)
  IS 'Simplified venue people discovery. club/private_facility/condo/school discover members only. park/community_centre discover starred only. guest is never part of discovery.';

GRANT EXECUTE ON FUNCTION public.rpc_venue_relationship_set(uuid, public.venue_relationship_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_venue_relationship_set(uuid, public.venue_relationship_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_venue_relationship_remove(uuid, public.venue_relationship_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_venue_relationship_remove(uuid, public.venue_relationship_type) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_venue_people_discovery_v2(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_venue_people_discovery_v2(uuid, text) TO service_role;

INSERT INTO public.venue_user_relationships (
  venue_id,
  user_id,
  relationship_type
)
SELECT
  vi.venue_id,
  vi.user_id,
  'member'::public.venue_relationship_type
FROM public.venue_identities vi
ON CONFLICT (venue_id, user_id, relationship_type) DO NOTHING;

INSERT INTO public.venue_user_relationships (
  venue_id,
  user_id,
  relationship_type
)
SELECT
  starred.venue_id,
  starred.user_id,
  'starred'::public.venue_relationship_type
FROM (
  SELECT
    p.id AS user_id,
    unnest(COALESCE(p.secondary_venue_ids, '{}'::uuid[])) AS venue_id
  FROM public.profiles p
) starred
ON CONFLICT (venue_id, user_id, relationship_type) DO NOTHING;
