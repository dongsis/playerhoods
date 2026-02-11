# AI Prompt Template — playerhoods.com

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


Use this template at the start of ANY AI-assisted coding session.

---

This is an implementation discussion for playerhoods.com.

All implementations MUST strictly comply with playerhoods.com v1.2 Frozen Docs,
especially Match Invitation & Registration Spec v1.2.

If any behavior is not explicitly defined in the frozen docs,
ASK before implementing.

---

Context:
[Briefly describe what you want to implement here]

Relevant Docs:
[List the exact markdown files you are referencing]

Expected Output:
[SQL / RLS / RPC / Code / Review]
