[Claude Execution Contract — REQUIRED OUTPUT FORMAT]
This document defines the mandatory output format and execution constraints
for Claude Code when performing ANY database, migration, or RLS-related task
in the playerhoods.com repository.

Failure to comply with this contract invalidates the output.
For ANY task that involves:
- SQL
- Supabase migrations
- RLS policies
- Database schema or governance changes

Your response MUST include the following sections, in order:

---

## 1) File(s)
- Exact file path(s)
- Whether new or modified
Example:
- supabase/migrations/015_fix_group_members_rls_recursion.sql (new)

---

## 2) SQL Content
- Full SQL, exactly as it should appear in the file
- No omissions, no ellipses

---

## 3) Apply Command (Supabase CLI)
- Exact command(s) to apply the change
Example:
- supabase db reset
- supabase db push
- or psql command if applicable

---

## 4) Verification SQL
- Explicit SQL queries to verify correctness
- Include expected outcomes for each query
Example:
- “Should return N rows”
- “Should NOT throw recursion error”

---

## 5) Rollback Strategy
- If rollback is NOT intended, explicitly say:
  “No rollback. Append-only by design.”
- If rollback is possible, describe:
  - What to revert
  - What data risk exists

---

## Constraints (must always restate and obey)
- Do NOT modify existing migrations.
- Do NOT relax RLS via additive permissive policies.
- Tightening must be via policy replacement only.
- Do NOT change frozen contracts or enums unless explicitly instructed.

Failure to follow this format is considered an invalid response.

[End of Claude Execution Contract]
