# Commands to Run (copy/paste)

## Local-only (read-only) — 已执行
```
supabase status --output json

docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select to_regclass('public.sports') as sports, to_regclass('public.user_sports') as user_sports, to_regclass('public.guest_sports') as guest_sports;"

docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('rpc_sports_list','rpc_user_sports_set','rpc_guest_sports_set','rpc_match_delegate_confirm_targets') order by proname;"

docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('sports','user_sports','guest_sports') order by relname;"

docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select count(*) from supabase_migrations.schema_migrations;"
```

## Remote (read-only) — requires project link / DB URL
**Option A: via CLI link**
```
supabase link --project-ref <your_project_ref>
```
Then (read-only check via direct SQL against remote DB URL):
```
# If you can provide the remote DB URL:
psql "<REMOTE_DB_URL>" -c "select to_regclass('public.sports') as sports, to_regclass('public.user_sports') as user_sports, to_regclass('public.guest_sports') as guest_sports;"
psql "<REMOTE_DB_URL>" -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('rpc_sports_list','rpc_user_sports_set','rpc_guest_sports_set','rpc_match_delegate_confirm_targets') order by proname;"
psql "<REMOTE_DB_URL>" -c "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('sports','user_sports','guest_sports') order by relname;"
```

## Remote apply (ONLY after you say “apply”)
```
# Example (do not run until confirmed):
# supabase db push
```

## Dump refresh (only after deciding source)
```
# Local dump (if local is source of truth)
# supabase db dump --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --schema public --file db_dump_local.sql

# Remote dump (if remote is source of truth)
# supabase db dump --db-url "<REMOTE_DB_URL>" --schema public --file db_dump_remote.sql
```
