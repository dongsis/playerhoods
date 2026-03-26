-- Migration: v1.6.3 — notifications + venue info (portable, no SQL IF [NOT] EXISTS)
BEGIN;

SET check_function_bodies = false;
SET search_path = public;

-- =============================================================================
-- 1) notifications table + RLS + policies + index
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_user_id uuid NOT NULL,
      kind text NOT NULL,
      match_id uuid NULL,
      match_participant_id uuid NULL,
      actor_user_id uuid NULL,
      note text NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz NULL
    );
  END IF;
END$$;

-- Enable RLS (idempotent)
DO $$
BEGIN
  -- relrowsecurity: RLS enabled flag on pg_class
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'notifications'
      AND c.relrowsecurity = false
  ) THEN
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  END IF;
END$$;

-- SELECT policy: recipients can read their notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'select_own_notifications'
  ) THEN
    CREATE POLICY select_own_notifications ON public.notifications
      FOR SELECT
      USING (recipient_user_id = auth.uid());
  END IF;
END$$;

-- UPDATE policy: recipients can update their notifications (e.g., mark read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'update_own_notifications'
  ) THEN
    CREATE POLICY update_own_notifications ON public.notifications
      FOR UPDATE
      USING (recipient_user_id = auth.uid())
      WITH CHECK (recipient_user_id = auth.uid());
  END IF;
END$$;

-- Index: idx_notifications_recipient_created_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'idx_notifications_recipient_created_at'
  ) THEN
    CREATE INDEX idx_notifications_recipient_created_at
      ON public.notifications (recipient_user_id, created_at DESC);
  END IF;
END$$;

-- =============================================================================
-- 1.a) Trigger: notify delegator when delegated participant changes
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_delegator_on_mp_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delegator uuid;
  v_kind text;
  v_actor uuid := auth.uid();
BEGIN
  -- Only act on meaningful transitions
  IF (NEW.removed_at IS DISTINCT FROM OLD.removed_at) AND NEW.removed_at IS NOT NULL THEN
    v_kind := 'delegate_target_removed';
  ELSIF (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) AND NEW.confirmed_at IS NOT NULL THEN
    v_kind := 'delegate_target_confirmed';
  ELSE
    RETURN NEW;
  END IF;

  -- Determine delegator by precedence
  IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
    v_delegator := NEW.manual_confirmed_by;
  ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
    v_delegator := NEW.nominated_by;
  ELSIF NEW.guest_id IS NOT NULL THEN
    SELECT organizer_id INTO v_delegator
    FROM public.matches
    WHERE id = NEW.match_id;
  END IF;

  IF v_delegator IS NULL THEN
    RETURN NEW; -- nothing to notify
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
  ) VALUES (
    v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
  );

  RETURN NEW;
END;
$$;

-- Drop trigger if exists (no "DROP TRIGGER IF EXISTS")
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'match_participants'
      AND t.tgname  = 'notify_delegator_on_mp_change'
      AND NOT t.tgisinternal
  ) THEN
    DROP TRIGGER notify_delegator_on_mp_change ON public.match_participants;
  END IF;
END$$;

CREATE TRIGGER notify_delegator_on_mp_change
AFTER UPDATE OF confirmed_at, removed_at ON public.match_participants
FOR EACH ROW
WHEN (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.removed_at IS DISTINCT FROM OLD.removed_at)
EXECUTE FUNCTION public.trg_notify_delegator_on_mp_change();

-- =============================================================================
-- 2) club_sports: venue sports + court counts
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.club_sports') IS NULL THEN
    CREATE TABLE public.club_sports (
      club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
      sport_id smallint NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
      court_count integer NOT NULL DEFAULT 0 CHECK (court_count >= 0),
      PRIMARY KEY (club_id, sport_id)
    );
  END IF;
END$$;

-- =============================================================================
-- 3) Drop unused fields (portable: check information_schema first)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'matches'
      AND column_name  = 'admission_mode'
  ) THEN
    ALTER TABLE public.matches DROP COLUMN admission_mode;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'match_participants'
      AND column_name  = 'user_accepted_at'
  ) THEN
    ALTER TABLE public.match_participants DROP COLUMN user_accepted_at;
  END IF;
END$$;

-- =============================================================================
-- 3.a) groups: add group_kind + check constraint (portable)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'groups'
      AND column_name  = 'group_kind'
  ) THEN
    ALTER TABLE public.groups
      ADD COLUMN group_kind text NOT NULL DEFAULT 'friend';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname  = 'chk_groups_group_kind'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT chk_groups_group_kind
      CHECK (group_kind IN ('friend','club'));
  END IF;
END$$;

COMMIT;