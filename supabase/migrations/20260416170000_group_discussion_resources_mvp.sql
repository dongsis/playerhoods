CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL,
  deleted_at timestamptz NULL,
  CONSTRAINT group_messages_body_present CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT group_messages_body_length CHECK (char_length(body) <= 2000)
);

COMMENT ON TABLE public.group_messages IS 'MVP public discussion thread for a shared group.';
COMMENT ON COLUMN public.group_messages.body IS 'Plain text body for the public shared-group discussion.';

CREATE INDEX IF NOT EXISTS idx_group_messages_group_created_at
  ON public.group_messages (group_id, created_at);

CREATE TYPE public.group_resource_tag AS ENUM (
  'Rules',
  'Fees',
  'Schedule',
  'Venue',
  'Photo',
  'Other'
);

CREATE TABLE IF NOT EXISTS public.group_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('file', 'link')),
  title text NOT NULL,
  tag public.group_resource_tag NOT NULL DEFAULT 'Other',
  storage_bucket text NULL,
  storage_path text NULL,
  public_url text NULL,
  link_url text NULL,
  mime_type text NULL,
  byte_size bigint NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  pinned_at timestamptz NULL,
  archived_at timestamptz NULL,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  related_match_id uuid NULL REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT group_resources_title_present CHECK (char_length(btrim(title)) > 0),
  CONSTRAINT group_resources_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT group_resources_file_fields CHECK (
    (resource_type = 'file' AND storage_bucket IS NOT NULL AND storage_path IS NOT NULL AND public_url IS NOT NULL)
    OR (resource_type = 'link' AND link_url IS NOT NULL)
  )
);

COMMENT ON TABLE public.group_resources IS 'Lightweight pinned/recent/archive resources for shared groups.';
COMMENT ON COLUMN public.group_resources.resource_type IS 'file or link';

CREATE INDEX IF NOT EXISTS idx_group_resources_group_active
  ON public.group_resources (group_id, archived_at, is_pinned, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_resources_group_archive
  ON public.group_resources (group_id, archived_at DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.can_access_group_communication(
  p_group_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = p_group_id
        AND g.boundary_keeper_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = p_group_id
        AND gm.user_id = p_user_id
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
    );
$$;

ALTER FUNCTION public.can_access_group_communication(uuid, uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.can_manage_group_resources(
  p_group_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = p_group_id
      AND g.boundary_keeper_id = p_user_id
  );
$$;

ALTER FUNCTION public.can_manage_group_resources(uuid, uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.rpc_group_resources_archive_stale(
  p_group_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.can_access_group_communication(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.group_resources gr
  SET
    archived_at = now(),
    updated_at = now()
  WHERE gr.group_id = p_group_id
    AND gr.deleted_at IS NULL
    AND gr.archived_at IS NULL
    AND gr.is_pinned = false
    AND (
      gr.last_active_at < now() - interval '45 days'
      OR (
        gr.related_match_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.matches m
          WHERE m.id = gr.related_match_id
            AND m.match_date IS NOT NULL
            AND m.match_date < current_date
        )
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.rpc_group_resources_archive_stale(uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.can_access_group_communication(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_group_communication(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_manage_group_resources(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_manage_group_resources(uuid, uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_group_resources_archive_stale(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_resources_archive_stale(uuid) TO service_role;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_resources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_messages'
      AND policyname = 'group_messages_select_v1'
  ) THEN
    CREATE POLICY group_messages_select_v1
      ON public.group_messages
      FOR SELECT
      TO authenticated
      USING (public.can_access_group_communication(group_id, auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_messages'
      AND policyname = 'group_messages_insert_v1'
  ) THEN
    CREATE POLICY group_messages_insert_v1
      ON public.group_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        author_user_id = auth.uid()
        AND deleted_at IS NULL
        AND public.can_access_group_communication(group_id, auth.uid())
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_resources'
      AND policyname = 'group_resources_select_v1'
  ) THEN
    CREATE POLICY group_resources_select_v1
      ON public.group_resources
      FOR SELECT
      TO authenticated
      USING (
        deleted_at IS NULL
        AND public.can_access_group_communication(group_id, auth.uid())
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_resources'
      AND policyname = 'group_resources_insert_v1'
  ) THEN
    CREATE POLICY group_resources_insert_v1
      ON public.group_resources
      FOR INSERT
      TO authenticated
      WITH CHECK (
        deleted_at IS NULL
        AND owner_user_id = auth.uid()
        AND public.can_manage_group_resources(group_id, auth.uid())
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_resources'
      AND policyname = 'group_resources_update_v1'
  ) THEN
    CREATE POLICY group_resources_update_v1
      ON public.group_resources
      FOR UPDATE
      TO authenticated
      USING (public.can_manage_group_resources(group_id, auth.uid()))
      WITH CHECK (public.can_manage_group_resources(group_id, auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_resources'
      AND policyname = 'group_resources_delete_v1'
  ) THEN
    CREATE POLICY group_resources_delete_v1
      ON public.group_resources
      FOR DELETE
      TO authenticated
      USING (public.can_manage_group_resources(group_id, auth.uid()));
  END IF;
END
$$;

GRANT ALL ON TABLE public.group_messages TO authenticated;
GRANT ALL ON TABLE public.group_messages TO service_role;
GRANT ALL ON TABLE public.group_resources TO authenticated;
GRANT ALL ON TABLE public.group_resources TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'group-resources',
  'group-resources',
  true,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Group keepers can upload group resources'
  ) THEN
    CREATE POLICY "Group keepers can upload group resources"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'group-resources'
        AND public.can_manage_group_resources((storage.foldername(name))[1]::uuid, auth.uid())
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Group keepers can update group resources'
  ) THEN
    CREATE POLICY "Group keepers can update group resources"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'group-resources'
        AND public.can_manage_group_resources((storage.foldername(name))[1]::uuid, auth.uid())
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Group keepers can delete group resources'
  ) THEN
    CREATE POLICY "Group keepers can delete group resources"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'group-resources'
        AND public.can_manage_group_resources((storage.foldername(name))[1]::uuid, auth.uid())
      );
  END IF;
END
$$;
