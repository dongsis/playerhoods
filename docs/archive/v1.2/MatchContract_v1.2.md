> **Superseded**  
> This document has been superseded by the v1.3 release.  
> Please refer to the corresponding `*_v1.3.md` document for the authoritative version.

# MatchContract v1.2

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


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
