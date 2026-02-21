# System Blueprint v1.3

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

---

## Identity Layer — v1.4 Addendum

Effective version: v1.4

This version introduces the Club Identity System.

### Identity Model

User identity is contextual per club.

Each user may belong to multiple clubs.
Each club defines a unique `club_handle` per member.

Canonical structure:

club_identities (
  club_id,
  user_id,
  club_handle
)

Constraints:
- UNIQUE (club_id, user_id)
- UNIQUE (club_id, club_handle) — case-insensitive

`club_handle_norm` is GENERATED ALWAYS AS lower(club_handle).

---

### Primary Club

profiles.primary_club_id determines:

- Which club’s handle becomes the global display_name.
- display_name = club_handle of primary_club_id.

Changing primary club automatically syncs display_name.

---

### Profile Write Restrictions

Direct UPDATE on profiles is prohibited.

All identity writes MUST go through SECURITY DEFINER RPCs:

- rpc_profile_init
- rpc_profile_update
- rpc_club_join
- rpc_club_handle_set
- rpc_profile_set_primary_club

This is a frozen invariant in v1.4.

---

## Scope
- Group-based human boundaries
- Match creation and participation
- Invite / Request flows
- Derived formed logic

## Explicit Non-goals
- Social feeds
- Implicit relationships
- Bulk invitations

Participation confirmation is dual-sided and field-driven.

The system does not model workflows through status,
but through explicit acceptance and approval fields,
with status serving only as a terminal summary.
