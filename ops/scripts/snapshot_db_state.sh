#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# snapshot_db_state.sh — playerhoods.com
#
# Purpose:
#   Export a "text truth" snapshot of the current Supabase Postgres state
#   (schema + RLS + functions + applied migrations) for sharing with AI tools
#   (ChatGPT / Claude Code) WITHOUT leaking secrets.
#
# Usage:
#   1) Set DATABASE_URL in your shell (DO NOT commit it):
#        export DATABASE_URL="postgresql://postgres:...@...:5432/postgres"
#   2) Run:
#        bash ops/scripts/snapshot_db_state.sh
#
# Output:
#   ops/db_state/
#     - schema.sql
#     - rls_tables.tsv
#     - rls_policies.tsv
#     - functions.tsv
#     - migrations_applied.tsv
#
# Notes:
#   - Never share DATABASE_URL, service_role keys, or JWT secrets.
#   - It is safe to share files under ops/db_state/ (review if you customized).
# -----------------------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/ops/db_state"

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found. Install PostgreSQL client tools."; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not found. Install PostgreSQL client tools."; exit 1; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Example:"
  echo '  export DATABASE_URL="postgresql://postgres:...@...:5432/postgres"'
  exit 1
fi

mkdir -p "${OUT_DIR}"

echo "==> Writing snapshot to: ${OUT_DIR}"
echo "==> (DATABASE_URL is NOT written anywhere)"

# 1) Schema (public)
echo "==> Exporting schema.sql (public schema, schema-only, no owner/privileges)..."
pg_dump "${DATABASE_URL}"   --schema=public   --schema-only   --no-owner --no-privileges   > "${OUT_DIR}/schema.sql"

# 2) RLS tables (enabled/forced)
echo "==> Exporting rls_tables.tsv ..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "
select
  n.nspname as schema,
  c.relname as table,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by c.relname;
" > "${OUT_DIR}/rls_tables.tsv"

# 3) RLS policies
echo "==> Exporting rls_policies.tsv ..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "
select
  schemaname, tablename, policyname, permissive, roles, cmd,
  coalesce(qual,'') as using_expr,
  coalesce(with_check,'') as check_expr
from pg_policies
where schemaname='public'
order by tablename, policyname;
" > "${OUT_DIR}/rls_policies.tsv"

# 4) Functions / RPCs (public)
echo "==> Exporting functions.tsv (pg_get_functiondef)..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "
select
  p.oid::regprocedure as signature,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
order by 1;
" > "${OUT_DIR}/functions.tsv"

# 5) Applied migrations (Supabase)
echo "==> Exporting migrations_applied.tsv ..."
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "
select version, name, statements, inserted_at
from supabase_migrations.schema_migrations
order by inserted_at;
" > "${OUT_DIR}/migrations_applied.tsv"

# Optional quick redaction scan (best effort)
echo "==> Quick scan for obvious secrets in outputs (best effort)..."
if grep -RIn --exclude-dir=.git --exclude="*.md" -E "(service_role|anon_key|jwt|secret|apikey|api_key)" "${OUT_DIR}" >/dev/null 2>&1; then
  echo "WARNING: Found strings that LOOK like secrets in db_state outputs."
  echo "Please review the matched lines:"
  grep -RIn --exclude-dir=.git --exclude="*.md" -E "(service_role|anon_key|jwt|secret|apikey|api_key)" "${OUT_DIR}" || true
  echo "If they are real secrets, redact them BEFORE sharing."
else
  echo "OK: No obvious secret-like strings found."
fi

echo "==> Done."
echo "You can now zip and share ops/db_state/ with AI tools:"
echo "  (from repo root) zip -r db_state_snapshot.zip ops/db_state"
