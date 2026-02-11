# Status & Semantics v1.3
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
