# playerhoods-database-skill (v1.4)

## What this skill does
When enabled, the assistant will:
- Treat **playerhoods.com** naming as fixed and authoritative.
- Use the DB schema + governance docs as binding constraints.
- Prefer **RPC-only** (SECURITY DEFINER) writes for sensitive entities.
- Preserve execution-state history rules (restart doctrine) as specified in v1.4.
- Generate migrations that are safe, reviewable, and invariant-preserving.

## Folder contents
- `schema/` — schema summary and table notes derived from `schema_public.sql`
- `governance/` — governance rules + invariants (v1.4)
- `workflows/` — repeatable checklists (migration / RPC / RLS review)

## Operating rules (must-follow)
1. **No inventing tables/columns.** If a field isn’t present in schema, propose a migration.
2. **No bypassing invariants.** If docs and schema disagree, flag as conflict and propose reconciliation.
3. **Security model:** For sensitive writes, generate **SECURITY DEFINER RPCs** and lock down direct DML via RLS/privileges.
4. **Restart/removed semantics:** Do not erase meaning; follow v1.4 execution-state doctrine.
5. **Explicit authority checks:** Every RPC must guard with `auth.uid()` + role checks (boundary keeper / organizer / club admin / super admin).

