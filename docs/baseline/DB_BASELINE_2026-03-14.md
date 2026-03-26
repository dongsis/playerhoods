# DB Baseline Overview (2026-03-14)

## Baseline Identity

- Baseline date: `2026-03-14`
- Baseline branch: `v2.0` (aligned with `main`)
- Baseline commit: `03522d7`
- Baseline patch migration: `20260328153000_staging_gate_fix_invitation_get_and_guest_ambiguity.sql`
- Baseline type: post-merge stable snapshot

## Baseline Freeze Rule

This baseline is frozen at commit `03522d7` as the governance starting point.  
It does not imply deleting history. Historical migrations remain append-only ledger records.
Post-freeze hotfix migrations can be attached as patch-level updates when they are baseline-critical.

## Why This Baseline Exists

This baseline marks the transition from implementation-heavy guest invitation changes to a stable governance starting point.  
It captures the current database structure, key semantics, and lifecycle classification for function cleanup.

## Authoritative Docs

- `docs/01_authority/00_AUTHORITATIVE_INDEX.md`
- `docs/baseline/DB_SEMANTICS_BASELINE.md`
- `docs/baseline/LEGACY_AND_RETIRED_ITEMS.md`
- `docs/baseline/schema_baseline.sql`

## Coverage

This baseline covers:

1. `public` schema structural snapshot
2. Guest invitation current-match response semantics
3. Function lifecycle classification:
   - ACTIVE
   - LEGACY
   - RETIRED
   - DROP CANDIDATE
4. Cleanup strategy boundary for next migration batches

## Out Of Scope

This baseline does not:

- Rewrite historical migrations
- Squash migration history
- Perform bulk legacy drops without dependency gates
- Replace runtime validation evidence with static assumptions

## Effective Use Rules

1. New database changes must be additive migrations relative to this baseline.
2. Semantics changes must update baseline docs in the same delivery cycle.
3. Function retirement requires evidence gates (static refs + DB dependencies + runtime confidence).
4. Pre-baseline migrations are archived under `supabase/migrations_archive/pre_baseline_20260328/`.
5. Do not edit archived migration content; preserve it as historical ledger.
6. Future reset execution line is fixed as:
   - apply baseline SQL set first
   - then apply baseline-after append-only migrations
