-- =============================================================================
-- Phase 2: Contact Player resolution layer
-- Single source for "guest vs linked user" state. Replaces scattered logic
-- across ContactsPanel, InviteGuestForm, and getRosterGuestContactLinks.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_contact_player_resolution()
RETURNS TABLE(
  guest_id uuid,
  display_name text,
  email text,
  phone text,
  notes text,
  linked_user_id uuid,
  resolution_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.id AS guest_id,
    g.display_name,
    g.email,
    g.phone,
    g.notes,
    il.user_id AS linked_user_id,
    CASE WHEN il.user_id IS NOT NULL THEN 'linked_user'::text ELSE 'contact_only'::text END AS resolution_state
  FROM public.user_roster_guests urg
  JOIN public.guests g ON g.id = urg.guest_id
  LEFT JOIN public.identity_links il
    ON il.linked_type = 'contact' AND il.linked_id = g.id
  WHERE urg.owner_user_id = auth.uid()
  ORDER BY g.display_name, g.id;
END;
$$;

COMMENT ON FUNCTION public.rpc_contact_player_resolution() IS
'Phase 2: Contact Player resolution. Returns caller roster guests with linked_user_id (nullable) and resolution_state (contact_only | linked_user). Single source for guest vs registered-user logic.';

GRANT EXECUTE ON FUNCTION public.rpc_contact_player_resolution() TO authenticated;
