# PlayerHoods Database — Migration Governance Requirements

**Status:** authoritative  
**Scope:** database migration authoring / validation / PR completeness / drift correction discipline  
**Purpose:** define the mandatory working rules for all append-only database migrations and DB-facing schema changes.

---

## 1. Purpose of This Document

This document defines the required discipline for:

- authoring new database migrations,
- correcting implementation drift,
- validating DB-facing changes,
- and determining whether a migration is complete enough to merge.

It does **not** define domain rules in full.  
Domain rules remain governed by:

- `00_AUTHORITATIVE_INDEX.md`
- `DB_GOVERNANCE_CHARTER.md`
- topic-level canonical documents
- current facts / schema truth checks

This document governs **how** migration work must be performed.

---

## 2. Foundational Rule

## 2.1 Append-Only Only
All database evolution is append-only.

That means:

- existing committed migration files must never be edited,
- corrections must be made through new migration files,
- implementation drift must be corrected through new migrations,
- historical migration order must remain intact.

Any attempt to “fix history” by rewriting old migrations is disallowed.

---

## 2.2 Canonical Rules Come First
No migration may be generated from schema appearance alone.

Before writing SQL, the author must confirm:

1. the relevant global invariants,
2. the topic-level canonical rules,
3. the current facts / schema truth state,
4. and the latest migrations touching the same area.

If schema behavior conflicts with canonical rules, the schema behavior is drift and must not be treated as authority.

---

## 3. Required Reading Order Before Writing SQL

Before generating any DB-facing migration, read in this order:

1. `00_AUTHORITATIVE_INDEX.md`
2. `DB_GOVERNANCE_CHARTER.md`
3. the relevant topic-level canonical document(s)
4. latest relevant facts / schema truth check
5. current migration history affecting the same tables/functions/policies
6. active spec / audit for the work item, if applicable

No migration should be authored before this reading order is completed.

---

## 4. Mandatory Pre-Migration Checklist

Before writing SQL, the author must explicitly identify the following:

### 4.1 Scope of Change
- What exactly is changing?
- Which tables, functions, policies, indexes, triggers, views, or RPCs are affected?
- Is this a schema change, logic change, permission change, lifecycle change, or validation-only change?

---

### 4.2 Canonical Rule Affected
- Which invariant or canonical rule is affected?
- Is the migration aligned with the current governance charter?
- Is the migration aligned with the current topic-level canonical doc?

---

### 4.3 Drift vs New Behavior
- Is this migration correcting drift?
- Is this migration implementing a new approved rule?
- Is this migration only refactoring internal implementation while preserving external behavior?

This must be stated explicitly.

---

### 4.4 Risk to Existing Data
- What existing data might be affected?
- Could the migration misclassify rows?
- Could it change permissions unexpectedly?
- Could it alter lifecycle interpretation?
- Could it break existing UI/API assumptions?

---

### 4.5 Backfill / Data Transition Plan
If existing data needs interpretation changes or repair, the author must state:

- whether a backfill is needed,
- how the backfill works,
- what rows are expected to change,
- and whether the backfill is idempotent.

If no backfill is needed, say so explicitly.

---

### 4.6 Validation Plan
Before writing SQL, the author must define:

- what will be validated,
- which validation queries will be run,
- what successful results should look like,
- and how drift / regression will be detected.

---

## 5. Migration Authoring Rules

## 5.1 One Migration, One Coherent Purpose
Each migration should have a coherent purpose.

Good examples:
- fix removed-state predicate drift in admission helpers
- deprecate manual confirm RPCs
- add participant exit unified helper
- revoke anon execute on mutating RPCs

Avoid combining unrelated changes into one migration.

---

## 5.2 Prefer Minimal Surface Area
Migrations should change the smallest possible set of objects required to solve the problem.

Do not expand scope casually.

If additional issues are discovered during implementation:

- either stop and report them,
- or clearly split them into a separate migration.

---

## 5.3 Preserve External Contracts Unless Explicitly Changing Them
If the migration is intended as an internal refactor:

- external RPC signatures should remain stable,
- external semantic behavior should remain stable,
- and validation must confirm equivalence.

If the migration intentionally changes behavior, that change must be explicitly documented and validated.

---

## 5.4 No Hidden Rule Changes
A migration must not quietly introduce:

- new lifecycle semantics,
- new trust semantics,
- new permission semantics,
- new discovery/invite coupling,
- or new canonical interpretation rules

unless those changes are explicitly authorized and documented.

---

## 5.5 Canonical Over Derived
When canonical fields and derived fields disagree, new migrations must align logic to canonical truth, not to stale derived interpretation.

Examples:
- use canonical removed-state fields rather than stale removed status logic
- use canonical acceptance/approval fields rather than inferred status shortcuts

---

## 6. Forbidden Patterns

No migration may introduce any of the following:

