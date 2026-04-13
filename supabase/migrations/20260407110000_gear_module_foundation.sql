-- Gear module foundation:
-- - Owned Gear / Wishlist items
-- - Item and standalone showcase photos
-- - Racket string job history
-- - Showcase ordering / visibility

CREATE TABLE IF NOT EXISTS public.gear_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  collection_type text NOT NULL,
  category text NOT NULL,
  item_name text NOT NULL,
  gear_type text,
  current_status text,
  purchase_date date,
  purchase_price numeric(10,2),
  source_link text,
  source_price numeric(10,2),
  bought_from text,
  nickname text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recognition_confidence text,
  recognition_detected_text text[] NOT NULL DEFAULT '{}'::text[],
  visible_in_showcase boolean NOT NULL DEFAULT false,
  showcase_note text,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gear_items_collection_type_check
    CHECK (collection_type IN ('owned', 'wishlist')),
  CONSTRAINT gear_items_category_check
    CHECK (category IN ('rackets', 'shoes', 'apparel', 'strings', 'accessories', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_gear_items_owner_collection
  ON public.gear_items(owner_user_id, collection_type, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gear_items_owner_showcase
  ON public.gear_items(owner_user_id, visible_in_showcase)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at__gear_items ON public.gear_items;
CREATE TRIGGER set_updated_at__gear_items
BEFORE UPDATE ON public.gear_items
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

CREATE TABLE IF NOT EXISTS public.gear_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gear_item_id uuid REFERENCES public.gear_items(id) ON DELETE CASCADE,
  image_kind text NOT NULL DEFAULT 'item',
  storage_path text NOT NULL,
  public_url text NOT NULL,
  cutout_storage_path text,
  cutout_public_url text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gear_images_kind_check
    CHECK (image_kind IN ('item', 'setup_photo')),
  CONSTRAINT gear_images_item_required_for_item_kind
    CHECK (
      (image_kind = 'item' AND gear_item_id IS NOT NULL)
      OR image_kind = 'setup_photo'
    )
);

CREATE INDEX IF NOT EXISTS idx_gear_images_owner_item
  ON public.gear_images(owner_user_id, gear_item_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.gear_string_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gear_item_id uuid NOT NULL REFERENCES public.gear_items(id) ON DELETE CASCADE,
  strung_at date NOT NULL,
  string_name text,
  string_brand text,
  string_type text,
  string_shape text,
  gauge text,
  tension_mains numeric(5,2),
  tension_crosses numeric(5,2),
  strung_by text,
  cost numeric(10,2),
  first_impression text,
  follow_up_feel text,
  ended_at date,
  ended_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gear_string_jobs_item
  ON public.gear_string_jobs(owner_user_id, gear_item_id, strung_at DESC, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at__gear_string_jobs ON public.gear_string_jobs;
CREATE TRIGGER set_updated_at__gear_string_jobs
BEFORE UPDATE ON public.gear_string_jobs
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

CREATE TABLE IF NOT EXISTS public.gear_showcase_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  gear_item_id uuid REFERENCES public.gear_items(id) ON DELETE CASCADE,
  gear_image_id uuid REFERENCES public.gear_images(id) ON DELETE CASCADE,
  is_visible boolean NOT NULL DEFAULT true,
  pinned boolean NOT NULL DEFAULT false,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  display_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gear_showcase_entries_source_type_check
    CHECK (source_type IN ('owned_item', 'wishlist_item', 'photo')),
  CONSTRAINT gear_showcase_entries_source_target_check
    CHECK (
      (
        source_type IN ('owned_item', 'wishlist_item')
        AND gear_item_id IS NOT NULL
        AND gear_image_id IS NULL
      )
      OR (
        source_type = 'photo'
        AND gear_item_id IS NULL
        AND gear_image_id IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gear_showcase_item_unique
  ON public.gear_showcase_entries(owner_user_id, gear_item_id)
  WHERE gear_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gear_showcase_photo_unique
  ON public.gear_showcase_entries(owner_user_id, gear_image_id)
  WHERE gear_image_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gear_showcase_owner_sort
  ON public.gear_showcase_entries(owner_user_id, sort_order, created_at);

DROP TRIGGER IF EXISTS set_updated_at__gear_showcase_entries ON public.gear_showcase_entries;
CREATE TRIGGER set_updated_at__gear_showcase_entries
BEFORE UPDATE ON public.gear_showcase_entries
FOR EACH ROW
EXECUTE FUNCTION public.tg__set_updated_at();

ALTER TABLE public.gear_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_string_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_showcase_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gear_items_owner_select ON public.gear_items;
CREATE POLICY gear_items_owner_select
ON public.gear_items
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_items_owner_insert ON public.gear_items;
CREATE POLICY gear_items_owner_insert
ON public.gear_items
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_items_owner_update ON public.gear_items;
CREATE POLICY gear_items_owner_update
ON public.gear_items
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_items_owner_delete ON public.gear_items;
CREATE POLICY gear_items_owner_delete
ON public.gear_items
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_images_owner_select ON public.gear_images;
CREATE POLICY gear_images_owner_select
ON public.gear_images
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_images_owner_insert ON public.gear_images;
CREATE POLICY gear_images_owner_insert
ON public.gear_images
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_images_owner_update ON public.gear_images;
CREATE POLICY gear_images_owner_update
ON public.gear_images
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_images_owner_delete ON public.gear_images;
CREATE POLICY gear_images_owner_delete
ON public.gear_images
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_string_jobs_owner_select ON public.gear_string_jobs;
CREATE POLICY gear_string_jobs_owner_select
ON public.gear_string_jobs
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_string_jobs_owner_insert ON public.gear_string_jobs;
CREATE POLICY gear_string_jobs_owner_insert
ON public.gear_string_jobs
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_string_jobs_owner_update ON public.gear_string_jobs;
CREATE POLICY gear_string_jobs_owner_update
ON public.gear_string_jobs
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_string_jobs_owner_delete ON public.gear_string_jobs;
CREATE POLICY gear_string_jobs_owner_delete
ON public.gear_string_jobs
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_showcase_entries_owner_select ON public.gear_showcase_entries;
CREATE POLICY gear_showcase_entries_owner_select
ON public.gear_showcase_entries
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_showcase_entries_owner_insert ON public.gear_showcase_entries;
CREATE POLICY gear_showcase_entries_owner_insert
ON public.gear_showcase_entries
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_showcase_entries_owner_update ON public.gear_showcase_entries;
CREATE POLICY gear_showcase_entries_owner_update
ON public.gear_showcase_entries
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS gear_showcase_entries_owner_delete ON public.gear_showcase_entries;
CREATE POLICY gear_showcase_entries_owner_delete
ON public.gear_showcase_entries
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

GRANT ALL ON TABLE public.gear_items TO authenticated;
GRANT ALL ON TABLE public.gear_images TO authenticated;
GRANT ALL ON TABLE public.gear_string_jobs TO authenticated;
GRANT ALL ON TABLE public.gear_showcase_entries TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gear-media',
  'gear-media',
  true,
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
      AND policyname = 'Users can upload own gear media'
  ) THEN
    CREATE POLICY "Users can upload own gear media"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'gear-media'
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
      AND policyname = 'Users can update own gear media'
  ) THEN
    CREATE POLICY "Users can update own gear media"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'gear-media'
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
      AND policyname = 'Users can delete own gear media'
  ) THEN
    CREATE POLICY "Users can delete own gear media"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'gear-media'
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
      AND policyname = 'Gear media is publicly readable'
  ) THEN
    CREATE POLICY "Gear media is publicly readable"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'gear-media');
  END IF;
END
$$;
