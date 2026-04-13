-- Temporary screenshot uploads for Contact Player import review flow.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-imports',
  'contact-imports',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
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
      AND policyname = 'Users can upload own contact import screenshots'
  ) THEN
    CREATE POLICY "Users can upload own contact import screenshots"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'contact-imports'
        AND (storage.foldername(name))[1] = auth.uid()::text
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
      AND policyname = 'Users can read own contact import screenshots'
  ) THEN
    CREATE POLICY "Users can read own contact import screenshots"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'contact-imports'
        AND (storage.foldername(name))[1] = auth.uid()::text
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
      AND policyname = 'Users can delete own contact import screenshots'
  ) THEN
    CREATE POLICY "Users can delete own contact import screenshots"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'contact-imports'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END
$$;