### 6.1 Direct Status Writes That Bypass Canonical Lifecycle
Do not treat derived status as the primary lifecycle control where canonical fields already exist.

---

### 6.2 Logic Based on Deprecated Fields
Deprecated fields may remain in schema for compatibility, but they must not be used as new controlling logic.

---

### 6.3 Implicit Trust from Club Membership or Discovery
Club membership, club presence, discovery visibility, or similar convenience layers must not become implied trust or permission.

---

### 6.4 Implicit Invitation Permission from Discoverability
A user being discoverable must not automatically imply they are inviteable through a given path.

---

### 6.5 Convenience-Layer Membership Treated as Participation State
Invite-circle-like structures, saved-contact lists, or discovery surfaces must not be treated as participant state, approval state, or trust state.

---

### 6.6 Scattered Permission Logic in RPC Bodies
Do not keep expanding RPCs into the main home of business-permission logic when the logic belongs in predicates or helpers.

---

## 7. Validation Requirements

## 7.1 No Migration Is Complete Without Validation
Every meaningful migration must include validation.

At minimum, validation should cover:

1. **structure**
   - the object exists / changed as intended
2. **behavior**
   - the new logic behaves as intended
3. **data-state correctness**
   - real row state or derived state remains consistent

---

## 7.2 Validation Must Match the Type of Change
Different changes require different validation:

### Schema shape changes
Validate:
- columns
- indexes
- constraints
- views
- triggers
- functions

### Lifecycle logic changes
Validate:
- participant state transitions
- reconcile behavior
- action logs
- re-entry / exit / confirmation invariants

### Permission / policy changes
Validate:
- allowed path still works
- forbidden path is blocked
- grants / revokes behave as intended

### Refactors
Validate:
- behavior equivalence
- no contract break
- no regression in existing flows

---

## 7.3 Regression-Aware Validation
If a change touches a core lifecycle, permission, or participation path, it should be validated against:

- existing regression SQL where available,
- focused scenario validation,
- and any related truth-check documents.

---

## 8. Facts / Truth-Check Update Requirements

Where a migration materially changes DB-facing behavior, the author must also update the relevant implementation-truth artifacts as needed.

This may include:

- facts docs,
- schema truth-check docs,
- function inventories,
- permission inventories,
- or regression notes.

The exact update may be:
- patching the facts doc,
- regenerating a truth snapshot,
- or documenting known pending remote drift.

But migration work must not leave implementation truth completely undocumented.

---

## 9. PR Completeness Requirements

A migration PR is not complete unless it includes the following, as applicable:

### 9.1 Required Artifacts
- migration SQL file
- any necessary validation SQL or validation procedure
- relevant facts / truth-check update
- brief implementation summary

---

### 9.2 Required Explanation
The PR must explain:

- what changed,
- why it changed,
- whether it fixes drift or introduces approved new behavior,
- what invariants are involved,
- what was validated,
- and whether any follow-up work remains.

---

### 9.3 Required Validation Evidence
The PR must show evidence for the relevant checks, for example:

- structure check
- behavior check
- data-state check
- regression suite result
- policy/grant result

No migration PR should be merged with “SQL only” and no proof.

---

## 10. Validation Query Minimum Standard

For most non-trivial migrations, the minimum expectation is **at least 3 validation checks** covering:

1. structure
2. behavior / permission
3. data-state correctness

For lifecycle-sensitive changes, more than 3 is often appropriate.

---

## 11. Drift Correction Rule

If a migration is correcting drift, the author must say so explicitly.

A drift-correction migration should identify:

- the canonical rule,
- the observed drift,
- the likely impact,
- the fix,
- and the validation showing the drift is removed.

Do not present drift correction as an unexplained random refactor.

---

## 12. Preferred Implementation Order

For substantial DB-facing work, the preferred order is:

1. freeze authoritative rules
2. inspect current schema / drift
3. design minimal schema support
4. add / adjust minimal helper functions
5. add / adjust `can_*` predicates if needed
6. update / add RPCs
7. add validation
8. run regression / truth checks
9. update facts / documentation

This order is preferred because it reduces hidden drift and keeps logic layering clean.

---

## 13. Practical Rule for Agents and Maintainers

Before generating SQL, the author should be able to answer all of the following clearly:

- What canonical rule am I implementing or protecting?
- What existing implementation drift am I correcting, if any?
- Why is this migration minimal?
- What existing data could be affected?
- How will I prove this is correct?
- What facts / truth-check docs need updating afterward?

If these questions cannot be answered yet, the migration is not ready to be written.

---

## 14. Bottom Line

A PlayerHoods migration is not “done” when the SQL compiles.

It is only done when:

- it respects canonical rules,
- it preserves append-only history,
- it has minimal and coherent scope,
- it includes validation,
- it updates implementation truth as needed,
- and it leaves the system more aligned, not more ambiguous.