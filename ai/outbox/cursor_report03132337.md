# Cursor Report — 实施前两项关键确认（仅补充）

**Date:** 2026-03-12  
**Scope:** 仅补清 2 个必须确认点（不改代码）

## 1) invitation -> participant 唯一定位分析

### 1.1 `email_invitations` 当前 schema 字段

基于 `supabase/migrations/20260310110000_email_invitations.sql`，`email_invitations` 关键字段为：

- `id`
- `inviter_user_id`
- `target_email`
- `target_name`
- `related_type`
- `related_id`
- `status`
- `magic_link_flow_status`
- `accepted_by_user_id`
- `accepted_at`
- `declined_at`
- `expires_at`
- `created_at`
- `updated_at`

其中与“定位当前 match 的既有 guest participant”直接相关的只有：

- `related_type`（应为 `match`）
- `related_id`（`match_id`）
- `target_email`

### 1.2 现有可用定位键与局限

当前可用的定位条件只能是：

- `match_participants.match_id = email_invitations.related_id`
- `match_participants.guest_id -> guests.id`
- `lower(trim(guests.email)) = lower(trim(email_invitations.target_email))`
- `match_participants.removed_at IS NULL`

问题是：这组条件 **不保证唯一**。

原因：

- `guests.email` 在当前 schema **无唯一约束**
- `email_invitations` 中 **没有 `guest_id` / `match_participant_id` / `identity_link_id`**
- 系统中也没有“某 invitation 必绑定某 participant”的显式字段

### 1.3 是否已有隐式唯一绑定

结论：**没有稳定的隐式唯一绑定**。

虽然存在 `uq_mp_active_guest (match_id, guest_id)`，但它只能保证“同一 guest_id 在同一 match 不重复 active”，并不能解决“同一 email 可能对应多个 guest_id”的问题。

因此仅凭 invitation 当前字段，无法在所有场景下稳定定位到唯一既有 guest participant。

## 2) guest decline 精确定义建议

### 2.1 业务语义选择

对 “No, I can't come”，推荐定义为：

- **participant 语义：`withdraw`（从当前 match 退出）**
- **invitation 语义：`declined`**

即：不是只改 invitation，也不是新造 participant 状态，而是“当前 participant 从 match 退出 + invitation 标记 declined”。

### 2.2 与现有模型的契合性

当前 participant 状态枚举只有：`pending | confirmed | removed`，没有 `declined` 独立状态。  
在现有 helper 中，`apply_participant_exit(..., 'withdraw', ...)` 会：

- 写 `removed_at/removed_by/removal_note`
- 调用 `match_participant_reconcile_status`（保持既有机制）
- 在 `join_method in ('invited','nominated') 且未 confirmed` 时记录 action_type `decline`

这和 guest 点击 No 的业务观感最贴合，且不需要改 helper/reconcile 语义。

### 2.3 为什么不建议其他定义

- **invitation declined only**：participant 仍在 match，organizer 视图与后续操作会混乱。
- **新建 participant `declined` 状态**：会破坏现有状态机与 reconcile 约束。
- **用 `remove`（组织者移除）代替 `withdraw`**：审计语义偏差（行为主体不是 organizer）。

## 3) 是否需要 schema 补强

结论：**建议需要最小 schema 补强**，否则无法稳定保证“唯一定位 + 不重复 participant row”。

### 推荐最小补强（首选）

在 `email_invitations` 增加可空列：

- `match_participant_id uuid NULL REFERENCES public.match_participants(id)`

策略：

- invitation 创建时，若已知目标既有 guest participant，则写入该 `match_participant_id`
- guest Yes/No 路径优先使用该 id 定位
- 若为空，再走 `match_id + target_email` 回退匹配，并在唯一命中时回填

这是一条最小、可回填、低侵入的稳定锚点方案。

### 不建议替代

- 只加 `(related_id, target_email, status='pending')` 唯一：仍不等于 participant 唯一。
- 只依赖 identity_links：属于更大范围身份链路，不是本轮最小改动。

## 4) 推荐最小实施方案

1. **先补锚点字段**：`email_invitations.match_participant_id`（可空）。
2. **创建 invitation 时尽量绑定**：能确定既有 guest participant 即写入。
3. **guest Accept/Decline 都先按锚点定位**：
   - 命中即只更新该 participant
   - Decline 走 `withdraw` 语义
4. **回退匹配必须“唯一命中”才允许执行**：
   - 0 条：报 `participant_not_found_for_invitation`
   - >1 条：报 `participant_ambiguous_for_invitation`
5. **保持不动项**：不改 `apply_participant_*`、不改 `match_participant_reconcile_status`、不改 canonicalization。

## 5) 实施前必须确认项

1. **匿名 guest decline 的 actor 记账**：
   `apply_participant_exit` 要求 `p_actor_id` 非空，且 action log `created_by` 非空；guest 无 user_id 时审计主体如何定义需先确认。

2. **历史 invitation 无锚点时的处理策略**：
   仅允许“唯一命中”回退，还是要求 organizer 手动选择 participant。

3. **decline 对 organizer UI 的期望**：
   是否要求在 organizer 侧明确显示“declined by guest”（基于 action_type `decline`）而不仅是 participant 被 removed。

4. **invitation 与 participant 的终态顺序**：
   先写 participant withdraw 再写 invitation declined，还是反过来；需确认事务内失败回滚策略。

5. **是否允许“invitation declined only”作为降级**：
   当前建议不允许；若产品要允许，必须明确该场景在 organizer 后续操作中的解释规则。
