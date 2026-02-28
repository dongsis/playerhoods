# Commands To Run

> 约定：**remote-apply 需要你明确说“apply”才会执行**。

## Local-only（只读）
```bash
# 查 sports 表 + RLS
docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('sports','user_sports','guest_sports');"

# 查 sports RPC 是否存在
docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select n.nspname as schema, p.proname as function, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rpc_sports_list','rpc_user_sports_set','rpc_guest_sports_set','rpc_match_delegate_confirm_targets');"

# 查迁移追踪表是否有 sports 版本
docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select version, name from supabase_migrations.schema_migrations where version in ('20260225221901','20260225221953');"
```

## Remote-readonly（只读）
```bash
# 先 link（只读核查不会写远端）
supabase link --project-ref <your-project-ref>

# 读取 remote schema（等你确认 ref 后我帮你填完整命令）
# 然后用 supabase db pull / db dump / 或通过远端连接执行只读查询
```

## Remote-apply（需要你明确“apply”）
```bash
# 例：推送 migrations 到 remote
supabase db push

# 生成 remote dump（示例）
# supabase db dump --schema public --file db_dump_remote.sql
```
