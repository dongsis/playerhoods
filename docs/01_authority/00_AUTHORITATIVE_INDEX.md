# PlayerHoods Database — Authoritative Index

**Status:** authoritative  
**Scope:** database governance / authority map / conflict resolution  
**Purpose:** define what is authoritative, where the current canonical rules live, and how to resolve conflicts between docs, schema, and implementation.

---

## 1. Purpose of This Document

This file is the **entry point for database-facing authority**.

It does **not** attempt to restate every domain rule in full.  
Instead, it defines:

1. the authority hierarchy,
2. the canonical document for each major topic,
3. the conflict-resolution rule when documents and implementation diverge,
4. the reading order before any DB-facing design or migration work.

If a topic is not fully specified here, follow the canonical document linked for that topic.

---

## 2. Authority Hierarchy

### 2.1 Highest Authority for DB Governance
The following are authoritative for database behavior and DB-facing implementation governance:

1. **This index** (`00_AUTHORITATIVE_INDEX.md`) for authority mapping and conflict resolution
2. **Baseline overview and semantics** in `../baseline/DB_BASELINE_2026-03-14.md` and `../baseline/DB_SEMANTICS_BASELINE.md`
3. **Current schema baseline snapshot** in `../baseline/schema_baseline.sql`
4. **DB Governance Charter** for global database invariants and governance rules
5. **Topic-level canonical documents** for lifecycle, delegate, permissions, admission/discovery rules
6. **Migration status index** in `../baseline/MIGRATION_STATUS_INDEX.md`
7. **Current append-only migrations** as implementation change history
8. **Current schema / facts snapshots** as implementation evidence, subject to drift review

---

### 2.2 Domain Rule Authority
Where domain rules are already consolidated and accepted, the relevant canonical documents are authoritative.

Where an older consolidated master spec still contains useful domain intent, it may remain a reference source, but **current topic-level canonical documents take precedence once they have been explicitly updated and aligned with implementation**.

---

### 2.3 Schema and Facts
- `schema.sql` and facts documents reflect implementation state, but may contain drift or timing mismatch.
- They are **evidence of current state**, not automatically the highest rule authority.
- If implementation conflicts with canonical invariants, the implementation is considered drift and must be corrected through append-only migration.

---

## 3. Conflict Resolution Rule

When conflicts exist, resolve them in this order:

1. **Baseline semantics and baseline overview**
2. **Global canonical invariants** in the governance charter
3. **Topic-level canonical documents**
4. **Most recent validated migration intent**
5. **Current schema / facts snapshot**
6. **Older specs, audits, or historical planning documents**

### Interpretation rule
If implementation appears valid in the current schema but conflicts with:
- canonical confirmation rules,
- canonical removed / re-entry rules,
- ShareGroup trust boundary,
- explicit permission controls,
- discovery vs invite-permission separation,
- or other canonical DB invariants,

then the implementation is considered **drift** and must be corrected via append-only migration.

---

## 4. Canonical Topic Map

This section tells you which document is currently authoritative for each topic.

### 4.1 Participant Lifecycle
**Canonical document:**  
- `Match_Participant_Lifecycle_Canonical.md`

**Covers:**  
- enter / request / admit / nominate  
- participant acceptance  
- organizer approval  
- confirmed rules  
- remove / withdraw / exit  
- re-entry / restart  
- reset / lifecycle transitions

---

### 4.2 Delegate Confirm Model
**Canonical document:**  
- `DELEGATE_MODEL_FINAL.md`

**Covers:**  
- delegate-confirm semantics  
- organizer vs non-organizer behavior  
- requested / invited / nominated behavior  
- ShareGroup trust boundary in delegate flows  
- deprecated manual confirm replacement model

---

### 4.3 Permission Architecture
**Canonical document:**  
- `PERMISSION_ARCHITECTURE_v1.md`

**Covers:**  
- RPC vs `can_*` vs helper separation  
- permission predicate layering  
- action-level permission design  
- fact helper design principles

---

### 4.4 Admission / Re-entry / Participation Entry
**Canonical documents:**  
- `Admission_Family_Unified_Helper_Design.md`
- `Match_Participation_Flows_and_Scope.md`

**Covers:**  
- request / admit / nominate entry paths  
- scope rules  
- re-entry behavior  
- removed vs active participant handling  
- entry-point semantics

---

### 4.5 Organizer Match Operations
**Canonical document:**  
- `Organizer_Match_Operations.md`

**Covers:**  
- organizer actions  
- participant management  
- approval behavior  
- participant removal behavior from organizer perspective

---

### 4.6 Discovery / Invite / Play Network Core
**Canonical document:**  
- `PLAY_NETWORK_DISCOVERY_AND_INVITE_CANONICAL.md`  
  *(create this if not yet created; until then, related active-spec docs remain the best working reference)*

**Covers:**  
- Invite Circle semantics  
- Club Members semantics  
- direct invite path  
- non-group invite permission  
- discovery visibility vs invitation permission separation

---

