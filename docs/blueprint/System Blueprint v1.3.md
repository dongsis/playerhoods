# System Blueprint v1.3

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


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
