-- rpc_profile_init: use empty string for first_name/last_name when not provided
-- profiles.first_name and profiles.last_name are NOT NULL; avoid inserting NULL

CREATE OR REPLACE FUNCTION public.rpc_profile_init(
  p_display_name text,
  p_first_name   text DEFAULT NULL,
  p_last_name    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_trimmed      text;
  v_current_name text;
  v_first        text;
  v_last         text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_display_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  -- Use '' for first/last when not provided (profiles columns are NOT NULL)
  v_first := COALESCE(NULLIF(trim(coalesce(p_first_name, '')), ''), '');
  v_last  := COALESCE(NULLIF(trim(coalesce(p_last_name,  '')), ''), '');

  SELECT display_name INTO v_current_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_current_name IS NOT NULL AND v_current_name <> '' THEN
    RAISE EXCEPTION 'already_initialized';
  END IF;

  INSERT INTO public.profiles (id, display_name, first_name, last_name)
  VALUES (auth.uid(), v_trimmed, v_first, v_last)
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    first_name   = EXCLUDED.first_name,
    last_name    = EXCLUDED.last_name;
END;
$$;
