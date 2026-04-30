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
  RETURN public.can_user_request_match_proxy_for_guest(p_guest_id, p_actor_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp_guest
      WHERE mp_guest.guest_id = p_guest_id
        AND mp_guest.removed_at IS NULL
        AND public.is_user_in_active_group_invite(mp_guest.match_id, p_actor_user_id)
    );
END;
$$;

COMMENT ON FUNCTION public.can_user_view_contact_player(uuid, uuid)
IS 'Returns true when the caller can view the Contact Player via owner/saved/shared/group/proxy trust, or through an active Invite Group path to a match where that Contact Player is a participant.';
