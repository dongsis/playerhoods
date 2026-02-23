-- Migration: v1.5 Phase 1A — Add participant-accepted-side fields
-- Description: Additive-only. No renames, no drops, no data changes.
-- Adds: participant_accepted_at, participant_accepted_via, manual_confirmed_by
-- These are the v1.5 replacements for user_accepted_at (not dropped here; dropped in 1G).

-- Run diagnostic queries Q1–Q3 against the live DB before applying this migration:
--
--   Q1: Status distribution across all scope groups
--   SELECT g.name, gm.status, count(*)
--   FROM group_members gm JOIN groups g ON g.id = gm.group_id
--   WHERE gm.group_id = ANY(
--     SELECT unnest(invitation_scope_group_ids) FROM matches
--     WHERE status='active' AND invitation_scope_group_ids IS NOT NULL)
--   GROUP BY g.name, gm.status ORDER BY g.name, gm.status;
--
--   Q2: Confirm enum labels
--   SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'group_member_status';
--
--   Q3: Matches with scope groups where NO active member exists
--   SELECT m.id, m.invitation_scope_group_ids,
--     (SELECT count(*) FROM group_members gm
--      WHERE gm.group_id = ANY(m.invitation_scope_group_ids) AND gm.status='active') AS active_member_count
--   FROM matches m WHERE m.status='active' AND m.invitation_scope_group_ids IS NOT NULL
--   ORDER BY active_member_count;

BEGIN;

-- ============================================================================
-- 1. Add participant_accepted_at
-- ============================================================================

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS participant_accepted_at timestamptz NULL;

COMMENT ON COLUMN public.match_participants.participant_accepted_at IS
  'v1.5: Participant-side confirmation timestamp. Replaces user_accepted_at. '
  'Written by: rpc_match_accept_invite (in_app), rpc_match_manual_confirm (manual). '
  'Never written directly by UI or non-RPC code.';

-- ============================================================================
-- 2. Add participant_accepted_via
-- ============================================================================

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS participant_accepted_via text NULL
  CONSTRAINT chk_participant_accepted_via
    CHECK (participant_accepted_via IS NULL OR participant_accepted_via IN ('in_app', 'manual'));

COMMENT ON COLUMN public.match_participants.participant_accepted_via IS
  'v1.5: How participant confirmed. in_app = user clicked Accept; manual = organizer confirmed on their behalf. '
  'Must be set whenever participant_accepted_at is set. Cleared on reconfirm.';

-- ============================================================================
-- 3. Add manual_confirmed_by
-- ============================================================================

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS manual_confirmed_by uuid NULL
  REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.match_participants.manual_confirmed_by IS
  'v1.5: User ID of organizer who manually confirmed this participant. '
  'Set only when participant_accepted_via = ''manual''. Cleared on reconfirm.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_participants'
      AND column_name = 'participant_accepted_at'
  ) THEN
    RAISE EXCEPTION 'v1.5-1A: participant_accepted_at not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_participants'
      AND column_name = 'participant_accepted_via'
  ) THEN
    RAISE EXCEPTION 'v1.5-1A: participant_accepted_via not added';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'match_participants'
      AND column_name = 'manual_confirmed_by'
  ) THEN
    RAISE EXCEPTION 'v1.5-1A: manual_confirmed_by not added';
  END IF;

  RAISE NOTICE 'v1.5-1A complete: participant_accepted_at, participant_accepted_via, manual_confirmed_by added';
END $$;

COMMIT;
