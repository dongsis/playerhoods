# PlayerHoods Database - Authoritative Index

**Status:** authoritative  
**Scope:** database governance / authority map / conflict resolution  
**Purpose:** define what is authoritative, where the canonical rules live, and how to resolve conflicts between docs, schema, and implementation.

---

## 1. Purpose of This Document

This file is the entry point for database-facing authority.

It does not restate every domain rule in full. Instead, it defines:

1. the authority hierarchy
2. the canonical document for each major topic
3. the conflict-resolution rule when documents and implementation diverge
4. the reading order before DB-facing design or migration work

If a topic is not fully specified here, follow the canonical document linked for that topic.

---

## 2. Authority Hierarchy

### 2.1 Highest Authority for DB Governance

The following are authoritative for database behavior and DB-facing implementation governance:

1. This index (`00_AUTHORITATIVE_INDEX.md`) for authority mapping and conflict resolution
2. Baseline overview and semantics in `../baseline/DB_BASELINE_2026-03-14.md` and `../baseline/DB_SEMANTICS_BASELINE.md`
3. Frozen baseline bootstrap SQL in `../../supabase/baseline/BASELINE_SCHEMA.sql`
4. DB Governance Charter for global database invariants and governance rules
5. Topic-level canonical documents for lifecycle, Contact Player / Match Proxy authority, permissions, admission, and discovery rules
6. Migration status index in `../baseline/MIGRATION_STATUS_INDEX.md`
7. Current append-only migrations as implementation change history
8. Current runtime snapshot in `../../schema.sql` plus current facts documents, as implementation evidence subject to drift review

### 2.2 Domain Rule Authority

Where domain rules are already consolidated and accepted, the relevant canonical documents are authoritative.

Older consolidated master specs may remain useful as reference material, but current topic-level canonical documents take precedence once explicitly updated and aligned with implementation.

### 2.3 Schema and Facts

- `../../supabase/baseline/BASELINE_SCHEMA.sql` is a frozen bootstrap layer for baseline reset execution, not a current runtime snapshot.
- `../../schema.sql` and facts documents reflect the current local runtime state, but may still contain drift or timing mismatch against canonical rules.
- They are evidence of current state, not automatically the highest rule authority.
- If implementation conflicts with canonical invariants, the implementation is treated as drift and must be corrected through append-only migration.

---

## 3. Conflict Resolution Rule

When conflicts exist, resolve them in this order:

1. Baseline semantics and baseline overview
2. Global canonical invariants in the governance charter
3. Topic-level canonical documents
4. Most recent validated migration intent
5. Current schema / facts snapshot
6. Older specs, audits, or historical planning documents

### Interpretation Rule

If implementation appears valid in the current schema but conflicts with:

- canonical confirmation rules
- canonical removed / re-entry rules
- Contact Player and Match Proxy boundary rules
- explicit permission controls
- discovery vs invite-permission separation
- or other canonical DB invariants

then the implementation is considered drift and must be corrected via append-only migration.

---

## 4. Canonical Topic Map

### 4.0 Release / Deployment Governance

**Governance documents:**  
- `../00_RELEASE_GOVERNANCE.md`
- `../00_PRODUCTION_CHANGE_LOG.md`

**Covers:**  
- environment definitions for Local, GitHub, Vercel Preview, Vercel Production, Supabase Local, and Supabase Remote
- Patch / Mini Release / Structural Release classification
- production alignment and verification status definitions
- required production change logging
- Unknown Rule for unverifiable deployment, migration, and production-test state
- required Environment Impact Report for Codex tasks

These documents govern release/deployment status language. They do not override DB canonical behavior rules, but they are authoritative for how production state is recorded and reported.

### 4.1 Participant Lifecycle

**Canonical documents:**  
- `Match_Participant_Lifecycle_Canonical.md`
- `Match_Function_Layering_Canonical.md`

**Covers:**  
- enter / request / admit / nominate
- participant acceptance
- organizer approval
- confirmed rules
- remove / withdraw / exit
- re-entry / restart
- reset / lifecycle transitions
- public RPC / wrapper / helper layering for current match flows

### 4.2 Contact Player + Match Proxy Authority

**Canonical documents:**  
- `Contact_Player_and_Match_Proxy_Canonical_v1_2.md`
- `Match_Participant_Lifecycle_Canonical.md`

**Covers:**  
- Contact Player identity boundary
- person node vs contact record
- Match Proxy authority
- participant-side self-service vs proxy-service authority
- retirement of ad-hoc delegate-confirm semantics

### 4.3 Permission Architecture

**Canonical documents:**  
- `PERMISSION_ARCHITECTURE_v1.md`
- `Match_Function_Layering_Canonical.md`

**Covers:**  
- RPC vs `can_*` vs helper separation
- permission predicate layering
- action-level permission design
- fact helper design principles
- public RPC / wrapper / helper boundary for match functions

### 4.4 Admission / Re-entry / Participation Entry

**Canonical documents:**  
- `Admission_Family_Unified_Helper_Design.md`
- `Match_Participation_Flows_and_Scope.md`
- `Contact_Player_and_Match_Proxy_Canonical_v1_2.md`

**Covers:**  
- request / admit / nominate / direct-invite entry paths
- scope rules
- re-entry behavior
- removed vs active participant handling
- entry-point semantics

### 4.5 Organizer Match Operations

**Canonical document:**  
- `Organizer_Match_Operations.md`

**Covers:**  
- organizer actions
- participant management
- approval behavior
- participant removal behavior from organizer perspective

### 4.6 Discovery / Invite / Play Network Core

