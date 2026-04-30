# Migration Rebase Cutover Plan

## Source Freeze

- Branch: `v2.0`
- Commit: `03522d7`
- Freeze intent: baseline generation window only, no DB semantic drift

## Phase A - Inventory

1. Generate `DB_OBJECT_INVENTORY.md`.
2. Confirm `MIGRATION_STATUS_INDEX.md`.
3. Finalize inclusion/exclusion list for baseline object set.

## Phase B - Generate Baseline SQL Set

1. `supabase/baseline/BASELINE_SCHEMA.sql`
2. `supabase/baseline/BASELINE_SECURITY.sql`
3. `supabase/baseline/BASELINE_REQUIRED_SEED.sql`

Generation note:

- `BASELINE_SCHEMA.sql` comes from frozen source dump.
- Security and required seed are explicit baseline layers.

## Phase C - Validate

1. Local empty-db run:
   - schema layer
   - security layer
   - required seed layer
2. Functional checks:
   - invitation get
   - guest accept
   - guest decline
   - anchor fallback/fail-fast
3. Security checks:
   - RLS enabled tables
   - active RPC grants/revokes
4. Staging run and evidence capture.

## Phase D - Archive And Activate

1. Archive pre-baseline migrations to:
   - `supabase/migrations_archive/pre_baseline_20260328/`
2. Define active execution line:
   - baseline SQL set (`BASELINE_SCHEMA.sql` + `BASELINE_SECURITY.sql` + `BASELINE_REQUIRED_SEED.sql`)
   - post-baseline append-only migrations in `supabase/migrations/` only
3. Update docs and runbook so future reset follows:
   - baseline SQL set first
   - then baseline-after migration chain

## Rollback Rule

- Any failed gate blocks cutover.
- Rollback uses the same authoritative sources: baseline SQL set + append-only migrations.
- Do not delete historical migration files during cutover window.
