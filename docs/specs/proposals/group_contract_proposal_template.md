# Group Contract Change Proposal Template

> Location: `docs/specs/proposals/`
> Status: **DRAFT / NOT EFFECTIVE**
> Scope: **Group domain only**

---

## 0. Proposal Metadata

- Proposal ID: `GroupContract_v__proposal`
- Based on Contract Version: `GroupContract_v1.md`
- Author:
- Date:
- Motivation Type:
  - ☐ New real-world requirement
  - ☐ Existing rule insufficient
  - ☐ Inconsistency discovered

> ⚠️ This document is a **proposal only**. It has **no implementation authority** until explicitly frozen and promoted to a new Contract version.

---

## 1. Problem Statement (Why v1 Is Insufficient)

Describe **concretely**:
- What real behavior cannot be expressed with the current Contract
- Which exact rule / enum / invariant is blocking progress

Guidelines:
- Do NOT describe UI wishes
- Do NOT propose solutions yet
- Focus on system limitations

---

## 2. Constitution Compatibility Check (Mandatory)

For each item, explicitly answer **YES / NO** and explain:

- Does this proposal introduce any of the following?
  - Friends
  - Followers
  - Feeds
  - Likes / Ratings / Scores
  - Chat systems
  - Implicit social graphs

- Does this proposal weaken explicit invite + accept semantics?

- Does this proposal blur Group as the only boundary concept?

If **any answer is YES**, explain why it is still acceptable or revise proposal.

---

## 3. Contract-Level Changes

### 3.1 Enum Changes

| Enum Name | Change Type | Old Value(s) | New Value(s) | Rationale |
|---------|------------|--------------|--------------|-----------|
|         | add / modify / remove | | | |

> Leave table empty if no enum change is required.

---

### 3.2 Semantic Rule Changes

Describe any changes to meaning of existing rules, for example:
- join_policy behavior
- organizer / boundary_keeper responsibility
- group lifecycle assumptions

Use **before → after** format.

---

## 4. Invariants & Boundary Impact

For each invariant below, state **unchanged / modified / removed**:

- Group is the only people-boundary
- All relationships are explicit
- Match does not mutate Group
- Direct Group has no organizer
- Organized Group has exactly one boundary keeper

Explain impact if modified.

---

## 5. Data Model Impact (High-Level)

Describe **conceptually**, not in SQL:

- Tables affected:
- Columns added/removed:
- Constraints affected:
- RLS policies affected:

> ⚠️ Do NOT write SQL here.

---

## 6. Migration & Backward Compatibility

Answer explicitly:

- Can existing data remain valid under new rules?
- Is a one-time migration required?
- Can v1 and v2 coexist temporarily?

---

## 7. Decision & Freeze Section

### 7.1 Decision Status

- ☐ Under discussion
- ☐ Accepted
- ☐ Rejected
- ☐ Deferred

### 7.2 Freeze Confirmation (Required for Promotion)
Once accepted, fill and **lock** this section:

> This proposal is frozen and promoted to `GroupContract_v___.md`.
>
> From this point on:
> - All slices MUST reference the new Contract version
> - No implementation may continue under the old Contract

- Approved by:
- Date:

---

## 8. Notes

Optional notes, links to discussions, edge cases considered, or rejected alternatives.


