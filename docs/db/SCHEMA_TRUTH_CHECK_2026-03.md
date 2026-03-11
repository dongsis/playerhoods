# Schema Truth-Check Report

**Date:** 2026-03-11  
**Source:** `supabase db dump --schema public` (remote database)  
**Note:** The dumped database appears to be **behind** migrations. It lacks `rpc_match_admission_targets`, `rpc_match_nominate_guest`, `rpc_match_delegate_confirm_guest`, `rpc_match_delegate_confirm_participant`, and `can_invite_user_to_match`. The app code expects `rpc_match_admission_targets` — ensure all migrations through Phase 5 are applied before deployment.

---

## A. Functions Confirmed Still Present (in dumped DB)

| Function | Signature | Status |
|----------|-----------|--------|
| `rpc_match_invite_targets` | `(p_match_id uuid)` | Present — **Phase 1 migration intends DROP** |
| `rpc_match_nominate_targets` | `(p_match_id uuid)` | Present — **Phase 1 migration intends DROP** |
| `rpc_match_add_guest_org` | `(uuid, text, text)` and `(uuid, text, text, text)` | Present — **Phase 5 migration intends DROP** |
| `rpc_match_add_guest_participant` | `(uuid, text, text)` and `(uuid, text, text, text)` | Present — **Phase 5 migration intends DROP** |
| `rpc_match_invite_guest_from_roster` | `(uuid, uuid)` | Present — **Phase 5 migration intends DROP** |
| `rpc_match_manual_confirm` | `(p_match_participant_id uuid, p_note text)` | Present |
| `rpc_match_manual_confirm_user` | `(p_match_id uuid, p_user_id uuid)` | Present |
| `rpc_match_delegate_manual_confirm_targets` | `(p_match_id uuid)` | Present |
| `rpc_match_delegate_confirm_user` | `(p_match_id uuid, p_user_id uuid)` | Present |

---

## B. Functions Already Gone (in dumped DB)

These are **not** in the dump — either never applied or already dropped:

| Function | Expected from migration |
|----------|-------------------------|
| `rpc_match_admission_targets` | `20260312060000`, `20260316000000` — **app uses this** |
| `rpc_match_nominate_guest` | `20260305180000`, `20260309100000` |
| `rpc_match_delegate_confirm_guest` | `20260311113000` |
| `rpc_match_delegate_confirm_participant` | `20260305190000` |
| `can_invite_user_to_match` | `20260312030000` |
| `can_admit_user_to_match` | Phase 2/3 |

---

## C. Functions That Should Be Deleted Next

Per migration plan (once Phase 1 & 5 are applied):

| Function | Migration | Replacement |
|----------|-----------|-------------|
| `rpc_match_invite_targets` | `20260314000000_phase1_remove_legacy_target_rpcs.sql` | `rpc_match_admission_targets` |
| `rpc_match_nominate_targets` | Same | `rpc_match_admission_targets` |
| `rpc_match_add_guest_org` | `20260319000000_phase5_drop_deprecated_guest_rpcs.sql` | `rpc_match_nominate_guest` + `rpc_match_delegate_confirm_guest` + `rpc_match_org_approve_participant` |
| `rpc_match_add_guest_participant` | Same | Same |
| `rpc_match_invite_guest_from_roster` | Same | Same |

**Action:** Run `supabase db push` or apply migrations `20260314000000` and `20260319000000` to drop these. Ensure Phase 1–3 migrations (admission targets, nominate guest, etc.) are applied first.

---

## D. Suspicious Overlaps / Conflicts

### 1. `can_invite_user_to_match` vs `rpc_match_invite_user`

- **`can_invite_user_to_match`** (Phase 1): Predicate for target eligibility. Used by `rpc_match_invite_targets` (unified) and `rpc_match_invite_user`.
- **Status:** Not in dump — migration `20260312030000` adds it. No overlap conflict; it's the authoritative predicate.

### 2. `rpc_match_manual_confirm` vs `rpc_match_manual_confirm_user`

| RPC | Target | Use case |
|-----|--------|----------|
| `rpc_match_manual_confirm` | Existing participant row (by `match_participant_id`) | Organizer one-click confirms a pending user already in the match |
| `rpc_match_manual_confirm_user` | User not yet in match (by `user_id`) | Organizer adds + confirms a user in one step (insert or re-entry) |

