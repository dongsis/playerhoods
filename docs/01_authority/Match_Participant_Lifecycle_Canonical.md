# Match Participant Lifecycle — Canonical Reference

**Status:** Authoritative  
**Scope:** Enter, Confirm, Approve, Exit, Re-entry, Reset  
**Last updated:** 2026-03 (post admission/exit helper unification)

---

## 1. Core Invariants

| Invariant | Rule |
|-----------|------|
| **Confirmed** | `participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL` |
| **Status** | Derived by `match_participant_reconcile_status` only. Never written directly. |
| **Removed** | Canonical: `removed_at IS NOT NULL` |

---

## 2. Enter (Admission)

**Internal helper:** `apply_participant_admission(p_match_id, p_target_user_id, p_actor_id, p_admission_kind)`

| RPC | Caller | Target | admission_kind | join_method | participant_accepted_at | org_approved_at |
|-----|--------|--------|----------------|-------------|-------------------------|-----------------|
| `rpc_match_request_join` | Self | auth.uid() | requested | requested | now(), in_app | NULL |
| `rpc_match_admit_user` (invite) | Organizer | p_target | invited | invited | NULL | now() |
| `rpc_match_admit_user` (nominate) | Non-org | p_target | nominated | nominated | NULL | NULL |
| `rpc_match_nominate_guest` | Organizer OR MatchAssociated | Guest (roster) | — | nominated | NULL | org only if organizer |

**Wrappers:** `rpc_match_invite_user` → `rpc_match_admit_user`; `rpc_match_nominate_user` → `rpc_match_admit_user`

**Discovery:** Mixed candidate discovery is provided by `rpc_match_admission_targets`, but write paths remain split:
- **Users** via `rpc_match_admit_user` (request_join, invite_user, nominate_user)
- **Contact Players** via `rpc_match_nominate_guest`

---

## 3. Confirm (Participant-side acceptance)

**Participant-side confirmation and organizer approval are separate phases; confirmed requires both.**

**Internal helper:** `apply_participant_acceptance(p_mp_id, p_actor_id, p_is_self, p_action_type)`

| RPC | Caller | Target | Effect |
|-----|--------|--------|--------|
| `rpc_match_accept_invite` | Participant (self) | Own row | participant_accepted_at=now(), via=in_app |
| `rpc_match_delegate_confirm_participant` | Organizer OR (non-org + InScope/MatchAssociated + ShareGroup) for user; any active participant for guest | Pending user or guest | participant_accepted_at=now(), via=delegate_manual. Guest: emits `match.guest_delegate_confirmed` |

**Order-free:** Org Approve and participant Accept can happen in any order.

---

## 4. Approve (Organizer-side)

| RPC | Caller | Target | Effect |
|-----|--------|--------|--------|
| `rpc_match_org_approve_participant` | Organizer only | Any pending participant (user or guest) | org_approved_at=now(), org_approved_by=actor |

---

## 5. Exit

**Internal helper:** `apply_participant_exit(p_match_participant_id, p_actor_id, p_exit_kind, p_removal_note)`

| RPC | Caller | Target | exit_kind | Effect |
|-----|--------|--------|-----------|--------|
| `rpc_match_remove_participant` | Organizer OR (confirmed + can_manage) | Any non-removed | remove | removed_at, removed_by, removal_note; reconcile → removed |
| `rpc_match_user_withdraw` | Participant (self) | Own row (user only) | withdraw | Same |

---

## 6. Re-entry

**User:** Via admission family only. No dedicated re-entry RPC.

| Path | Condition |
|------|-----------|
| `rpc_match_request_join` | Caller in scope |
| `rpc_match_invite_user` / `rpc_match_admit_user` | Organizer |
| `rpc_match_nominate_user` / `rpc_match_admit_user` | Non-org, ShareGroup with target |

**Guest:** No re-entry. New `rpc_match_nominate_guest` only.

---

## 7. Reset (Reconfirm)

**Trigger:** `trg_match_detail_change_reconfirm` on `matches` UPDATE of `match_date`, `start_time`, `duration_minutes`, `club_id`, `court_ids`

**Function:** `fn_match_detail_change_reconfirm`

**Effect:** For all **confirmed** non-removed participants **except organizer**:
- Clear: `participant_accepted_at`, `participant_accepted_via`, `manual_confirmed_by`, `confirmed_at`
- Preserve: `org_approved_at`
- Reconcile → status pending

**Applies to:** User and guest participants.

---

## 8. Canonicalization Settlement (Contact Player → Registered User)

When a Contact Player (guest participant) registers or logs in, the same real person may have both an active guest row and an active user row in the same match. **Canonicalization settlement** resolves this into a single active canonical row (user row canonical; guest row retired).

**Design document:** [Contact_Player_Canonicalization_Orchestration_Design.md](../fixes/Contact_Player_Canonicalization_Orchestration_Design.md)

**Scope:** Row identity and active-row uniqueness only. Does **not** decide participant acceptance or organizer approval.

**Status:** Level 1 design complete. Next: L2 dry-run audit (read-only).

---

## 9. Canonical Function Index

| Phase | Public RPC | Internal Helper |
|-------|------------|-----------------|
| Enter | request_join, admit_user, invite_user, nominate_user, nominate_guest | apply_participant_admission |
| Confirm | accept_invite, delegate_confirm_participant | apply_participant_acceptance |
| Approve | org_approve_participant | — |
| Exit | remove_participant, user_withdraw | apply_participant_exit |
| Reset | (trigger) | fn_match_detail_change_reconfirm |
| Canonicalization | (design only; future) | canonicalize_participant_for_registered_user |

---

## 10. References

- `00_AUTHORITATIVE_INDEX.md` — invariants, Restart Doctrine
- `Match_Participation_Flows_and_Scope.md` — scope, gates, RLS
- `Participant_Exit_Unified_Helper_Design.md` — exit helper
- `Admission_Family_Unified_Helper_Design.md` — admission helper
- `Contact_Player_Canonicalization_Orchestration_Design.md` — canonicalization settlement (guest→user)
