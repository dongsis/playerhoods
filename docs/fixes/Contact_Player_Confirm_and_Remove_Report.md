# Contact Player: 一登录就 Confirmed + 无法 Remove — 修改方案报告

**日期:** 2026-03-10  
**问题:** 邀请 contact 后，其一登录就成为 confirmed；且 organizer 无法在页面上 remove 该 participant（有 activity，仍留在 confirmed 里）。

---

## 一、根因分析

### 1. 一登录就成为 confirmed

**可能路径 A：Email Invitation 流程**

若 organizer 通过 **InviteByEmailForm**（输入 email 邀请）邀请 contact：

1. `rpc_email_invitation_create` 创建 `email_invitations` 记录
2. Contact 点击邮件中的 magic link 登录并接受
3. `rpc_email_invitation_accept` 调用 `rpc_match_accept_email_invitation`
4. `rpc_match_accept_email_invitation` **新建一条 user participant 行**，并设置：
   - `participant_accepted_at = now()`
   - `participant_accepted_via = 'email_invitation'`
   - `org_approved_at = now()`
   - `org_approved_by = inviter_user_id`

因此该 participant 在创建时即满足 `confirmed ⇔ participant_accepted_at AND org_approved_at`，**一接受就变成 confirmed**。

**可能路径 B：AddGuestForm / InviteGuestForm + 重复行**

若 organizer 通过 **AddGuestForm** 或 **InviteGuestForm**（nominate guest）邀请 contact：

1. `rpc_match_nominate_guest` 创建 **guest participant**（`guest_id`，`org_approved_at` 已设，`participant_accepted_at` 为 NULL）
2. 发送 `match.guest_nominated` 邮件
3. 若该邮件中的链接导向 **email invitation 接受流程**（例如同一 email 之前有 invitation），contact 接受时仍会走 `rpc_match_accept_email_invitation`
4. 此时会再创建一条 **user participant**（`user_id`），两条行并存

**结论：** 无论哪种路径，只要 contact 通过 email invitation 接受，就会产生一条立即 confirmed 的 user participant；若之前已有 guest participant，则会出现 **同一人两条 participant 行**（guest + user）。

---

### 2. 无法 Remove

**可能原因 1：重复行导致“删了还在”**

- 同一人存在 guest 行 + user 行
- Organizer 点击 Remove 时，可能只删掉其中一行（例如 user 行）
- 另一行（guest 行）仍在，且若该行也被 reconcile 成 confirmed，则页面上仍会显示在 confirmed 中

**可能原因 2：RLS / 权限**

- `rpc_match_remove_participant` 为 `SECURITY DEFINER`，理论上不受 RLS 限制
- 需再确认：organizer 对 guest participant 的 SELECT/UPDATE 是否被其他 policy 影响

**可能原因 3：`is_user_match_associated` 与 identity-linked guest**

- `rpc_match_remove_participant` 的权限检查为：`is_match_organizer` 或 `(is_match_participant_confirmed AND can_participants_manage_participants)`
- Organizer 应满足 `is_match_organizer`，理论上可 remove 任意 participant
- 若实际调用失败，需检查是否有其他校验或错误被吞掉

---

## 二、修改方案

### 方案 1：`rpc_match_accept_email_invitation` 避免重复创建 user participant（推荐）

**目标：** 当 match 中已存在同 email 的 guest participant 时，不再新建 user participant，而是更新该 guest 的 `participant_accepted_at`。

**步骤：**

1. 在 `rpc_match_accept_email_invitation` 中，在 `INSERT` 前增加检查：
   - 查询 `match_participants mp JOIN guests g ON g.id = mp.guest_id`
   - 条件：`mp.match_id = p_match_id`、`lower(trim(g.email)) = lower(trim(v_user_email))`、`mp.removed_at IS NULL`
2. 若找到 guest participant：
   - `UPDATE match_participants SET participant_accepted_at = now(), participant_accepted_via = 'email_invitation' WHERE id = mp.id`
   - `PERFORM match_participant_reconcile_status(mp.id)`
   - 插入 `match_participant_actions`（如 `action_type = 'accept'`）
   - 调用 `rpc_reconcile_identity_after_magic_link` 建立 identity_links
   - `RETURN` 该行，**不创建** user participant
