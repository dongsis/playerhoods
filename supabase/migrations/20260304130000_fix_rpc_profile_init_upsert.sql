-- Fix rpc_profile_init to UPSERT into public.profiles.
-- Previous version only UPDATEd and was a no-op when the row did not exist,
-- leaving profiles empty while the RPC still returned 204.

CREATE OR REPLACE FUNCTION public.rpc_profile_init(
  p_display_name text,
  p_first_name   text DEFAULT NULL,
  p_last_name    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed      text;
  v_current_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_display_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  -- Preserve existing "already_initialized" behavior:
  -- if a non-empty display_name already exists, raise and do not modify the row.
  SELECT display_name INTO v_current_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_current_name IS NOT NULL AND v_current_name <> '' THEN
    RAISE EXCEPTION 'already_initialized';
  END IF;

  -- First-time init or empty-name row: UPSERT so that a missing profile row
  -- is created and an existing empty row is updated.
  INSERT INTO public.profiles (id, display_name, first_name, last_name)
  VALUES (
    auth.uid(),
    v_trimmed,
    NULLIF(trim(coalesce(p_first_name, '')), ''),
    NULLIF(trim(coalesce(p_last_name,  '')), '')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    first_name   = EXCLUDED.first_name,
    last_name    = EXCLUDED.last_name;
END;
$$;

