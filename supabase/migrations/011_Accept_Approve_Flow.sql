-- ============================================================================
-- Migration 011: Accept / Approve Flow (pending -> active)
-- Depends on:
--   docs/constitution/Group Constitution.md
--   docs/specs/GroupContract_v1.md
--   docs/governance/Group Governance – Technical Appendix.md
--   supabase/migrations/007_create_groups.sql
--   supabase/migrations/008_group_creation_semantics.sql
--   supabase/migrations/009_group_details_view_alignment.sql
--   supabase/migrations/010_invite_flow_rls.sql
-- ============================================================================

-- Safety: remove any legacy UPDATE policies
DROP POLICY IF EXISTS can_accept_group_member ON public.group_members;
DROP POLICY IF EXISTS can_update_group_member ON public.group_members;

-- ----------------------------------------------------------------------------
-- Policy: can_accept_group_member
-- pending -> active
-- ----------------------------------------------------------------------------
CREATE POLICY can_accept_group_member
ON public.group_members
FOR UPDATE
USING (
  -- Only pending rows can be acted upon
  status = 'pending'
)
WITH CHECK (
  -- Transition strictly to active
  status = 'active'
  AND (
    -- ------------------------------------------------------------------------
    -- Direct groups: self-accept only
    -- ------------------------------------------------------------------------
    (
      EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.group_type = 'direct'
      )
      AND group_members.user_id = auth.uid()
    )

    OR

    -- ------------------------------------------------------------------------
    -- Organized groups: boundary_keeper approves
    -- ------------------------------------------------------------------------
    (
      EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.group_type = 'organized'
          AND g.boundary_keeper_user_id = auth.uid()
      )
    )
  )
);
