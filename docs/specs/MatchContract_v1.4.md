# MatchContract v1.2

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


> **v1.3 Release**  
> This document is the authoritative v1.3 release.  
> Key semantics updated: request is group-based; invite/nominate are individual-based; removed can be restarted via **User Request to Join** or **Organizer Invite** (same participant record).


## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; Restart occurs via **Request to Join** (user) or **Invite** (organizer).
- If removed by **ORG**, Restart is unified (no removed_by branching). Organizer may **Invite** again; user may **Request to Join** again.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`

---

## Identity Context (v1.4)

Match-level identity resolution follows club identity rules.

A participant’s visible name inside a club-scoped match
is always their club_handle for that club.

display_name is considered a derived value.

---

## Match Status (Lifecycle Only)
- active
- cancelled
- archived

No derived or conditional states are allowed here.





## v1.2 Addendum — Dual Confirmation Fields

The following fields are appended to `match_participants`:

- user_accepted_at timestamptz null
- org_approved_at timestamptz null
- org_approved_by uuid null

These fields are used to express confirmation semantics
without introducing new status values.

---

### Confirmation Invariant

A participant is considered confirmed if and only if:

- status = 'confirmed'
- effective confirmation conditions are satisfied
  (see Status & Semantics v1.2)

Status MUST be synchronized by backend logic (RPC),
not inferred implicitly in client code.

---

### Compatibility

- Existing rows remain valid
- No enum or status reinterpretation occurs
- This addendum is backward-compatible with v1.1 data


### Unified Restart Semantics (v1.3 FINAL / FROZEN)

A removed participant may restart the admission flow using unified paths on the **same participant record**:

- **User**: `rpc_match_request_join(match_id)`  
  - scope required only when `mp == null` (first entry)  
  - if `mp.status='removed'`, scope is NOT required

- **Organizer**: `rpc_match_invite_user(match_id, user_id)`  
  - invite is never scope-restricted

On restart, the row transitions to `status='pending'` and resets confirmation fields according to the chosen path.
`removed_at/removed_by/removal_note` are cleared (they represent current removed state only).

`rpc_match_reactivate_participant` is deprecated and must not be used by the product/UI.