### 4.7 Current DB Facts
**Current fact sources:**  
- `../02_facts/FACTS_functions.md`
- `../02_facts/FACTS_tables.md`
- `../02_facts/SCHEMA_TRUTH_CHECK_2026-03.md`

**Purpose:**  
These documents describe observed implementation state and known drift.  
They do not override canonical rules, but they are required to validate whether implementation is aligned.

---

### 4.8 Contact Player Canonicalization (Canonicalization Settlement)
**Design document:**  
- `../fixes/Contact_Player_Canonicalization_Orchestration_Design.md`

**Covers:**  
- Unified orchestration flow for "Contact Player → Registered User" in a match
- One real person × one match → one active canonical row
- Row identity and active-row uniqueness; does **not** decide acceptance or approval
- Step chain, input/output, phased adoption (L1–L5)

**Status:** Level 1 design complete. Next: L2 dry-run audit (read-only).

**Lifecycle reference:** See `Match_Participant_Lifecycle_Canonical.md` §8.

---

## 5. Global Canonical Invariants (Summary Only)

This section is only a summary.  
The full rules belong in the governance charter and topic canonicals.

### 5.1 Confirmation Invariant
A participant is confirmed if and only if:
- `participant_accepted_at IS NOT NULL`
- `org_approved_at IS NOT NULL`

No exceptions.

---

### 5.2 Status Is Derived
`status` is derived state.  
It is not the canonical source for lifecycle truth where canonical fields already exist.

---

### 5.3 Removed / Re-entry Canonical Principle
Where removed-state truth is needed, canonical logic should rely on removed-state fields rather than stale derived status values.

---

### 5.4 ShareGroup Boundary
ShareGroup trust applies only to:
- `groups.group_kind = 'friend'`

Club groups do not imply trust equivalence.

---

### 5.5 Discovery and Invite Permission Are Separate
Discoverability and invitation permission are separate axes and must not be collapsed into one implied permission.

---

## 6. Document Classification Rule

All DB-related docs should be classified as one of the following:

### Authority
Current rules to execute against.

### Facts
Observed implementation truth / schema snapshots / drift checks.

### Spec
Design, plan, audit, refactor reasoning, or implementation proposal.

### Validation
Test plans, regression coverage, manual verification checklists.

### Archive
Historical or superseded material. Not current authority.

If a document is not clearly classified, it should not be treated as authoritative.

---

## 7. Required Reading Order Before DB Work

Before generating or reviewing any DB-facing change, read in this order:

1. `00_AUTHORITATIVE_INDEX.md`
2. `../baseline/DB_BASELINE_2026-03-14.md`
3. `../baseline/schema_baseline.sql`
4. `../baseline/DB_SEMANTICS_BASELINE.md`
5. `../baseline/LEGACY_AND_RETIRED_ITEMS.md`
6. `../baseline/MIGRATION_STATUS_INDEX.md`
7. `DB_GOVERNANCE_CHARTER.md`
8. the relevant topic canonical document(s)
9. latest relevant facts / schema truth check
10. current migrations touching the same area (only when needed for traceability)
11. active spec / audit for the current work item

No migration or DB-facing implementation should proceed without confirming alignment across these layers.
Do not start by reverse-reading large historical migration ranges to infer current rules.

---

## 8. Migration Governance Pointer

Migration writing rules, validation expectations, and PR requirements are governed by:

- `MIGRATION_GOVERNANCE_REQUIREMENTS.md`

This index does not restate those details in full.

### Practical migration handling rule

- Keep old migration files as historical ledger.
- Do not rewrite old migration files.
- Do not move old migration files to simulate cleanup.
- Perform cleanup by creating **new append-only migrations** that drop/revoke/adjust objects.
- Use `../baseline/MIGRATION_STATUS_INDEX.md` to determine whether a migration is active foundation, retained history, cleanup track, or non-authoritative design source.

---

## 9. Supersession Rule

When a newer canonical document explicitly supersedes an older design or audit doc:

- the newer canonical doc becomes authoritative,
- the older doc remains historical/spec reference only,
- and the older doc should be marked as superseded where practical.

---

## 10. Current Practical Rule for Agents and Maintainers

When working on database logic:

- do not infer authority from filename alone,
- do not treat `schema.sql` as automatically authoritative,
- do not rely on older phase documents when a canonical doc exists,
- do not use deprecated fields or stale derived status logic where canonical fields exist,
- and do not generate migrations before checking both canonical rules and current facts.

---

## 11. Current Open Alignment Areas

The following areas require special care because they have recently changed or been audited:

- manual confirm deprecation and composed replacement flows
- participant-exit unified helper
- re-entry admission semantics (`removed_at` canonical handling)
- delegate-confirm organizer behavior
- discovery vs non-group invite permission separation

These should always be checked against the newest canonical and facts documents before making changes.

---

## 12. Bottom Line

This file answers three questions:

1. **What should I trust?**  
   → the governance charter + topic-level canonical docs

2. **Where do I check implementation reality?**  
   → facts + schema truth check + latest migrations

3. **What do I do if they conflict?**  
   → treat implementation as drift and correct it via append-only migration