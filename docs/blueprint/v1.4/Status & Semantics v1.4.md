# Status & Semantics v1.3

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

---

## Club Handle Semantics (v1.4)

Identity is club-scoped.

Definitions:

club_handle:
  The user-visible identity inside a specific club.

club_handle_norm:
  lower(club_handle), generated column.
  Used only for uniqueness enforcement.

display_name:
  Always equals the handle of primary_club_id.

Rules:

1. A user may have multiple handles (one per club).
2. Handles are unique per club.
3. Case-only changes are allowed.
4. display_name is never directly user-editable.
5. Renaming primary club handle updates display_name atomically.

This semantic is authoritative from v1.4 onward.

---
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

Status: Frozen (Authoritative)

This document defines all status fields, derived semantics, and invariants
used across playerhoods.com v1.3.

---

## 1. Core Principle

Statuses are **not workflows**.

All workflows must be expressed through:
- explicit fields
- derived state
- terminal transitions

This prevents status explosion and semantic ambiguity.

---

## 2. match_participants.status (Frozen)

Allowed values:

- pending
- confirmed
- removed

No additional values are permitted in v1.x.

---

## 3. Dual Confirmation Semantics (v1.2)

### 3.1 Fields

- user_accepted_at timestamptz null
- org_approved_at timestamptz null
- org_approved_by uuid null (optional, audit)

---

### 3.2 Derived Confirmation

For **user participants**:

effective_confirmed :=
user_accepted_at IS NOT NULL
AND
org_approved_at IS NOT NULL


For **guest participants**:

effective_confirmed :=
org_approved_at IS NOT NULL


---

### 3.3 Status Synchronization Rule

- If effective_confirmed becomes true → status MUST be set to confirmed
- Otherwise → status remains pending


Status must never encode which side confirmed.

---

## 4. removed Semantics

- removed represents:
  - organizer rejection
  - participant withdrawal
  - administrative removal

- removed participants must not appear in default user-facing views

---

## 5. Prohibited Patterns

The following are forbidden in v1.x:

- Introducing accept/approved/accepted statuses
- Using status to encode multi-step workflows
- Using enum reinterpretation
- Implicit confirmation without explicit fields

---

## 6. Version History

- v1.0: single-sided confirmation
- v1.1: capability refinement
- v1.2: dual confirmation via fields (current)
