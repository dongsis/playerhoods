-- Broaden saved-player provenance without changing the underlying private user->user relation.

ALTER TABLE public.user_invite_circle
  DROP CONSTRAINT IF EXISTS user_invite_circle_source_check;

ALTER TABLE public.user_invite_circle
  ADD CONSTRAINT user_invite_circle_source_check
  CHECK (
    source = ANY (
      ARRAY[
        'manual'::text,
        'venue_member'::text,
        'group_member'::text,
        'match_player'::text,
        'played_with_auto'::text
      ]
    )
  );

COMMENT ON COLUMN public.user_invite_circle.source IS
'manual = generic save; venue_member = saved from venue/club discovery; group_member = saved from a group roster; match_player = saved from a shared match; played_with_auto = reserved for future automation.';

CREATE OR REPLACE FUNCTION public.rpc_invite_circle_save_user(
  p_target_user_id uuid,
  p_source text DEFAULT 'manual'
)
RETURNS public.user_invite_circle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_invite_circle;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_save_self';
  END IF;

  IF p_source IS NULL OR p_source NOT IN (
    'manual',
    'venue_member',
    'group_member',
    'match_player',
    'played_with_auto'
  ) THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  INSERT INTO public.user_invite_circle (owner_user_id, target_user_id, source)
  VALUES (v_uid, p_target_user_id, p_source)
  ON CONFLICT (owner_user_id, target_user_id)
  DO UPDATE SET source = user_invite_circle.source
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_invite_circle_save_user(uuid, text) IS
'Save target to caller Invite Circle / Saved Players. Idempotent. Private, silent, and source-aware for UI provenance.';
