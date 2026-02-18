# Appendix U1 — UI State ↔ RPC Mapping (v1.3 — Authoritative)

## v1.3 FINAL / FROZEN — Unified Restart Doctrine

**Frozen On:** 2026-02-11 UTC

### Core rule
Restarting participation always uses exactly two channels (regardless of history):

- **User → Request to Join** (`rpc_match_request_join`)
- **Organizer → Invite** (`rpc_match_invite_user`)

No branching on:
- `removed_by`
- prior `join_method`
- prior confirmation state or order

### Scope rule (first-entry only)
- If **mp == NULL** (no prior record): scope is required for **Request to Join**
- If **mp exists** and `status = 'removed'`: scope is **NOT** required for **Request to Join**

### removed_* semantics (restart clears)
On restart (request / invite / nominate), clear removed fields because they represent **current removed state only**:
- `removed_at = NULL`
- `removed_by = NULL`
- `removal_note = NULL`

### admission_mode
`matches.admission_mode` is **deprecated** in v1.3 (column may exist but **MUST NOT** be used for RLS / RPC / UI logic).


This appendix provides a **one-to-one mapping** between:
- UI-only states defined in **Appendix U — Frontend UI State Machine (v1.3)**, and
- The authoritative RPCs defined in **Execution State v1.3**.

Its purpose is to ensure:
- Frontend implementations never invoke undefined RPCs
- QA can validate UI behavior without interpreting backend logic
- No UI action bypasses organizer authority or v1.3 invariants

---

## U1.1 Principles (Frozen)

1. Every visible UI action MUST map to **exactly one RPC** listed here.
2. If a UI element has no RPC mapping, it MUST be **UI-only**.
3. UI MUST NOT infer or derive new backend behavior.
4. Removed users restart via unified paths: User Request / Organizer Invite.

---

## U1.2 Self-View UI State → RPC Mapping

| UI State | UI Action | RPC | Notes |
|--------|-----------|-----|------|
| U0 — NotInMatch | — | — | No backend interaction |
| U1 — EligibleToRequest | Request to Join | rpc_match_request_join | Scope-gated |
| U2 — InvitedNeedsAccept | Accept | rpc_match_accept_invite | User acceptance only |
|  | Decline | rpc_match_decline_invite | Results in removed |
| U3 — WaitingForOrg | Withdraw | rpc_match_leave | User-initiated removal |
| U4 — WaitingForUser | Accept | rpc_match_accept_invite | Completes user side |
|  | Withdraw | rpc_match_leave | |
| U5 — Confirmed | Leave | rpc_match_leave | |
| U6 — RemovedSelf | Rejoin Intent | ❌ none | UI-only |
| U7 — Removed | Request to Join | rpc_match_request_join | User restart (no scope if prior mp) |
---

## U1.3 Organizer-View UI State → RPC Mapping

| Target UI State | UI Action | RPC | Notes |
|---------------|-----------|-----|------|
| O1 — PendingNeedsOrgApproval | Approve | rpc_match_confirm_participant | Writes org_approved_at |
|  | Remove | rpc_match_remove_participant | |
| O2 — PendingNeedsUserAccept | Remove | rpc_match_remove_participant | |
| O3 — Confirmed | Remove | rpc_match_remove_participant | |
| O4 — Removed | Invite | rpc_match_invite_user | Restart (pending user accept) |
| O5 — Removed | Request to Join | rpc_match_request_join | Restart (pending ORG approve) |
---

## U1.4 Nomination & Guest Actions

| UI Action | RPC | Notes |
|----------|-----|------|
| Nominate User | rpc_match_nominate_user | Non-scope, participant initiated |
| Add Guest (Participant) | rpc_match_add_guest_participant | Pending |
| Add Guest (Organizer) | rpc_match_add_guest_org | Confirmed |

---

## U1.5 Explicitly Forbidden Mappings

The following UI → RPC mappings are **strictly prohibited**:

| UI Action | Reason |
|----------|--------|
| User Rejoin → rpc_match_rejoin | RPC does not exist in v1.3 |
| Rejoin → new participant insert | Violates unified same-row restart invariant |
| UI Confirm → direct status write | confirmed is derived |
| UI Remove → status mutation | Must go through RPC |

---

## U1.6 Consistency Check (QA Rule)

For every UI control:
- If an RPC exists → it MUST appear in this table
- If no RPC appears → the control MUST be UI-only

Any deviation indicates a v1.3 violation.

---

### Appendix Status

This appendix is **frozen in v1.3**.  
Any modification requires a version upgrade.
