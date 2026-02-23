-- Migration: v1.5 Phase 3 — Create match_participant_actions table
--
-- This table records notable lifecycle events on match participants:
--   'reenter'       — removed participant re-entered via invite/nominate/request
--   'manual_confirm' — ORG manually confirmed a participant (skipping normal dual-confirm)
--
-- Previously existed in production as an informal table (created manually).
-- This migration makes it part of the schema formally.

BEGIN;

CREATE TABLE IF NOT EXISTS public.match_participant_actions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  match_participant_id uuid NOT NULL REFERENCES public.match_participants(id) ON DELETE CASCADE,
  action_type          text NOT NULL,
  note                 text,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_participant_actions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.match_participant_actions IS
  'v1.5: Lifecycle event log for match participants. '
  'action_type values: reenter (removed user re-entered), manual_confirm (ORG manual override). '
  'Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';

-- Organizer can read action log for their matches
CREATE POLICY match_participant_actions_select_organizer
ON public.match_participant_actions FOR SELECT
TO authenticated
USING (
  public.is_match_organizer(match_id, auth.uid())
);

-- No direct INSERT/UPDATE/DELETE by authenticated — all writes via SECURITY DEFINER RPCs

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'match_participant_actions'
  ) THEN
    RAISE EXCEPTION 'v1.5-3: match_participant_actions table not created';
  END IF;

  RAISE NOTICE 'v1.5-3 complete: match_participant_actions table created';
END $$;

COMMIT;
