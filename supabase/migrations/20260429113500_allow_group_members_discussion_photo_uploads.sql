CREATE OR REPLACE FUNCTION public.can_upload_group_discussion_photos(
  p_group_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.can_access_group_communication(p_group_id, p_user_id);
$$;

ALTER FUNCTION public.can_upload_group_discussion_photos(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.can_upload_group_discussion_photos(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_upload_group_discussion_photos(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS group_resources_insert_v1 ON public.group_resources;

CREATE POLICY group_resources_insert_v1
  ON public.group_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND owner_user_id = auth.uid()
    AND (
      public.can_manage_group_resources(group_id, auth.uid())
      OR (
        resource_type = 'file'
        AND tag = 'Photo'
        AND storage_bucket = 'group-resources'
        AND split_part(coalesce(storage_path, ''), '/', 1) = group_id::text
        AND split_part(coalesce(storage_path, ''), '/', 2) = 'discussion'
        AND public.can_upload_group_discussion_photos(group_id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Group keepers can upload group resources" ON storage.objects;
DROP POLICY IF EXISTS "Group members can upload discussion photos and keepers can upload group resources" ON storage.objects;

CREATE POLICY "Group members can upload discussion photos and keepers can upload group resources"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'group-resources'
    AND (
      public.can_manage_group_resources((storage.foldername(name))[1]::uuid, auth.uid())
      OR (
        (storage.foldername(name))[2] = 'discussion'
        AND public.can_upload_group_discussion_photos((storage.foldername(name))[1]::uuid, auth.uid())
      )
    )
  );
