-- v1.7: Add contact channel preference for each user (email or SMS).
--       contact_email defaults to auth email, user can override in profile.
--       contact_phone for SMS option.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_channel text NOT NULL DEFAULT 'email'
  CHECK (contact_channel IN ('email', 'sms'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN public.profiles.contact_channel IS 'Preferred contact channel: email or sms';
COMMENT ON COLUMN public.profiles.contact_email IS 'Contact email. NULL = use auth.users.email. User can override in profile.';
COMMENT ON COLUMN public.profiles.contact_phone IS 'Contact phone for SMS. Used when contact_channel=sms';

-- Extend rpc_profile_update to accept contact fields
CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_contact_channel text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name      = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name       = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email','sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email   = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone   = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    updated_at      = now()
  WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.rpc_profile_update(text, text, text, text, text) IS
'v1.7: Update profile. contact_channel: email|sms. contact_email: override or NULL to use auth email. contact_phone for SMS.';
