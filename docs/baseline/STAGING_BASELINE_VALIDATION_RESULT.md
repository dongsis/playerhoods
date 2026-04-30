# Staging Baseline Validation Result

## Execution Metadata

- Baseline commit: `03522d7`
- Baseline patch migration: `20260328153000_staging_gate_fix_invitation_get_and_guest_ambiguity.sql`
- Baseline SQL set version: `supabase/baseline/*` (post-local-reset regenerated)
- Environment: `staging`
- Executed by: Cursor agent
- Execution time: 2026-03-26 13:04:14 -04:00

## Applied Layers

- [x] `BASELINE_SCHEMA.sql` (equivalent migration chain applied via `supabase db push --linked`)
- [x] `BASELINE_SECURITY.sql` (equivalent security migrations applied)
- [x] `BASELINE_REQUIRED_SEED.sql` (seed not explicitly executed in staging gate)

## Functional Validation Result

- [x] invitation get
- [x] accept as guest
- [x] decline as guest
- [x] anchor semantics
- [x] fail-fast 0-hit
- [x] fail-fast ambiguous
- [ ] register CTA isolation
- [x] system actor decline audit

## Security Validation Result

- [x] RLS expected state
- [x] grants/revoke expected state
- [x] no unintended PUBLIC execute
- [x] retired path not re-exposed

## SQL Output Summary

- Key query outputs:
  - Local precheck:
    - invitation guest RPC count = `2`
    - guest RPC `PUBLIC` execute grants = `0`
    - retired rpc `rpc_email_invitation_update_flow_status` present count = `0`
  - Staging apply + SQL checks:
    - `supabase db push --linked` completed through `20260328010000_guest_invitation_rpc_permissions_hardening.sql`
    - anchor column check: `email_invitations.match_participant_id` count = `1`
    - guest RPC grants: anon/authenticated/service_role + postgres present
    - guest RPC `PUBLIC` execute grants = `0`
    - retired RPC `rpc_email_invitation_update_flow_status` present count = `0`
    - runtime probe (random invitation id):
      - `rpc_email_invitation_accept_as_guest(...)` -> `invitation_not_found`
      - `rpc_email_invitation_decline_as_guest(...)` -> `invitation_not_found`
  - Staging fixture-driven functional probes:
    - anchored accept succeeded (`status=accepted`, `participant_accepted_via='email_invitation'`)
    - anchored decline succeeded (`status=declined`, `removed_by=system_actor`, action row written)
    - `rpc_email_invitation_get(...)` succeeded after hotfix migration
    - ambiguous fallback probe now returns canonical business error:
      - `participant_ambiguous_for_invitation`
    - active user participant rows in test match remained `0` after guest accept/decline probes
- Error logs:
  - No blocking DB-level errors after hotfix migration `20260328153000_staging_gate_fix_invitation_get_and_guest_ambiguity.sql`.

## Decision

- [ ] Pass
- [x] Pass with caveats
- [ ] Fail

## Blockers and Rollback Suggestion

- Blockers:
  - register CTA isolation is not yet UI/E2E validated in staging.
- Suggested rollback action:
  - Keep migration flow as active path until CTA/UI validation is completed and documented.
