# Migration Status Index

## Purpose

This index classifies migrations by governance role for the current baseline.  
It is a **cognitive layering index**, not a file move plan.

Rules:

1. Keep historical migration files in place.
2. Use this index to decide what is active design authority vs historical execution chain.
3. New cleanup work must be done via new append-only migrations.

## Baseline Anchor

- Baseline commit: `87dca86`
- Baseline branch: `v2.0` (aligned with `main`)
- Baseline effective date: `2026-03-14`

---

## ACTIVE FOUNDATION

Current baseline depends on these migrations as active foundation:

- `0001_baseline_public.sql`
- `0002_enable_rls.sql`
- `20260310110000_email_invitations.sql`
- `20260310120000_email_invitation_events.sql`
- `20260310140000_invitation_rpcs.sql`
- `20260310141000_add_email_invitation_accepted_via.sql`
- `20260323000000_participant_exit_unified_helper.sql`
- `20260326000000_reentry_removed_at_canonical.sql`
- `20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`

---

## SUPERSEDED BUT RETAINED

These migrations are historically valid and remain in chain, but later changes supersede parts of their operational design:

- `20260310140000_invitation_rpcs.sql` (legacy invitation accept/decline path retained for compatibility)
- `20260311150000_identity_reconcile_on_accept.sql` (partially superseded by newer guest-first invitation path in current-match response)
- `20260311160000_reconcile_identity_on_login.sql` (still valid for login reconciliation, not invitation primary response rule)
- `20260319000000_phase5_drop_deprecated_guest_rpcs.sql` (historical deprecation track followed by later cleanup rounds)

---

## LEGACY CLEANUP

Migrations used to retire legacy objects, harden permissions, or close old paths:

- `20260320010000_revoke_anon_mutating_rpcs.sql`
- `20260322000001_manual_confirm_refactor_phase3_deprecate_rpcs.sql`
- `20260322000002_drop_manual_confirm_rpcs.sql`
- `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
- `20260328010000_guest_invitation_rpc_permissions_hardening.sql`

---

## DO NOT USE AS DESIGN SOURCE

These remain historical execution records but should not be used as the primary source of current design decisions:

- Early phase migration clusters replaced by current baseline semantics
- Any migration that predates and is superseded by:
  - `20260323000000_participant_exit_unified_helper.sql`
  - `20260326000000_reentry_removed_at_canonical.sql`
  - `20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`
  - `20260328010000_guest_invitation_rpc_permissions_hardening.sql`

Working rule:

- For current behavior, start from baseline docs and schema baseline.
- Use old migrations only for traceability and forensic backtracking.

---

## Usage Order

For new work, use this order:

1. `DB_BASELINE_2026-03-14.md`
2. `schema_baseline.sql`
3. `DB_SEMANTICS_BASELINE.md`
4. `LEGACY_AND_RETIRED_ITEMS.md`
5. `MIGRATION_STATUS_INDEX.md`
6. Only then inspect specific historical migrations if needed

---

## Non-Goals

- Do not move old migration files
- Do not rewrite old migration files
- Do not delete migration files to "clean" directories

Cleanup means dropping outdated **objects** via new migrations, not erasing historical migration records.
