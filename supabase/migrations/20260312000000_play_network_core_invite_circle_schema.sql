-- =============================================================================
-- Migration: Play Network Core — Step 1: Minimal schema slice
-- Purpose: Add user_invite_circle + 3 profiles fields for Phase 1 / Invite Circle
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, playerhoods_five_pillars_implementation_v1.md
-- Scope: Schema only. No RPCs, triggers, helpers, or UI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) New table: public.user_invite_circle
-- Invite Circle: private, one-way, silent. Owner's personal convenience list.
-- No trust/membership/approval/participation semantics.
-- -----------------------------------------------------------------------------

CREATE TABLE public.user_invite_circle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'played_with_auto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_invite_circle_owner_ne_target CHECK (owner_user_id <> target_user_id),
  CONSTRAINT user_invite_circle_unique UNIQUE (owner_user_id, target_user_id)
);

COMMENT ON TABLE public.user_invite_circle IS
'Phase 1 Play Network Core: Private one-way list. Owner convenience only. Silent (no notification). Not trust/membership/approval.';
COMMENT ON COLUMN public.user_invite_circle.source IS 'manual = user saved; played_with_auto = future auto-add from played-with (not implemented yet).';

CREATE INDEX idx_user_invite_circle_owner_created
  ON public.user_invite_circle (owner_user_id, created_at DESC);

ALTER TABLE public.user_invite_circle ENABLE ROW LEVEL SECURITY;

CREATE POLICY uic_select_own ON public.user_invite_circle
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

CREATE POLICY uic_insert_own ON public.user_invite_circle
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY uic_delete_own ON public.user_invite_circle
  FOR DELETE TO authenticated USING (owner_user_id = auth.uid());

-- No UPDATE policy: Invite Circle rows are immutable. Target has no access.

-- -----------------------------------------------------------------------------
-- 2) New columns: public.profiles
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_in_club_member_discovery boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_non_group_invites boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_add_played_users_to_invite_circle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.show_in_club_member_discovery IS
'Phase 1: Discoverability. Whether user appears in club member discovery. Distinct from invite permission.';
COMMENT ON COLUMN public.profiles.allow_non_group_invites IS
'Phase 1: Invite permission. Whether user may be invited via non-group direct path (Club Members / Invite Circle). Distinct from discoverability.';
COMMENT ON COLUMN public.profiles.auto_add_played_users_to_invite_circle IS
'Phase 1: Preference for future auto-add. When true, played-with users may be auto-added to Invite Circle. No logic implemented yet.';
