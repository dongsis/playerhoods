-- ============================================================================
-- Migration 012: Removal / Exit Semantics (active -> removed)
-- Depends on:
--   docs/constitution/Group Constitution.md
--   docs/specs/GroupContract_v1.md
--   docs/governance/Group Governance – Technical Appendix.md
--   supabase/migrations/007_create_groups.sql
--   supabase/migrations/008_group_creation_semantics.sql
--   supabase/migrations/009_group_details_view_alignment.sql
--   supabase/migrations/010_invite_flow_rls.sql
--   supabase/migrations/011_accept_flow_rls.sql
-- ============================================================================

-- Safety: ensure no broad UPDATE policies remain
DROP POLICY IF EXISTS can_remove_group_member ON public.group_members;

-- ----------------------------------------------------------------------------
-- Policy: can_remove_group_member
-- Allows active -> removed under strict conditions
-- ----------------------------------------------------------------------------
CREATE POLICY can_remove_group_member
ON public.group_members
FOR UPDATE
USING (
  status = 'active'
)
WITH CHECK (
  status = 'removed'
  AND (
    -- ------------------------------------------------------------------------
    -- Self-exit (any group type)
    -- ------------------------------------------------------------------------
    group_members.user_id = auth.uid()

    OR

    -- ------------------------------------------------------------------------
    -- Organized group: boundary keeper removes others
    -- (cannot remove boundary keeper)
    -- ------------------------------------------------------------------------
    (
      EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.group_type = 'organized'
          AND g.boundary_keeper_user_id = auth.uid()
      )
      AND group_members.user_id <> auth.uid()
      AND group_members.user_id <> (
        SELECT g2.boundary_keeper_user_id
        FROM public.groups g2
        WHERE g2.id = group_members.group_id
      )
    )
  )
);
