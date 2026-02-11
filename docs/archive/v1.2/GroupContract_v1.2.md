> **Superseded**  
> This document has been superseded by the v1.3 release.  
> Please refer to the corresponding `*_v1.3.md` document for the authoritative version.

# GroupContract v1

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


## Entity
Group represents an action boundary.

## Membership Status
- pending
- active
- removed

## Authority
- Boundary Keeper (BK) manages membership.
- Members have no implicit invite rights unless specified.

## Invariants
- Group is the only relationship container.
- No reinterpretation of membership states.
