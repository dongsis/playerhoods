# Cursor Report — Phase 1 Implementation (DB/Server Path Foundation)

## 1. Overview

本轮已按任务落地第 1 阶段基础实现（不接 UI 主页面）：

- 增加 invitation 锚点 `email_invitations.match_participant_id`
- 在 invitation create 链做最小锚点绑定（唯一命中绑定，模糊命中报错）
- 新增 guest accept / guest decline 的 DB 主路径 RPC
- 新增 server path 骨架（供后续页面 wiring 调用）
- 提供 validation SQL 清单

目标“guest 当前 match 响应不再走 user participant 新增链”的基础能力已建立。

## 2. Files Changed

- `supabase/migrations/20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`
- `supabase/validation/20260327000000_guest_invitation_anchor_validation.sql`
- `src/lib/invitations/create-email-invitation.ts`
- `src/lib/invitations/accept-invitation-as-guest.ts`
- `src/lib/invitations/decline-invitation-as-guest.ts`
- `src/app/invitations/[id]/guest-invitation-actions.ts`

## 3. Migration Added

新增 migration：`supabase/migrations/20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`

包含内容：

1. `email_invitations` 增加 `match_participant_id uuid null`
2. 增加 FK：`email_invitations_match_participant_id_fkey -> match_participants(id)`
3. 增加索引：`idx_email_invitations_match_participant_id`
4. 增加一致性 trigger：`trg_email_invitation_anchor_consistency`
   - 锚点必须用于 `related_type='match'`
   - 锚点 participant 必须属于 `related_id` 对应 match
   - 锚点 participant 必须是 guest participant（`guest_id is not null`）
5. `rpc_email_invitation_create` 改为支持最小锚点绑定
6. 新增 `rpc_email_invitation_accept_as_guest`
7. 新增 `rpc_email_invitation_decline_as_guest(p_invitation_id, p_system_actor_id)`
8. 为新 RPC 授权 `anon` 与 `authenticated`

## 4. Invitation Anchor Binding

create 链绑定策略（在 `rpc_email_invitation_create` 内实现）：

- 按 `match_id + target_email` 匹配 active guest participant
- 命中 1 条：写入 `match_participant_id`
- 命中 0 条：保持 `match_participant_id = NULL`（兼容旧/非 guest 邀请场景）
- 命中 >1 条：抛错 `anchor_ambiguous_guest_participant`，禁止猜测

说明：

- 本轮未在 create 阶段新增任何 user participant
- 本轮未引入 canonicalization 扩展
- 旧 invitation 的回退仍只允许“严格唯一命中”，由 accept/decline 新路径保证

## 5. Guest Accept Implementation

新增 RPC：`rpc_email_invitation_accept_as_guest(p_invitation_id)`

实现要点：

1. 入口为 invitation
2. 优先走锚点：`match_participant_id`
3. 无锚点时按 `match_id + target_email` 回退；仅 1 条可通过，0/多条报错
4. 对既有 guest participant 更新：
   - `participant_accepted_at`
   - `participant_accepted_via='email_invitation'`
   - `org_approved_at`（沿现有 guest confirm 语义最小补齐）
5. 调用 `match_participant_reconcile_status`
6. 更新 invitation 为 `accepted`
7. 不调用 `rpc_email_invitation_accept` / `rpc_match_accept_email_invitation`
8. 不创建 user participant row

## 6. Guest Decline Implementation

新增 RPC：`rpc_email_invitation_decline_as_guest(p_invitation_id, p_system_actor_id)`

实现要点：

1. 入口为 invitation
2. participant 定位优先级与 accept 一致（锚点优先，回退严格唯一）
3. participant decline 语义按 `withdraw` 落地：
   - 调用 `apply_participant_exit(..., 'withdraw', ...)`
4. invitation 更新为 `declined`
5. 写 invitation event：`invitation_declined`
6. 不创建 user participant row

## 7. System Actor Accounting

落地方式：

- server path 骨架 `src/app/invitations/[id]/guest-invitation-actions.ts`
- decline action 从 `GUEST_INVITATION_SYSTEM_ACTOR_ID` 读取 system actor
- 缺失该 env 时直接报错，避免无审计主体写入
- RPC decline 显式要求 `p_system_actor_id` 非空

为何最小：

- 不改 helper 语义
- 不伪装成 inviter/organizer
- 审计主体来源清晰可控（环境配置 + 显式参数）

## 8. Validation Performed

已完成：

1. 新增 migration 与 validation SQL（`supabase/validation/20260327000000_guest_invitation_anchor_validation.sql`）
2. 静态核对：
   - create 链已接入锚点绑定逻辑
   - accept/decline 新路径均实现“锚点优先 + 严格唯一回退”
   - decline 使用 system actor 参数
3. 代码检查：新增/修改 TS 文件无 linter 报错（`ReadLints`）
4. Helper/reconcile 不变更：
   - 未改 `apply_participant_admission`
   - 未改 `apply_participant_acceptance`
   - 未改 `apply_participant_exit`
   - 未改 `match_participant_reconcile_status`

未完成（本轮未执行）：

- 针对真实数据的 DB 运行时回归（accept/decline E2E）
- UI 页面接线后的端到端操作验证

## 9. Known Risks / Follow-ups

1. **新 invitation 锚点 0 命中场景**：当前保留为 NULL，需在下一轮页面/调用层明确提示与处理。
2. **system actor 依赖环境配置**：`GUEST_INVITATION_SYSTEM_ACTOR_ID` 未配置会阻断 decline。
3. **回退匹配对历史数据敏感**：`guests.email` 非唯一，历史脏数据会触发 ambiguous 报错（这是有意 fail-fast）。
4. **本轮未做 UI wiring**：用户侧仍未切到新 guest 路径，需要下一轮把 invitation 页面按钮接到新 server actions。
5. **建议下一轮**：
   - 接 `InvitationActions` 到 `acceptInvitationAsGuestAction` / `declineInvitationAsGuestAction`
   - 增加 DB 级 validation 执行记录与手测脚本
   - 明确 0 命中时产品提示文案与恢复流程
