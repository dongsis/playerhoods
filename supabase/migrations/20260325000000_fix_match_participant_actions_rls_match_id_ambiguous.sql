-- =============================================================================
-- Fix: "column reference match_id is ambiguous" in match_participant_actions RLS
-- Qualify match_id with table name in policies that may be combined.
-- =============================================================================

-- 1) match_participant_actions_select_organizer
DROP POLICY IF EXISTS match_participant_actions_select_organizer ON public.match_participant_actions;
CREATE POLICY match_participant_actions_select_organizer
ON public.match_participant_actions FOR SELECT TO authenticated
USING (public.is_match_organizer(match_participant_actions.match_id, auth.uid()));

-- 2) mpa_select_in_scope
DROP POLICY IF EXISTS mpa_select_in_scope ON public.match_participant_actions;
CREATE POLICY mpa_select_in_scope
ON public.match_participant_actions FOR SELECT TO authenticated
USING (
  public.is_caller_in_match_scope(match_participant_actions.match_id)
  OR public.is_caller_match_associated(match_participant_actions.match_id)
);
