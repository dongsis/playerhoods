# DB State Report (sports + RPC)

## A) Dump 证据（db_dump_public.sql）
- **结论**：dump 明显滞后（或来自另一套 DB）。
- **证据**（对 dump 的原始字节搜索）：
  - 未找到 `public.sports` / `public.user_sports` / `public.guest_sports`
  - 未找到 `rpc_sports_list` / `rpc_user_sports_set` / `rpc_guest_sports_set` / `rpc_match_delegate_confirm_targets`
  - 未找到 `schema_migrations`

> 说明：我对 `db_dump_public.sql` 做了二进制字符串搜索（UTF-16/UTF-8 不敏感），以上关键字均未出现。

## B) Local 真实 DB 事实清单（127.0.0.1:54322）
**表**（public）：
- sports ✅（RLS: **false**）
- user_sports ✅（RLS: **true**）
- guest_sports ✅（RLS: **true**）

**函数**（public）：
- rpc_sports_list ✅
- rpc_user_sports_set ✅
- rpc_guest_sports_set ✅
- rpc_match_delegate_confirm_targets ❌（未找到）

**迁移追踪表**：
- supabase_migrations.schema_migrations ✅ 存在
- 但未发现版本 `20260225221901` / `20260225221953` 的记录

## C) Remote 真实 DB 事实清单
- **无法读取**：当前 CLI 未 link remote（缺少 `.supabase/config.json`），我无法用只读方式连接远端数据库。

## D) 迁移应用矩阵（sports 相关）
| 环境 | 20260225221901_v1_6_3_sports_core | 20260225221953_sports_prefs_rpc |
|---|---|---|
| local | **是**（对象存在） | **部分**（3 个 RPC 存在，但缺 `rpc_match_delegate_confirm_targets`） |
| remote | **未知**（未连接） | **未知**（未连接） |

## E) 结论 & 最短修复路径（当前可执行）
**唯一推荐路径**：先把 **remote 读出来对齐事实** → 再决定是否 apply。原因：现在的 dump 与 local 事实冲突，remote 真实状态未知。

**具体最短路径：**
1) 先用 **只读** 方式连 remote，拿同样的“对象清单”。
2) 如果 remote 缺：
   - 先在 local 验证 migrations 完整性（补齐缺失 RPC）
   - 再由你确认后 **apply remote**
   - 重新生成 remote dump

**为什么前端能调用这些 RPC，但 dump 里缺失？**
- dump **不是**从当前 local DB 生成（local 有 sports + RPC，但 dump 没有）
- 或 dump 来自 **另一套 DB/过旧 snapshot**
- 或 migrations 没跑，但前端是连到另一个环境

---

### 关键一句话结论（精简版）
`db_dump_public.sql` 明显滞后：dump 中完全没有 sports/guest_sports/user_sports 和 4 个 RPC（甚至没有 schema_migrations），而 local 实际 DB 已存在这些表和 3 个 RPC ⇒ dump 来源不对或过旧。remote 状态未知，需要只读核对后再决定补跑/补 dump。
