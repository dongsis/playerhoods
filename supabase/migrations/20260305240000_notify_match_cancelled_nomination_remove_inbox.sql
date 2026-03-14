-- v1.7: Notify users on match cancelled, nomination, remove.
--       All confirmed/pending participants + nominators get match_cancelled.
--       Nominees get nominated/invited. Removed users get removed.
--
-- 1) Trigger on matches: status -> cancelled
-- 2) Extend match_participants trigger: also notify removed user
-- 3) Trigger on match_participants INSERT: notify invitee/nominee

-- =============================================================================
-- 1) Trigger: notify on match cancelled
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_notify_on_match_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  FOR v_uid IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u
      FROM public.match_participants
      WHERE match_id = NEW.id
        AND user_id IS NOT NULL
        AND status IN ('confirmed', 'pending')
      UNION
      SELECT nominated_by AS u
      FROM public.match_participants
      WHERE match_id = NEW.id
        AND nominated_by IS NOT NULL
    ) t
    WHERE u IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      v_uid, 'match_cancelled', NEW.id, NULL, auth.uid(), NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_match_cancelled ON public.matches;
CREATE TRIGGER notify_on_match_cancelled
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_notify_on_match_cancelled();

-- =============================================================================
-- 2) Extend trg_notify_delegator_on_mp_change: also notify removed user
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
  -- Removed: notify delegator AND the removed user (if user participant)
  IF (NEW.removed_at IS DISTINCT FROM OLD.removed_at) AND NEW.removed_at IS NOT NULL THEN
    v_kind := 'delegate_target_removed';

    -- Notify delegator
    IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
      v_delegator := NEW.manual_confirmed_by;
    ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
      v_delegator := NEW.nominated_by;
    ELSIF NEW.guest_id IS NOT NULL THEN
      SELECT organizer_id INTO v_delegator
      FROM public.matches
      WHERE id = NEW.match_id;
    END IF;

    IF v_delegator IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
      );
    END IF;

    -- Notify the removed user (skip when self-removed)
    IF NEW.user_id IS NOT NULL AND NEW.user_id <> v_actor THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        NEW.user_id, 'removed', NEW.match_id, NEW.id, v_actor, NEW.removal_note
      );
    END IF;

    RETURN NEW;
  END IF;

  -- Confirmed: notify delegator only
  IF (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) AND NEW.confirmed_at IS NOT NULL THEN
    v_kind := 'delegate_target_confirmed';

    IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
      v_delegator := NEW.manual_confirmed_by;
    ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
      v_delegator := NEW.nominated_by;
    ELSIF NEW.guest_id IS NOT NULL THEN
      SELECT organizer_id INTO v_delegator
      FROM public.matches
      WHERE id = NEW.match_id;
    END IF;

    IF v_delegator IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3) Trigger: notify on invite/nomination (new participant inserted)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_notify_on_invite_nominate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;  -- guests: no user to notify
  END IF;

  IF NEW.join_method = 'invited' THEN
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      NEW.user_id, 'invited', NEW.match_id, NEW.id, COALESCE(NEW.created_by, auth.uid()), NULL
    );
  ELSIF NEW.join_method = 'nominated' THEN
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      NEW.user_id, 'nominated', NEW.match_id, NEW.id, COALESCE(NEW.nominated_by, auth.uid()), NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_invite_nominate ON public.match_participants;
CREATE TRIGGER notify_on_invite_nominate
  AFTER INSERT ON public.match_participants
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL AND NEW.join_method IN ('invited', 'nominated'))
  EXECUTE FUNCTION public.trg_notify_on_invite_nominate();
