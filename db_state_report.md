# DB State Report — sports/user_sports/guest_sports + RPCs

## A) Dump identification & evidence
**Dump files present:**
- `db_dump_public.sql`
- `db_dump_local.sql`

**Evidence from `db_dump_public.sql`:**
- Contains baseline tables (e.g. `CREATE TABLE IF NOT EXISTS "public"."clubs"` at line ~687), so the dump is valid.
- **No matches** for:
  - `CREATE TABLE IF NOT EXISTS "public"."sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."user_sports"`
  - `CREATE TABLE IF NOT EXISTS "public"."guest_sports"`
  - `FUNCTION public.rpc_sports_list`
  - `FUNCTION public.rpc_user_sports_set`
  - `FUNCTION public.rpc_guest_sports_set`
  - `FUNCTION public.rpc_match_delegate_confirm_targets`
  - `schema_migrations`

**One‑line 판단（含证据摘要）：**
`db_dump_public.sql` 很可能滞后/来自旧库：文件里有 clubs（~line 687），但 **完全不存在 sports/user_sports/guest_sports 及 4 个 RPC 的定义**（Select‑String 无匹配）。

> `db_dump_local.sql` 同样未找到上述 sports/RPC/ schema_migrations 的文字痕迹。

---

## B) Local Supabase 实际 schema（直连 DB 查询）
**Local DB URL:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

### Tables
```
sports:       exists
user_sports:  exists
guest_sports: exists
```

### Functions
```
rpc_sports_list:             exists
rpc_user_sports_set:         exists
rpc_guest_sports_set:        exists
rpc_match_delegate_confirm_targets: MISSING
```

### RLS (relrowsecurity)
```
sports:       false
user_sports:  true
guest_sports: true
```

### Migration tracking
`supabase_migrations.schema_migrations` has **4 rows only**, and none with names matching the sports migrations.
So **tracking is incomplete** and cannot be used alone to infer recent migration application.

---

## C) Remote Supabase 实际 schema（只读）
**当前无法确认**：repo 内未找到 project ref / remote DB URL / link 状态。需要你提供或执行 `supabase link --project-ref <ref>` 后才能查询。

---

## D) Migration 应用矩阵（基于对象存在性）
Target migrations:
- `20260225221901_v1_6_3_sports_core.sql.sql` (sports table)
- `20260225221953_sports_prefs_rpc.sql.sql` (user_sports/guest_sports + RPCs)

| Environment | sports_core | sports_prefs_rpc |
|---|---|---|
| **local** | ✅ applied (sports table exists) | ✅ applied (user_sports/guest_sports + 3 RPCs exist) |
| **remote** | ❓ unknown | ❓ unknown |

> Note: `rpc_match_delegate_confirm_targets` is missing in local; it likely belongs to a different migration (not these two).

---

## E) 结论 & 最短修复路径（取决于 remote）
### 当前最有力结论
- **本地 DB 已包含 sports/user_sports/guest_sports + 3 个 RPC**，而 `db_dump_public.sql`/`db_dump_local.sql` 中完全缺失它们。
- **最可能原因**：dump 是从旧数据库生成的（或 dump 命令指向了另一套 DB），而不是从当前 local 生成。

### 需要 remote 后才能定案的三种路径
1) **local 有、remote 没有** → **建议**：补跑 remote migrations（需你确认后执行），再重新生成 remote dump。
2) **remote 有、local 没有** → **建议**：本地 `supabase db reset` 或 `supabase db push`，再生成 local dump。
3) **两边都没有** → **建议**：先本地跑到最新 → 验证 → 再推 remote（需你确认）。

---

## F) Summary (next required action)
需要你提供 **remote project ref / DB URL** 或允许我执行 `supabase link`，才能完成 remote 只读核对并给出唯一推荐路径。