**Canonical documents:**  
- `PLAY_NETWORK_DISCOVERY_AND_INVITE_CANONICAL.md`
- `Contact_Player_and_Match_Proxy_Canonical_v1_2.md`

**Covers:**  
- Invite Circle semantics
- Venue Members semantics
- direct invite path
- non-group invite permission
- discovery visibility vs invitation permission separation
- Contact Player non-discovery rules

### 4.7 Current DB Facts

**Current fact sources:**  
- `../02_facts/FACTS_functions.md`
- `../02_facts/FACTS_tables.md`
- `../02_facts/SCHEMA_TRUTH_CHECK_2026-03.md`

**Purpose:**  
These documents describe observed implementation state and known drift. They do not override canonical rules, but they are required to validate whether implementation is aligned.

### 4.8 Contact Player Canonicalization and Proxy Boundary

**Canonical / design documents:**  
- `Contact_Player_and_Match_Proxy_Canonical_v1_2.md`
- `../fixes/Contact_Player_Canonicalization_Orchestration_Design.md`

**Covers:**  
- unified orchestration flow for "Contact Player -> Registered User" in a match
- one real person x one match -> one active canonical row
- person node vs contact record settlement
- Match Proxy binding boundary
- row identity and active-row uniqueness; does not decide acceptance or approval
- phased orchestration adoption

---

## 5. Global Canonical Invariants

### 5.1 Confirmation Invariant

A participant is confirmed if and only if:

- `participant_accepted_at IS NOT NULL`
- `org_approved_at IS NOT NULL`

No exceptions.

### 5.2 Status Is Derived

`status` is derived state. It is not the canonical source for lifecycle truth where canonical fields already exist.

### 5.3 Removed / Re-entry Canonical Principle

Where removed-state truth is needed, canonical logic should rely on removed-state fields rather than stale derived status values.

### 5.4 ShareGroup Boundary

ShareGroup trust applies only to:

- `groups.group_kind = 'friend'`

Venue groups do not imply trust equivalence.

### 5.5 Discovery and Invite Permission Are Separate

Discoverability and invitation permission are separate axes and must not be collapsed into one implied permission.

### 5.6 Participant-side Authority Must Be Explicit

Participant-side authority for another person's match participation must come from:

- self action by the principal, or
- explicit active Match Proxy binding

It must not come from:

- shared group
- shared match
- participant status
- contact owner status
- generic social proximity

---

## 6. Document Classification Rule

All DB-related docs should be classified as one of:

- Authority: current rules to execute against
- Facts: observed implementation truth / schema snapshots / drift checks
- Spec: design, plan, audit, refactor reasoning, or implementation proposal
- Validation: test plans, regression coverage, manual verification checklists
- Archive: historical or superseded material

If a document is not clearly classified, it should not be treated as authoritative.

---

## 7. Required Reading Order Before DB Work

Before generating or reviewing DB-facing change, read in this order:

1. `00_AUTHORITATIVE_INDEX.md`
2. `../baseline/DB_BASELINE_2026-03-14.md`
3. `../../supabase/baseline/BASELINE_SCHEMA.sql`
4. `../baseline/DB_SEMANTICS_BASELINE.md`
5. `../baseline/LEGACY_AND_RETIRED_ITEMS.md`
6. `../baseline/MIGRATION_STATUS_INDEX.md`
7. `DB_GOVERNANCE_CHARTER.md`
8. the relevant topic canonical document(s)
9. latest relevant facts / schema truth check and `../../schema.sql`
10. current migrations touching the same area, when needed for traceability
11. active spec / audit for the current work item

No migration or DB-facing implementation should proceed without confirming alignment across these layers.

---

## 8. Migration Governance Pointer

Migration writing rules, validation expectations, and PR requirements are governed by:

- `MIGRATION_GOVERNANCE_REQUIREMENTS.md`

### Practical Migration Handling Rule

- Archived pre-baseline migrations are preserved at `../../supabase/migrations_archive/pre_baseline_20260328/`.
- `supabase/migrations` contains only post-baseline append-only migrations.
- Do not rewrite archived migration files.
- Perform cleanup and evolution by creating new append-only migrations in `supabase/migrations`.
- Use `../baseline/MIGRATION_STATUS_INDEX.md` to determine whether a migration is active foundation, retained history, cleanup track, or non-authoritative design source.

---

## 9. Supersession Rule

When a newer canonical document explicitly supersedes an older design or audit doc:

- the newer canonical doc becomes authoritative
- the older doc remains historical / spec reference only
- the older doc should be marked as superseded where practical

---

## 10. Current Practical Rule for Agents and Maintainers

When working on database logic:

- do not infer authority from filename alone
- do not treat either `../../supabase/baseline/BASELINE_SCHEMA.sql` or `../../schema.sql` as automatically authoritative without checking the canonical documents
- do not rely on older phase documents when a canonical doc exists
- do not use deprecated fields or stale derived status logic where canonical fields exist
- do not generate migrations before checking both canonical rules and current facts

---

## 11. Current Open Alignment Areas

The following areas require special care because they have recently changed or been audited:

- Match Proxy rollout and ad-hoc delegate retirement
- participant-exit unified helper
- re-entry admission semantics (`removed_at` canonical handling)
- Contact Player person-node vs contact-record boundary
- discovery vs non-group invite permission separation

These should always be checked against the newest canonical and facts documents before making changes.

---

## 12. Bottom Line

This file answers three questions:

1. What should I trust?  
   -> the governance charter + topic-level canonical docs
2. Where do I check implementation reality?  
   -> facts + schema truth check + latest migrations
3. What do I do if they conflict?  
   -> treat implementation as drift and correct it via append-only migration
