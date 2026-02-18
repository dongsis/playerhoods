-- Migration: match_courts junction table
-- Replaces matches.court_ids uuid[] with a proper normalized table.
-- Each row = one court slot for a match, with per-slot metadata.
-- NOTE: court_ids column is NOT dropped here — will be removed in a future migration
-- after confirming no production code/views still reference it.

-- ============================================================================
-- 1. Create match_courts table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.match_courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  slot_index int NOT NULL,
  court_label text NOT NULL,
  court_location text,
  court_notes text,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_match_court_slot UNIQUE (match_id, slot_index),
  CONSTRAINT chk_slot_index CHECK (slot_index BETWEEN 1 AND 12)
);

-- ============================================================================
-- 2. RLS policies
-- ============================================================================

ALTER TABLE public.match_courts ENABLE ROW LEVEL SECURITY;

-- Any match participant (pending or confirmed, including organizer) can read court slots.
-- Pending participants need to see match details to decide whether to accept.
CREATE POLICY match_courts_select ON public.match_courts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id AND m.organizer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_courts.match_id
        AND mp.user_id = auth.uid()
        AND mp.status IN ('pending', 'confirmed')
    )
  );

-- Organizer can insert court slots; must provide created_by = auth.uid()
CREATE POLICY match_courts_insert ON public.match_courts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND organizer_id = auth.uid())
  );

-- Organizer can update court slots
CREATE POLICY match_courts_update ON public.match_courts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND organizer_id = auth.uid()));

-- Organizer can delete court slots
CREATE POLICY match_courts_delete ON public.match_courts
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.matches WHERE id = match_id AND organizer_id = auth.uid()));

-- ============================================================================
-- 3. Migrate existing data from matches.court_ids (conditional)
--    Only runs if court_ids column and courts table both exist.
--    Uses WITH ORDINALITY ord to preserve original array order.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'court_ids'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'courts'
  ) THEN
    INSERT INTO public.match_courts (match_id, slot_index, court_label, created_by)
    SELECT
      m.id,
      u.ord::int AS slot_index,
      c.court_code,
      m.organizer_id
    FROM public.matches m
    CROSS JOIN LATERAL unnest(m.court_ids) WITH ORDINALITY AS u(court_id, ord)
    JOIN public.courts c ON c.id = u.court_id
    WHERE m.court_ids IS NOT NULL AND array_length(m.court_ids, 1) > 0
    ON CONFLICT (match_id, slot_index) DO NOTHING;

    RAISE NOTICE 'Migrated existing court_ids data to match_courts.';
  ELSE
    RAISE NOTICE 'Skipped court_ids migration: column or courts table not found.';
  END IF;
END $$;

-- ============================================================================
-- 4. Update rpc_match_create: remove p_court_ids parameter
--    Diagnostic check for overloads, then drop known signatures.
-- ============================================================================

-- Diagnostic: warn if unexpected overloads exist
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'rpc_match_create'
    AND pronamespace = 'public'::regnamespace;

  IF v_count > 1 THEN
    RAISE WARNING 'rpc_match_create has % overloads — dropping all known signatures', v_count;
  ELSIF v_count = 1 THEN
    RAISE NOTICE 'rpc_match_create has 1 signature — will replace';
  ELSE
    RAISE NOTICE 'rpc_match_create does not exist yet — will create';
  END IF;
END $$;

-- Drop known signatures (old with p_court_ids, new without)
DROP FUNCTION IF EXISTS public.rpc_match_create(int, text, date, time, int, uuid, uuid[], uuid[], boolean, boolean, boolean);
DROP FUNCTION IF EXISTS public.rpc_match_create(int, text, date, time, int, uuid, uuid[], boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_required_count int DEFAULT 4,
  p_game_type text DEFAULT 'doubles',
  p_match_date date DEFAULT NULL,
  p_start_time time DEFAULT NULL,
  p_duration_minutes int DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_invitation_scope_group_ids uuid[] DEFAULT NULL,
  p_can_participants_invite_users boolean DEFAULT false,
  p_can_participants_add_guests boolean DEFAULT false,
  p_can_participants_manage_participants boolean DEFAULT false
)
RETURNS matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match matches;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO matches (
    organizer_id,
    required_count,
    game_type,
    match_date,
    start_time,
    duration_minutes,
    club_id,
    invitation_scope_group_ids,
    can_participants_invite_users,
    can_participants_add_guests,
    can_participants_manage_participants
  ) VALUES (
    v_user_id,
    COALESCE(p_required_count, 4),
    COALESCE(p_game_type, 'doubles'),
    COALESCE(p_match_date, (now() AT TIME ZONE 'utc')::date),
    COALESCE(p_start_time, time '09:00'),
    COALESCE(p_duration_minutes, 90),
    p_club_id,
    COALESCE(p_invitation_scope_group_ids, '{}'),
    COALESCE(p_can_participants_invite_users, false),
    COALESCE(p_can_participants_add_guests, false),
    COALESCE(p_can_participants_manage_participants, false)
  )
  RETURNING * INTO v_match;

  -- Auto-add organizer as confirmed participant
  INSERT INTO match_participants (
    match_id, user_id, join_method, status,
    user_accepted_at, org_approved_at, org_approved_by, created_by
  ) VALUES (
    v_match.id, v_user_id, 'invited', 'confirmed',
    now(), now(), v_user_id, v_user_id
  );

  PERFORM match_participant_reconcile_status(
    (SELECT id FROM match_participants WHERE match_id = v_match.id AND user_id = v_user_id)
  );

  RETURN v_match;
END;
$$;

COMMENT ON FUNCTION rpc_match_create IS
  'Creates a match and auto-adds organizer as confirmed participant. Court slots added separately via match_courts table.';

GRANT EXECUTE ON FUNCTION rpc_match_create TO authenticated;
