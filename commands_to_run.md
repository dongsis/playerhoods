# Commands to Run (copy‑paste)

## Local‑only (read‑only)
```powershell
# Local DB URL
supabase status --output json

# Tables exist?
docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select to_regclass('public.sports') as sports, to_regclass('public.user_sports') as user_sports, to_regclass('public.guest_sports') as guest_sports;"

# Functions exist?
docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('rpc_sports_list','rpc_user_sports_set','rpc_guest_sports_set','rpc_match_delegate_confirm_targets') order by proname;"

# RLS flags
 docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('sports','user_sports','guest_sports') order by relname;"

# Migration tracking rows
 docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select count(*) from supabase_migrations.schema_migrations;"
 docker exec -i supabase_db_playerhoods psql -U postgres -d postgres -c "select version, name from supabase_migrations.schema_migrations where name like '%sports%' or name like '%v1_6_3%' order by version;"
```

## Local‑only (regenerate dump)
```powershell
# Generate a fresh local dump from the running local DB
# (writes into repo root)
docker exec -i supabase_db_playerhoods pg_dump -U postgres -d postgres --schema=public > db_dump_local.sql
```

## Remote‑readonly (requires link or DB URL)
```powershell
# If not linked yet:
# supabase link --project-ref <YOUR_PROJECT_REF>

# Option A: If you have remote DB URL
# supabase db dump --db-url <REMOTE_DB_URL> --schema public --file db_dump_remote.sql

# Option B: If linked and CLI supports it in your env
# supabase db dump --linked --schema public --file db_dump_remote.sql
```

## Remote‑apply (requires your explicit confirmation)
```powershell
# Push migrations to remote
# supabase db push

# OR apply specific migrations (if using migration up flow)
# supabase migration up
```
