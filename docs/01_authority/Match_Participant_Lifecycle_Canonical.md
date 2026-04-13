# Match Participant Lifecycle - Canonical Reference

**Status:** Authoritative, updated for Contact Player + Match Proxy canonical spec v1.2  
**Scope:** Admission, confirmation, approval, exit, re-entry, reconfirm  
**Last updated:** 2026-04-01

This document is the canonical lifecycle reference for the current match participant model.

---

## 1. Core Invariants

| Invariant | Rule |
|-----------|------|
| Confirmed | `participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL` |
| Status | Derived only by `match_participant_reconcile_status` |
| Removed | Canonical removed signal is `removed_at IS NOT NULL` |

---

## 2. Admission

### Internal write core

- `apply_participant_admission(p_match_id, p_target_user_id, p_actor_id, p_admission_kind)`

This helper is the canonical internal write core for user admission flows.

### Public admission RPCs

| RPC | Caller | Target | Result |
|-----|--------|--------|--------|
| `rpc_match_request_join` | self | `auth.uid()` | `requested`; participant side accepted immediately; organizer approval pending |
| `rpc_match_admit_user` (invite path) | organizer | target user | `invited`; organizer-approved immediately; participant side pending |
| `rpc_match_admit_user` (nominate path) | non-organizer | target user | `nominated`; both sides pending |
| `rpc_match_nominate_guest` | organizer or eligible non-organizer | target guest / Contact Player | `nominated`; guest row path, not user admission helper |

Thin wrappers:

- `rpc_match_invite_user -> rpc_match_admit_user`
- `rpc_match_nominate_user -> rpc_match_admit_user`

Discovery read model:

- `rpc_match_admission_targets`

---

## 3. Participant-Side Confirmation

### Internal write core

- `apply_participant_acceptance(p_mp_id, p_actor_id, p_is_self, p_action_type)`

This helper is the canonical internal write core for participant-side confirmation writes.

### Public confirmation RPCs

| RPC | Caller | Target | Result |
|-----|--------|--------|--------|
| `rpc_match_accept_invite` | self | own row | writes participant-side acceptance via `in_app` |
| `rpc_match_proxy_confirm_participant` | explicit active Match Proxy only | principal's pending user or Contact Player row | writes participant-side acceptance via `proxy` |

Current rule:

- participant-side confirmation does not itself imply organizer approval

Order is free:

- participant accept first, then organizer approve
- organizer approve first, then participant accept

Both converge through `match_participant_reconcile_status`.

---

## 4. Proxy Confirmation Revoke

The old ad-hoc delegate-confirm revoke flow is retired.

Current rule:

- participant-side confirmation rollback is not exposed as a general non-principal convenience action
- any retained compatibility stubs such as `rpc_match_delegate_confirm_participant` or `rpc_match_revoke_delegate_confirm_participant` are deprecated and should not be used for new product flows

---

## 5. Organizer Approval

Public RPC:

- `rpc_match_org_approve_participant`

Organizer approval:

- sets `org_approved_at`
- sets `org_approved_by`
- never writes final status directly
- relies on reconcile to derive `pending` or `confirmed`

---

## 6. Exit

### Internal write core

- `apply_participant_exit(p_match_participant_id, p_actor_id, p_exit_kind, p_removal_note)`

This helper is the canonical internal write core for removing an active participant from the active lifecycle.

### Public exit RPCs

| RPC | Caller | Target | Result |
|-----|--------|--------|--------|
| `rpc_match_user_withdraw` | self | own row | marks removed with self as remover |
| `rpc_match_remove_participant` | organizer | target row | marks removed with actor as remover |

Both exit paths end in:

- `removed_at`
- `removed_by`
- reconcile -> `status = removed`

---

## 7. Match Association

Current helper:

- `is_user_match_associated(match_id, user_id)`

Current rule:

- active row => match-associated
- self-withdraw or self-decline removed row => still match-associated
- organizer-removed or manager-removed row => not match-associated

This is the current post-baseline model and should be treated as canonical for caller gates.

---

## 8. Re-entry

There is no dedicated re-entry RPC.

Current user re-entry channels:

- `rpc_match_request_join`
- `rpc_match_invite_user`
- `rpc_match_nominate_user`

Current Contact Player rule:

- no removed-row reuse model
- use a fresh `rpc_match_nominate_guest` path

---

## 9. Reconfirm on Match Detail Change

Trigger:

- `trg_match_detail_change_reconfirm`

Trigger function:

- `fn_match_detail_change_reconfirm`

Current effect:

- for confirmed, non-removed, non-organizer participants
- clear:
  - `participant_accepted_at`
  - `participant_accepted_via`
  - `manual_confirmed_by`
  - `confirmed_at`
- preserve:
  - `org_approved_at`
- reconcile back to pending

This applies to both user and guest participants.

---

## 10. Canonical Function Families

| Family | Public RPCs | Internal write core |
|--------|-------------|---------------------|
| Admission | `request_join`, `admit_user`, `invite_user`, `nominate_user`, `nominate_guest` | `apply_participant_admission` for user flows |
| Confirmation | `accept_invite`, `proxy_confirm_participant` | `apply_participant_acceptance` for write-side acceptance |
| Approval | `org_approve_participant` | none |
| Exit | `user_withdraw`, `remove_participant` | `apply_participant_exit` |
| Status derivation | all lifecycle families | `match_participant_reconcile_status` |
