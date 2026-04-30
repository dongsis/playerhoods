# Legacy And Retired Items Baseline

## Purpose

This file captures baseline lifecycle status for DB functions and defines cleanup gates.

Status classes:

- ACTIVE: on current mainline path
- LEGACY: off mainline but retained for compatibility
- RETIRED: no longer intended to be called
- DROP CANDIDATE: possible removal after validation gates

## ACTIVE

- `rpc_email_invitation_create`
- `rpc_email_invitation_get`
- `rpc_email_invitation_accept_as_guest`
- `rpc_email_invitation_decline_as_guest`
- `apply_participant_exit`
- `match_participant_reconcile_status`

Evidence:

- Invitation page and server actions are wired to guest RPC wrappers.
- Guest invitation anchor and response path are implemented in `20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`.

Runtime confidence: Medium-High

## LEGACY (Compat Retained)

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`

Evidence:

- Guest CTA mainline no longer routes to these functions.
- Functions are still present to avoid abrupt compatibility break.

Runtime confidence: Medium

## RETIRED

- `rpc_email_invitation_update_flow_status`

Evidence:

- Drop migration exists: `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
- Validation script exists: `supabase/validation/20260328000000_drop_batch_a_low_risk_legacy_rpcs_validation.sql`

Runtime confidence: Medium (environment application still needs per-env confirmation)

## DROP CANDIDATE (Hold)

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

Why hold:

- Not on current guest mainline
- Potential hidden database/runtime dependencies not yet fully proven absent

Runtime confidence: Medium-Low

Safe to drop now: No

## Cleanup Strategy

1. Keep Batch size small (1-3 functions).
2. For each candidate, require:
   - static source reference scan
   - `pg_depend` dependency scan
   - staging runtime observation window
   - rollback migration note
3. Only promote to drop when all gates pass.
