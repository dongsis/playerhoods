Strict migration review (PlayerHoods).

Only analyze the attached file.
Do NOT search the workspace.
Do NOT read other files.
Do NOT rely on previous conversations.

Hard constraints:
- Filename must use 14-digit prefix YYYYMMDDHHMMSS_*.sql
- No "ADD CONSTRAINT IF NOT EXISTS"
- No "CREATE POLICY IF NOT EXISTS"
- Use DO $$ guards for constraints/policies
- Migration file must contain SQL only (no Markdown)
- SECURITY DEFINER functions must set explicit search_path

Checklist:
1) File naming: 14-digit prefix, no date_time underscore split, no duplicate version risk
2) Idempotency: safe re-run; guarded creates/alters; DO $$ for constraints/policies
3) RLS: RLS enabled where needed; policies present for intended read/update paths; note any missing policies
4) Function safety: cross-table helper recursion risk; plpgsql vs sql; search_path set; SECURITY DEFINER justified
5) Trigger safety: DROP IF EXISTS before CREATE; minimal WHEN clause; no recursion/side effects
6) Constraint integrity: CHECK/FK correctness; unique names; no collision with existing constraints
7) Forbidden patterns scan: report exact hits (with line context)
8) Production risk notes: data backfill needs; locking risk; compatibility risk

Output format:
- Top-line verdict: Compliant / Partially compliant / Non-compliant
- Findings by checklist section (bullets)
- Required fixes (exact edits) vs Optional improvements