3. 若未找到 guest participant，保持现有逻辑：创建 user participant。

**影响：** 消除 guest + user 重复行，contact 仅保留一条 participant 行，且需通过 delegate_confirm 或 accept 才会变成 confirmed。

---

### 方案 2：Email Invitation 接受时不再自动设置 `org_approved_at`

**目标：** 即使创建 user participant，也不在创建时设为 confirmed。

**步骤：**

1. 在 `rpc_match_accept_email_invitation` 的 `INSERT` 中：
   - `org_approved_at` 改为 `NULL`（或由 inviter 后续 approve）
   - `participant_accepted_at = now()` 保留
2. 这样 participant 创建时为 pending，需 organizer approve 后才 confirmed。

**影响：** 行为更符合「participant 接受 + organizer 批准」的两阶段流程，但会改变现有 email invitation 的语义（接受后不再立即 confirmed）。

---

### 方案 3：Remove 失败时的显式错误与日志

**目标：** 若 remove 实际失败，便于定位问题。

**步骤：**

1. 在 `removeParticipant`（`src/lib/api/matches.ts`）中，对 `supabase.rpc` 的 `error` 做明确处理：
   - 若 `error` 存在，`throw error` 或包装成可读错误
   - 确保 server action 和 client 都能收到并展示错误信息
2. 在 `ParticipantGroups.tsx` 的 Remove 按钮 `onClick` 中，确保 `catch` 到的错误能显示给用户（例如 `setError`）。
3. 可选：在 `rpc_match_remove_participant` 中增加更明确的错误信息（如 `participant_not_found`、`not_authorized`）。

---

### 方案 4：同一人多条 participant 的合并与去重

**目标：** 若已存在 guest + user 重复行，在展示和操作时做合并与去重。

**步骤：**

1. 在 `getMatchDetailData` 或前端展示逻辑中：
   - 按「同一人」合并 participant（例如通过 `identity_links` 或 `guest.email = user.email`）
   - 展示时只显示一条「代表行」
2. Remove 时：
   - 若存在 guest 行和 user 行，应同时 remove 两条（或先 remove 一条，再根据业务规则决定是否 remove 另一条）
3. 可选 migration：对历史重复数据做清理，只保留一条 canonical 行。

**影响：** 需要更复杂的合并逻辑和可能的 migration，适合作为后续优化。

---

## 三、推荐实施顺序

| 优先级 | 方案 | 说明 |
|--------|------|------|
| P0 | 方案 1 | 从源头避免 guest + user 重复，并统一 contact 的确认流程 |
| P1 | 方案 3 | 确保 remove 失败时能暴露错误，便于排查 |
| P2 | 方案 2 | 若希望 email invitation 接受后仍为 pending，可再考虑 |
| P3 | 方案 4 | 对已有重复数据做合并与清理 |

---

## 四、需进一步确认的点

1. **实际邀请路径：** 用户是通过 InviteByEmailForm、AddGuestForm 还是 InviteGuestForm 邀请 contact？
2. **Remove 行为：** 点击 Remove 后是否有错误提示？Network 中 RPC 是否返回错误？
3. **Participant 行数：** 对问题 match，在 DB 中查询该 contact 的 `match_participants` 行数（按 `guest_id` 或 `user_id` 匹配），确认是否有多行。

---

## 五、相关文件

| 用途 | 路径 |
|------|------|
| Email invitation 接受 | `supabase/migrations/20260310140000_invitation_rpcs.sql`（`rpc_match_accept_email_invitation`） |
| Email invitation 入口 | `supabase/migrations/20260311150000_identity_reconcile_on_accept.sql`（`rpc_email_invitation_accept`） |
| Remove RPC | `supabase/migrations/20260323000000_participant_exit_unified_helper.sql`（`rpc_match_remove_participant`） |
| Remove 前端 | `src/app/matches/[matchId]/ParticipantGroups.tsx` |
| Remove API | `src/lib/api/matches.ts`（`removeParticipant`） |
