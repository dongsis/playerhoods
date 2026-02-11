#!/bin/bash
# =============================================================
# 🔄 sync_db_state.sh — 自动导出 Supabase 数据库状态到 docs/
# =============================================================
# 用法：
#   chmod +x scripts/sync_db_state.sh
#   ./scripts/sync_db_state.sh
#
# 前提：已安装 supabase CLI 并 link 到项目
# =============================================================

set -e

OUTPUT_DIR="docs/db"
mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo "🔄 Exporting database state..."

# 1. 导出完整 schema
supabase db dump --schema public > "$OUTPUT_DIR/schema.sql" 2>/dev/null
echo "✅ Schema exported"

# 2. 运行查询脚本并生成 markdown
cat > /tmp/_export_query.sql << 'QUERY_EOF'
-- Tables & Columns
SELECT json_agg(row_to_json(t)) FROM (
  SELECT
    c.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default
  FROM information_schema.columns c
  JOIN information_schema.tables tb
    ON c.table_name = tb.table_name AND c.table_schema = tb.table_schema
  WHERE c.table_schema = 'public' AND tb.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position
) t;
QUERY_EOF

supabase db execute -f /tmp/_export_query.sql > "$OUTPUT_DIR/tables.json" 2>/dev/null || true
echo "✅ Tables exported"

# 3. RLS Policies
cat > /tmp/_rls_query.sql << 'RLS_EOF'
SELECT json_agg(row_to_json(p)) FROM (
  SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname = 'public'
  ORDER BY tablename, policyname
) p;
RLS_EOF

supabase db execute -f /tmp/_rls_query.sql > "$OUTPUT_DIR/rls_policies.json" 2>/dev/null || true
echo "✅ RLS policies exported"

# 4. 生成 Markdown 汇总
cat > "$OUTPUT_DIR/DB_STATE.md" << MD_EOF
# Database State — playerhoods.com
> Auto-generated: $TIMESTAMP
> Run \`./scripts/sync_db_state.sh\` to refresh

## Quick Reference
- Full schema: [schema.sql](./schema.sql)
- Table details: [tables.json](./tables.json)
- RLS policies: [rls_policies.json](./rls_policies.json)

## How to Use with Claude Code
Paste this in your prompt or reference this file:
\`\`\`
Context: See docs/db/DB_STATE.md and docs/db/schema.sql for current database state.
\`\`\`
MD_EOF

echo ""
echo "✅ Done! Database state exported to $OUTPUT_DIR/"
echo "   - schema.sql       (full DDL)"
echo "   - tables.json      (table/column info)"
echo "   - rls_policies.json (RLS policies)"
echo "   - DB_STATE.md      (summary)"
echo ""
echo "💡 Tip: Commit these files so Claude Code can always read them."
