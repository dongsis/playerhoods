# Cleanup 2026-03-20: Invite/Admit Unification + Grant Cleanup

## Completed

- **Part A:** Dropped `can_invite_user_to_match`; `rpc_match_invite_user` is thin wrapper around `rpc_match_admit_user`
- **Part B:** Revoked anon EXECUTE on 19 mutating RPCs
- **Part C:** Regenerated `schema.sql`
- **Validation:** Archived obsolete validations; added `20260320000000_unify_invite_admit_validation.sql`
- **Docs:** Updated Match_Participation_Flows, 00_AUTHORITATIVE_INDEX, PERMISSION_ARCHITECTURE, FACTS_functions, SCHEMA_TRUTH_CHECK, PlayerHoods spec, Remove_Logic

---

## Remaining Post-Canonicalization Cleanup Items

### 1. Default privileges (low priority)

**Issue:** `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon` causes new functions to be granted to anon automatically.

**Recommendation:** Add explicit `REVOKE EXECUTE FROM anon` in future migrations for mutating RPCs, or adjust default privileges in a dedicated migration. Not blocking.

### 2. Additional mutating RPCs still granted to anon (optional)

The following were not in the high-priority list but could be tightened:

- `rpc_match_accept_invite`, `rpc_match_accept_email_invitation` — may need anon for magic-link pre-auth flow; verify before revoking
- `rpc_club_create`, `rpc_club_join`, `rpc_club_update`, `rpc_club_identity_set_preferences`
- `rpc_group_create`, `rpc_group_invite_user`, `rpc_group_leave`, `rpc_group_accept_invite`, `rpc_group_reject_invite`, `rpc_group_update`
- `rpc_profile_set_primary_club`, `rpc_profile_set_display_name`, `rpc_profile_update`
- `rpc_roster_guest_list` (read-only; lower risk)

### 3. App migration to rpc_match_admit_user (optional, future)

The app currently calls `inviteUserToMatch` → `rpc_match_invite_user`. For full canonicalization, the app could call `rpc_match_admit_user` directly when `isOrganizer`, and `rpc_match_invite_user` could be deprecated. Not required; the wrapper preserves behavior.

### 4. FACTS_functions / schema docs sync

`FACTS_functions.md` is generated or manually maintained. Ensure it stays in sync with `schema.sql` after future migrations. Consider automating from schema dump.

---

## Summary

| Category | Status |
|----------|--------|
| Canonical predicate | `can_admit_user_to_match` ✅ |
| Canonical write | `rpc_match_admit_user` ✅ |
| invite_user | Wrapper (preserved for API compat) ✅ |
| Grant cleanup | 19 mutating RPCs revoked from anon ✅ |
| schema.sql | Regenerated ✅ |
| Validation archive | Done ✅ |
| Docs/specs | Updated ✅ |
| Default privileges | Identified; not changed |
| Additional RPC revokes | Optional |
| App → admit_user direct | Optional, future |
