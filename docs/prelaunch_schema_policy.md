# PlayerHoods Prelaunch Schema Policy

## Principle

Before launch, prioritize stability over schema cleanliness.

Do:
- audit active references
- migrate active business usage to canonical paths
- document deprecated objects
- keep migrations append-only
- run build/tests after changes

Do not:
- drop tables
- drop columns
- drop RPCs
- rewrite historical migrations
- manually edit generated database types
- rename production-facing schema objects without a migration plan

## Legacy Cleanup Timing

Legacy cleanup should happen after launch stability, with:
1. backup
2. staging verification
3. active usage audit showing zero usage
4. rollback plan
5. append-only cleanup migration

## Generated Types

Do not manually edit generated Supabase database types.
If schema changes are made, regenerate types through the proper project command.

## Audit Standard

Codebase-level audit does not equal live database introspection.

When evaluating a legacy object:
- `src/` runtime code, server actions, services, hooks, RPC wrappers, and Edge Functions carry the most weight
- generated types alone do not imply runtime usage
- historical migrations alone do not imply runtime usage
- baseline snapshots, fixtures, and old docs should be preserved unless a later cleanup plan explicitly removes them

## Launch Safety Rule

Before launch, clean up active call paths, not historical compatibility objects.

## Naming Guardrail

For registered-user discovery, prefer:
- Exact Email / Phone Search
- Email / Phone Search

Avoid introducing new product-facing registered-user discovery names that overlap with Contact Player terminology.

Reason:
- Contact Player is an existing separate system.
- Registered-user discovery naming should stay distinct from Contact Player.
