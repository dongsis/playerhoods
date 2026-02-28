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
**Status:** No Supabase remote link/config found in repo. Remote object state is **unknown**.
- Need project ref or remote DB URL to run read‑only checks.

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
| **remote**     | **UNKNOWN (not linked)** | **UNKNOWN (not linked)** |

---

## E) Conclusion & shortest fix path (current evidence)
**Most likely cause:**
- Your **dump file(s) were generated from an older schema** or a different DB target, **not** from the running local DB that already has sports tables + RPCs.
- Migration tracking table is **not reflecting** v1.6.3 sports migrations (only 4 rows), so even when objects exist, tracking is missing.

**Recommended path (given current evidence):**
1) **Regenerate a local dump from the actual local DB** and re-check sports + RPCs (fixes stale dump problem).
2) **Confirm remote state** (read‑only) by linking or providing remote DB URL.
3) Then choose:
   - If **local has / remote doesn’t** → **apply migrations to remote** (after your explicit confirmation) + regenerate remote dump.
   - If **remote has / local doesn’t** → **reset/push local** to latest migrations + regenerate local dump.
   - If **neither has** → **apply locally first → verify → then push to remote** (after confirmation).

---

## Evidence (local queries run)
- `docker exec -i supabase_db_playerhoods psql ... to_regclass('public.sports'...)` → all three exist
- `docker exec -i supabase_db_playerhoods psql ... proname in (rpc_*...)` → 3 sports RPCs exist, delegate_confirm_targets missing
- `docker exec -i supabase_db_playerhoods psql ... relrowsecurity` → sports RLS off, user_sports/guest_sports on
- `docker exec -i supabase_db_playerhoods psql ... schema_migrations` → 4 rows only
