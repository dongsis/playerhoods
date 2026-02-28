# DB State Report (sports + prefs + RPC focus)

## A) Dump identity & evidence (db_dump_public.sql)
**Finding:** `db_dump_public.sql` is **stale / missing v1.6.3 sports objects**.
- Evidence: **no matches** for
  - `CREATE TABLE IF NOT EXISTS "public"."sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."user_sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."guest_sports"`
  - `FUNCTION public.rpc_sports_list`
  - `FUNCTION public.rpc_user_sports_set`
  - `FUNCTION public.rpc_guest_sports_set`
  - `FUNCTION public.rpc_match_delegate_confirm_targets`
  - `schema_migrations` (no insert/entries in dump)
- Dump **does** include other tables (e.g. `clubs`):
  - `db_dump_public.sql:687` → `CREATE TABLE IF NOT EXISTS "public"."clubs" (...)`

**Conclusion:** `db_dump_public.sql` (and `db_dump_local.sql`, same search) are missing the sports tables + 3 sports RPCs, so the dump is **behind** the actual local DB schema.

---

## B) Local DB (real query, not dump)
**Local DB URL (from `supabase status --output json`):**
- `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

**Tables exist (local):**
- `public.sports` ✅
- `public.user_sports` ✅
- `public.guest_sports` ✅

**Functions exist (local):**
- `rpc_sports_list` ✅
- `rpc_user_sports_set` ✅
- `rpc_guest_sports_set` ✅
- `rpc_match_delegate_confirm_targets` ❌ (missing)
  - Note: **`rpc_match_delegate_manual_confirm_targets` exists** instead.

**RLS flags (local):**
- `sports`: **RLS OFF**
- `user_sports`: **RLS ON**
- `guest_sports`: **RLS ON**

---

## C) Remote DB (read‑only)
**Status:** Linked to project `mtkwqzzrejenaqujjfge` and dumped `db_dump_remote.sql`.
**Remote dump evidence:**
- No matches for:
  - `CREATE TABLE IF NOT EXISTS "public"."sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."user_sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."guest_sports"`
  - `FUNCTION public.rpc_sports_list`
  - `FUNCTION public.rpc_user_sports_set`
  - `FUNCTION public.rpc_guest_sports_set`
  - `FUNCTION public.rpc_match_delegate_confirm_targets`
  - `schema_migrations`
- Remote dump **does** include other tables (e.g. `clubs`):
  - `db_dump_remote.sql:687` → `CREATE TABLE IF NOT EXISTS "public"."clubs" (...)`

**Conclusion:** Remote schema appears to be **missing v1.6.3 sports objects** (or dump source is older).

---

## D) Migration application matrix (v1.6.3 sports)
Migrations of interest:
- `20260225221901_v1_6_3_sports_core.sql.sql`
- `20260225221953_sports_prefs_rpc.sql.sql`

**Local evidence:**
- Objects **exist** (sports + user_sports + guest_sports + 3 sports RPCs)
- `supabase_migrations.schema_migrations` has only **4 rows**, **none** for v1.6.3 sports files

### 2x2 Matrix
|                | sports_core | sports_prefs_rpc |
|----------------|-------------|------------------|
| **local**      | **YES (objects exist)** / **NO tracking** | **YES (objects exist)** / **NO tracking** |
| **remote**     | **NO (dump missing objects)** | **NO (dump missing objects)** |

---

## E) Conclusion & shortest fix path (current evidence)
**Most likely cause:**
- Your **dump file(s) were generated from an older schema** or a different DB target, **not** from the running local DB that already has sports tables + RPCs.
- Migration tracking table is **not reflecting** v1.6.3 sports migrations (only 4 rows), so even when objects exist, tracking is missing.

**Recommended path (given current evidence):**
1) **Remote is missing v1.6.3 sports objects** (from remote dump). Local has them.
2) Therefore this matches **“local has / remote doesn’t”** → **apply migrations to remote** (after your explicit confirmation), then regenerate remote dump.
3) Optional but recommended: **regenerate local dump** from current local DB to avoid stale artifacts.

---

## Evidence (local queries run)
- `docker exec -i supabase_db_playerhoods psql ... to_regclass('public.sports'...)` → all three exist
- `docker exec -i supabase_db_playerhoods psql ... proname in (rpc_*...)` → 3 sports RPCs exist, delegate_confirm_targets missing
- `docker exec -i supabase_db_playerhoods psql ... relrowsecurity` → sports RLS off, user_sports/guest_sports on
- `docker exec -i supabase_db_playerhoods psql ... schema_migrations` → 4 rows only