**Verdict:** No overlap. Different entry points — one for existing row, one for user-by-id. Both are used by the app (`manualConfirmParticipant` → manual_confirm, `manualConfirmUser` → manual_confirm_user).

### 3. `rpc_match_invite_targets` vs `rpc_match_admission_targets`

- **Legacy:** `rpc_match_invite_targets(uuid)` — organizer only, simple (user_id, display_name).
- **Target:** `rpc_match_admission_targets(uuid, text)` — unified, organizer + non-org, multi-source (reentry, invite_circle, club_members, groups), returns `eligible`.

**Verdict:** Phase 1 removes invite_targets; admission_targets is the single read model. App already uses `getAdmissionTargets` → `rpc_match_admission_targets`.

---

## E. Grant Cleanup Recommendations

### RPCs with `GRANT ALL` to `anon` (should be `authenticated` only)

| Function | Risk | Recommendation |
|----------|------|-----------------|
| `rpc_match_add_guest_org` | Unauthenticated users | `REVOKE ALL FROM anon`; `GRANT EXECUTE TO authenticated` |
| `rpc_match_add_guest_participant` | Same | Same |
| `rpc_match_invite_guest_from_roster` | Same | Same |
| `rpc_match_manual_confirm` | Same | Same |
| `rpc_match_manual_confirm_user` | Same | Already `REVOKE FROM PUBLIC` + `GRANT TO authenticated` in dump; anon still has it via `ALTER DEFAULT PRIVILEGES` |
| `rpc_club_handle_check` | Low (read-only) | Consider revoke from anon |
| `rpc_club_handle_set` | Mutates | `REVOKE FROM anon` |
| `rpc_group_set_display_name` | Mutates | `REVOKE FROM anon` |
| `rpc_admin_user_search` | Sensitive | `REVOKE FROM anon` |
| `rpc_club_admin_grant` / `rpc_club_admin_revoke` | Admin | `REVOKE FROM anon` |
| `rpc_match_create` | Mutates | `REVOKE FROM anon` |
| `rpc_match_remove_participant` | Mutates | `REVOKE FROM anon` |
| `rpc_match_org_approve_participant` | Mutates | `REVOKE FROM anon` |
| `rpc_match_request_join` | Mutates | `REVOKE FROM anon` |
| `rpc_match_user_withdraw` | Mutates | `REVOKE FROM anon` |
| `rpc_roster_guest_create` | Mutates | `REVOKE FROM anon` |
| `rpc_roster_guest_list` | Read | Consider revoke from anon |
| `validate_club_handle` | Helper | Consider revoke from anon |
| `test_runner_v161` | Test | `REVOKE FROM anon` |
| `test_runner_v161_cleanup` | Test | Same |

### RPCs already correctly restricted (no anon)

- `rpc_match_accept_invite` — REVOKE FROM PUBLIC, GRANT TO authenticated
- `rpc_match_delegate_confirm_user` — Same
- `rpc_match_delegate_manual_confirm_targets` — Same
- `rpc_match_invite_targets` — Same
- `rpc_match_invite_user` — Same
- `rpc_match_manual_confirm_user` — Same
- `rpc_match_nominate_targets` — Same

### Root cause: `ALTER DEFAULT PRIVILEGES`

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
```

This grants `anon` on all new functions. **Recommendation:** Remove or narrow this so new functions are not auto-granted to anon.

---

## F. Naming-Model Leftovers

| Artifact | Location | Notes |
|----------|----------|-------|
| `club_handle` | `club_identities.club_handle`, `club_identities.club_handle_norm` | Core identity; keep |
| `rpc_club_handle_check` | public | Check availability |
| `rpc_club_handle_set` | public | Set club-scoped handle |
| `validate_club_handle` | public | Helper |
| `group_display_name` | `group_members.group_display_name` | Group-scoped alias |
| `rpc_group_set_display_name` | public | Set group display name |

These are **not** deprecated; they are the current identity model. "Leftover" here means legacy naming (club_handle vs display_name, etc.). No migration needed unless renaming for consistency.

---

## Summary

| Category | Count |
|----------|-------|
| Legacy functions still present (to drop) | 5 |
| Functions missing (migrations not applied) | 6+ |
| Overlaps (none problematic) | 0 |
| RPCs with anon grant (should revoke) | 20+ |
| Naming leftovers (informational) | 4 |
