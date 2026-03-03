# Authoritative Index for PlayerHoods Database
PlayerHoods Database Governance Contract

1. Authority Hierarchy

- This document is the highest authority for DB behavior and must always be referenced for correctness in all DB operations.
- PlayerHoods v1.6.3 Consolidated Master Spec is authoritative for domain rules.
- db_schema.sql reflects implementation but may contain drift.

When conflicts exist:
- v1.6.3 + this document override db_schema.sql
- Implementation must be aligned via append-only migration.

2. Core Invariants (Non-Negotiable)

2.1 Unified Confirmation Invariant

A participant (user OR guest) is confirmed if and only if:
- participant_accepted_at IS NOT NULL
AND
- org_approved_at IS NOT NULL

No exceptions. Guests are NOT exempt.
2.2 Status Is Derived — Never Written

- status is a derived state.
- public.match_participant_reconcile_status(p_mp_id) is the sole authority and dictates participant status based on acceptance timestamps.
- No RPC, trigger, or migration may directly set status = 'confirmed'.

2.3 Deprecated Fields

The following fields are deprecated:
- user_accepted_at
- matches.admission_mode

They may exist for backward compatibility but:
- MUST NOT be used in logic
- MUST NOT be read inside reconcile
- MUST NOT be used in new migrations

2.4 Restart Doctrine

- Re-entry is permitted ONLY through:
  - rpc_match_request_join (user restart)
  - rpc_match_invite_user (organizer restart)
- Nominate or delegate-confirm MUST NOT reactivate removed participants.
- No other reactivation RPCs are permitted.

2.5 ShareGroup Boundary

- ShareGroup trust applies ONLY to:
  - groups.group_kind = 'friend'
- Club groups never imply trust equivalence.

3. Migration Writing Principles

- All migrations are append-only.
- Existing migration files must never be modified.
- No migration may introduce:
  - direct status='confirmed' (avoid any unqualified STATUS writes; utilize reconciliation logic instead)
  - logic dependent on deprecated fields
  - implicit trust via club groups
- All invariant changes must preserve data consistency.

4. Mandatory Pre-Migration Checklist

Before generating SQL, the Agent MUST:
- Read and acknowledge this file (00_AUTHORITATIVE_INDEX.md).
- Confirm alignment with PlayerHoods v1.6.3 Consolidated Master Spec.
- Inspect current schema (db_schema.sql or migrations).
- Explicitly describe:
- What invariant is affected
- Risk of existing data
- Backfill plan
- Validation query


5. 每个 migration PR 必须包含：

- migration SQL 文件
- FACTS patch（或 regenerate）
- 最少 3 条验证 SQL（结构/权限/数据状态）

No SQL may be generated before this checklist is satisfied.