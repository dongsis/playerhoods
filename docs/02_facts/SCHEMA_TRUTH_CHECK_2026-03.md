# Schema Truth-Check Report

**Date:** 2026-03-10  
**Source:** Local DB only (after `supabase db reset`). Remote is out of scope for this phase.

---

## Executive Summary

| Status | Finding |
|--------|---------|
| **OK** | All app RPCs exist in local DB |
| **OK** | `user_accepted_at` dropped; schema uses `participant_accepted_at` / `participant_accepted_via` |
| **OK** | Internal helpers `apply_participant_exit`, `apply_participant_admission` in place |
| **OK** | Anon revoked from 19 mutating RPCs (20260320010000) |
| **OK** | Deprecated RPCs removed (`manual_confirm`, `manual_confirm_user`, `delegate_confirm_guest`) |

---

## A. Local Migrations Applied

| Migration | Purpose |
|-----------|---------|
| `20260303121500` | v1.6.3 integrated changes |
| `20260304121500` | Drop `user_accepted_at` column |
| `20260305170000` | Remove `user_accepted_at` from all functions |
| `20260309100000` | `rpc_match_nominate_guest` |
| `20260305230000` | `rpc_match_delegate_confirm_participant` (unified user+guest) |
| `20260312050000` | `rpc_match_admit_user` (canonical write) |
| `20260314000000` | Phase 1: DROP legacy `rpc_match_invite_targets`, `rpc_match_nominate_targets` |
| `20260316000000` | `rpc_match_admission_targets` (Phase 3 unified read model) |
| `20260319000000` | Phase 5: DROP `rpc_match_add_guest_org`, `rpc_match_add_guest_participant`, `rpc_match_invite_guest_from_roster` |
| `20260320000000` | DROP `can_invite_user_to_match` |
| `20260320010000` | Revoke anon from 19 mutating RPCs |
| `20260321000000` | DROP `rpc_match_delegate_confirm_guest` (unified into delegate_confirm_participant) |
| `20260322000002` | DROP `rpc_match_manual_confirm`, `rpc_match_manual_confirm_user` |
| `20260323000000` | `apply_participant_exit` helper; refactor remove/withdraw RPCs |
| `20260324000000` | `apply_participant_admission` helper; refactor admit_user/request_join |

---

## B. Functions: App vs Local (Validation)

### App uses (from `src/lib/api/matches.ts`, `InviteGuestForm`, `AddGuestForm`, `groups.ts`, etc.)

| RPC | In Local? | Status |
|-----|------------|--------|
| `rpc_match_admission_targets` | Yes | OK |
| `rpc_match_admit_user` | Yes | OK |
| `rpc_match_nominate_guest` | Yes | OK |
| `rpc_match_delegate_confirm_participant` | Yes | OK |
| `rpc_match_invite_user` | Yes | OK |
| `rpc_match_nominate_user` | Yes | OK |
| `rpc_match_accept_invite` | Yes | OK |
| `rpc_match_org_approve_participant` | Yes | OK |
| `rpc_match_user_withdraw` | Yes | OK |
| `rpc_match_remove_participant` | Yes | OK |
| `rpc_match_create` | Yes | OK |
| `rpc_match_request_join` | Yes | OK |
| `rpc_match_participant_display_names` | Yes | OK |
| `rpc_match_participant_emails_for_notification` | Yes | OK |

### Dropped RPCs (no longer in local; app does not call)

| Function | Dropped by |
|----------|------------|
| `rpc_match_manual_confirm` | `20260322000002` |
| `rpc_match_manual_confirm_user` | `20260322000002` |
| `rpc_match_delegate_confirm_guest` | `20260321000000` (unified into delegate_confirm_participant) |

### Internal helpers (not RPCs; not called by app)

| Function | Purpose |
|----------|---------|
| `apply_participant_exit` | Centralized exit logic; used by `rpc_match_remove_participant`, `rpc_match_user_withdraw` |
| `apply_participant_admission` | Centralized admission logic; used by `rpc_match_admit_user`, `rpc_match_request_join` |

### Legacy RPCs removed (Phase 1 & 5)

| Function | Dropped by |
|----------|------------|
| `rpc_match_invite_targets` | `20260314000000` |
| `rpc_match_nominate_targets` | `20260314000000` |
| `rpc_match_add_guest_org` (2 overloads) | `20260319000000` |
| `rpc_match_add_guest_participant` (2 overloads) | `20260319000000` |
| `rpc_match_invite_guest_from_roster` | `20260319000000` |

---

## C. Schema: match_participants

| Column | Local |
|--------|-------|
| `user_accepted_at` | **Dropped** (20260304121500) |
| `participant_accepted_at` | Present |
| `participant_accepted_via` | Present |

---

## D. Grant Status (Local)

Migration `20260320010000` revokes `anon` from 19 mutating RPCs. Applied.

---

## E. Recommendations (Local Only)

1. **Validation:** Run `supabase/validation/20260323000000_participant_exit_unified_helper_validation.sql` and `supabase/validation/20260324000000_admission_family_unified_helper_validation.sql` after `supabase db reset` to confirm schema invariants.

2. **Schema dump:** After local changes, regenerate `schema.sql` from local:  
   `supabase db dump --schema public > schema.sql` (if using a local schema snapshot for reference).

3. **No remote actions:** Remote sync, push, deployment, and drift remediation are out of scope for this phase.

---

## Summary

| Category | Count |
|----------|-------|
| App RPCs in local | 14 (all present) |
| Dropped RPCs | 3 |
| Internal helpers | 2 |
| Legacy RPCs removed | 5 |
| Grant cleanup | 19 RPCs revoked from anon |
