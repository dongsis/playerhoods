# Review workflows

## Migration review checklist
- Additive by default (no drop/rename without plan)
- Deterministic defaults/backfills
- Indexes/uniques added where required
- RLS enabled on new tables
- Privileges explicitly set/revoked to match RPC-only posture
- No invariant regressions (identity uniqueness, execution-state semantics)

## RPC review checklist
- SECURITY DEFINER for privileged writes
- SET search_path = public
- auth.uid() non-null guard
- Authority checks (role / membership / organizer / club admin / super admin)
- Input validation (ids exist, scope correctness)
- Writes are minimal and auditable

## RLS / policy review checklist
- RLS enabled
- Least-privilege policies
- Avoid permissive write policies
- For RPC-only tables: block direct DML via policies + privileges
