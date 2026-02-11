# Appendix U1 — UI State ↔ RPC Mapping (v1.3 — Authoritative)

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
4. Removed users MUST NOT transition state without organizer reactivation.

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
| U7 — RemovedByOrg | Waiting / Rejoin Intent | ❌ none | UI-only |

---

## U1.3 Organizer-View UI State → RPC Mapping

| Target UI State | UI Action | RPC | Notes |
|---------------|-----------|-----|------|
| O1 — PendingNeedsOrgApproval | Approve | rpc_match_confirm_participant | Writes org_approved_at |
|  | Remove | rpc_match_remove_participant | |
| O2 — PendingNeedsUserAccept | Remove | rpc_match_remove_participant | |
| O3 — Confirmed | Remove | rpc_match_remove_participant | |
| O4 — RemovedByOrg | Reactivate | rpc_match_reactivate_participant | Restores pending |
| O5 — RemovedByUser | Reactivate (optional) | rpc_match_reactivate_participant | Allowed in v1.3 |

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
| Rejoin → new participant insert | Violates same-row reactivation |
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
