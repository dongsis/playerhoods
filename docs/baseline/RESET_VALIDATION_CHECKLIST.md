# Reset Validation Checklist

## Baseline Metadata

- Baseline commit: `03522d7`
- Baseline patch migration: `20260328153000_staging_gate_fix_invitation_get_and_guest_ambiguity.sql`
- Baseline SQL set:
  - `supabase/baseline/BASELINE_SCHEMA.sql`
  - `supabase/baseline/BASELINE_SECURITY.sql`
  - `supabase/baseline/BASELINE_REQUIRED_SEED.sql`

## A. Local Empty-DB Validation

- [x] Apply `BASELINE_SCHEMA.sql` on empty database
- [x] Apply `BASELINE_SECURITY.sql`
- [x] Apply `BASELINE_REQUIRED_SEED.sql`
- [x] Confirm schema objects created (tables/types/views/functions/triggers)
- [x] Confirm no execution error in baseline layers

## B. Functional Validation

- [x] Invitation get path works
- [x] Guest accept path works
- [x] Guest decline path works
- [x] Invitation anchor path works
- [x] Fallback 0-hit fails fast
- [x] Fallback ambiguous fails fast
- [ ] Register CTA remains non-rewriting for current participant
- [x] System actor decline path is auditable

## C. Security Validation

- [x] RLS enabled on baseline tables
- [x] Guest RPC `PUBLIC` execute revoked
- [x] Guest RPC execute granted only to expected roles
- [x] Active RPC access model matches baseline docs
- [x] Retired RPC not re-exposed

## D. Staging Validation Prerequisite

- [x] Same baseline version deployed
- [x] Checklist executed in staging
- [x] Result file updated: `STAGING_BASELINE_VALIDATION_RESULT.md`

## Result

- [x] PASS
- [ ] FAIL
- Notes:
  - Local empty DB execution (`baseline_validation`) is now passing for all baseline SQL layers.
  - Evidence snapshot:
    - invitation guest RPC count = 2
    - guest RPC `PUBLIC` execute grants = 0
    - retired rpc `rpc_email_invitation_update_flow_status` present count = 0
  - Remaining unchecked items are functional E2E and staging execution, not local SQL layer blockers.
  - Staging validation rerun after hotfix migration and now **Pass with caveats**.
  - Remaining caveat:
    - Register CTA isolation still needs UI/E2E validation evidence.
