# Communication Model

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


## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; Restart occurs via **Request to Join** (user) or **Invite** (organizer).
- If removed by **ORG**, Restart is unified (no removed_by branching). Organizer may **Invite** again; user may **Request to Join** again.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


## Where communication happens
- Communication is always scoped to Group or MatchParticipant context.

## Restrictions
- Match does NOT create communication rights by itself.
- Register visibility does NOT grant communication access.

No user-to-user DM without an explicit Group context.
