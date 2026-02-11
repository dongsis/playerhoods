# Match Admission Semantics — v1.3 Addendum

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`

*(to be appended to Execution State & Technical Appendix)*

## 0. Version Scope & Unlock Declaration
This addendum upgrades admission and removal semantics from v1.2 to v1.3.

**Unlocked / changed semantics:**
- `removed` is no longer terminal; it becomes **inactive but reversible**
- Re-entry is performed by **reactivating the same participant record**
- Admission boundaries across **request / invite / nominate** are clarified
- Visibility and re-entry rights for removed participants are formalized

All other frozen constraints (enums, core tables, uniqueness) remain unchanged unless explicitly stated.

---

## 1. Core Definitions (Normative)

### 1.1 Scope (Request Qualification Boundary)
- **Scope applies only to `request`**
- Scope is defined by **one or more Groups** (scope groups)
- A **User is not a Group**
- A **direct group (two users)** is a valid Group and may be included in scope
- Scope **does not restrict** `invite` or `nominate`

> Scope defines *who is eligible to request*, not who may ultimately participate.

### 1.2 Admission Target
- An **admission target** is an individual (user or guest) for whom an admission action is created
- Admission targets are represented exclusively by rows in `match_participants`
- Admission targets:
  - May originate from scope groups (`request`)
  - May originate outside scope (`invite`, `nominate`)
- Admission targets are **not Groups** and do not form relationship containers

### 1.3 Participant Record
- Each `(match_id, user_id)` corresponds to **a single participant record**
- This record represents the **current admission state snapshot**
- Historical actions are not inferred from status transitions alone

---

## 2. Admission Flows (Clarified)

### 2.1 Request (Group-based Only)
- Request targets **Groups**, not individuals
- Request cannot target a subset of members within a Group
- A request is permitted only when the requester is a member of at least one scope groups and admission mode allows request
- Users outside all scope groups **cannot request**

### 2.2 Invite (Individual-based)
- Invite targets **individual users**
- Invite is **not restricted by scope**
- Invite may target:
  - Scope members
  - Non-scope members
  - Users not belonging to any Group
- Invite links represent a **self-invite UX**, not a request

### 2.3 Nominate (Participant-driven, Individual-based)
- Nominate targets **individual users**
- Nominate is **not restricted by scope**
- Nominate is initiated by a participant (non-ORG) and creates a pending admission target
- Nominate is neither request nor invite and has its own confirmation path

---

## 3. Removal Semantics (v1.3)

### 3.1 Removed State Redefined
- `removed` represents an **inactive admission state**
- `removed` is **not terminal**
- A removed participant may re-enter the admission flow under controlled rules

### 3.2 Two Classes of Removal

#### A. User-Initiated Withdrawal
- Cause: user self-withdraws
- Consequences:
  - User may initiate rejoin
  - Participant returns to `pending`
  - Organizer approval is still required

#### B. Organizer-Initiated Removal / Rejection (**Normative**)
- Cause: ORG remove or reject
- Consequences:
  - User **cannot** rejoin or accept independently
  - **Organizer must explicitly reactivate**
  - Only after reactivation may the user accept again

---

## 4. Reactivation Semantics (New)

### 4.1 Reactivation Definition
- **Reactivation** is an organizer-only action
- Reactivation transitions a participant from `removed` → `pending`
- Reactivation does **not** create a the same participant record (reactivated in v1.3)
- Reactivation restores eligibility to continue admission confirmation

### 4.2 Reactivation Constraints
- Reactivation applies only to organizer-removed participants and must be explicit and auditable
- No automatic reactivation is permitted

---

## 5. Visibility & Re-entry Access (Strategy A)

### 5.1 Visibility for Removed Participants
- Removed users **within scope** may still see the match
- They see a **“rejoin / waiting for reactivation”** entry point
- Acceptance is disabled until organizer reactivation

### 5.2 Post-Reactivation Visibility
- After organizer reactivation:
  - Participant re-enters `pending`
  - User regains the ability to accept
  - Normal confirmation rules resume

---

## 6. State Transitions (Normative)

### 6.1 Allowed Transitions
- `pending → confirmed`
- `confirmed → removed`
- `pending → removed`
- `removed → pending` (**organizer reactivation only**)

### 6.2 Prohibited Transitions
- `removed → confirmed` (direct)
- User-driven `removed → pending` after organizer removal

---

## 7. Invariants & Constraints (Explicitly Preserved)
- **Uniqueness preserved**: one participant record per `(match_id, user_id)`
- No [Deprecated as of v1.3]

partial unique indexes
- Re-entry occurs via **state transition**, not insertion

---

## 8. Audit & History (Required by v1.3 Semantics)
- `match_participants` stores **current state only**
- Historical actions (remove, reactivate, accept, approve) must be recorded via append-only event logging
- Historical integrity must not depend on overwritten fields

---

## 9. Compatibility Note
- v1.3 semantics supersede v1.2 assumptions regarding `removed` terminality
- Existing data remains valid
- No data migration is required for correctness (semantic upgrade only)
