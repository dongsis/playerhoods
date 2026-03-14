# Cursor Report — Contact Player Guest 响应主路径

**Date:** 2026-03-12  
**Task:** 执行 `ai/inbox/task_for_cursor.md`（方案与文件级实施计划，不改业务代码）

## 1. Overview

本报告聚焦“当前 match 的 guest 响应主链”，目标是让邮件里的 Yes/No 只落在既有 guest participant 语义上，彻底切断“点击后走 user accept 链再新增 user participant row”的行为。  
本轮产出为实施设计与文件级改动计划，未直接改动数据库函数与业务流程代码。

## 2. Current Problem

当前链路已核验：

- 邮件入口：`src/app/matches/[matchId]/InviteByEmailForm.tsx` -> `src/app/matches/[matchId]/invite-actions.ts` -> `src/lib/invitations/create-email-invitation.ts` -> `rpc_email_invitation_create`
- 邀请页入口：`src/app/invitations/[id]/page.tsx` -> `src/app/invitations/[id]/InvitationActions.tsx`
- 未登录先 `signInWithOtp`，登录后 Accept 调 `src/lib/invitations/accept-invitation.ts` -> `rpc_email_invitation_accept`
- `rpc_email_invitation_accept` 在 match 场景会调用 `rpc_match_accept_email_invitation`
- `rpc_match_accept_email_invitation` 在不存在同 match+user_id 的 active 行时执行 `INSERT INTO public.match_participants (... user_id ...)`

结论：guest 点邮件 Accept 后，当前主链会引入 user participant 写入，和“当前 match 响应保持在 guest participant 行上”冲突。

## 3. Confirmed Rules

- 当前 match 响应不依赖注册；响应主体是 Contact Player / guest participant。
- 注册是独立 CTA；注册本身不改写当前 match 的 participant 身份。
- 当前响应路径不得创建新的 user participant row，不得新增重复 participant row。
- 不改底层 helper 与 reconcile 语义（`apply_participant_*`、`match_participant_reconcile_status` 等）。
- 不做历史回扫、全量 canonicalization、identity_links 核心规则改造。

## 4. New Guest Email Logic

### 4.1 邮件 CTA 结构（目标态）

- 主 CTA 1：`Yes, I can come`
- 主 CTA 2：`No, I can't come`
- 次 CTA：`Register for PlayerHoods`

### 4.2 职责收窄

- 邮件只负责“当前 match 是否参加”的响应入口。
- 邮件不承担注册动作。
- 邮件不承担 user 创建。
- 邮件不承担 user participant 创建。
- 邮件不承担当前 match 身份转换。

### 4.3 模板落点建议

当前模板在 `src/lib/notifications/channels/email/render-invitation-email.ts`，建议改为：

- 主 CTA 直接命中 invitation 响应页并携带 action（如 `?action=accept` / `?action=decline`）
- 次 CTA 独立跳转 `/login?mode=register`
- 去掉“必须先登录才能响应”的文案，改为“可直接响应当前邀请”

## 5. New Guest Response Path

### 5.1 Accept（Yes）

建议新增 RPC：`rpc_email_invitation_accept_as_guest(p_invitation_id uuid, p_token text default null)`（`SECURITY DEFINER`，可授权 `anon`）：

1. 校验 invitation（存在、pending、未过期、related_type=match）
2. 按 `related_id(match_id)` + `target_email` 定位“当前 invitation 对应 participant”
3. 命中既有 guest participant 时，仅 UPDATE：
   - `participant_accepted_at = now()`
   - `participant_accepted_via = 'email_invitation'`（或约定的新 guest 来源值）
   - 视业务保留 `org_approved_at` 写入策略
4. 调 `match_participant_reconcile_status`（不改其实现）
5. 写 invitation/event/action 审计

### 5.2 Decline（No）

建议新增 RPC：`rpc_email_invitation_decline_as_guest(p_invitation_id uuid, p_token text default null)`：

1. 同样先定位该 invitation 对应 guest participant
2. 仅处理该 participant 的 decline/remove/withdraw-equivalent 结果
3. 执行 reconcile（沿用现有机制）
4. 更新 invitation 状态与事件日志

### 5.3 关键约束

- 不需要注册
- 不依赖 `rpc_email_invitation_accept`
- 不调用 `rpc_match_accept_email_invitation`
- 不创建 user participant row
- 同一 invitation 响应流程不得产生重复 participant row

### 5.4 为什么现有 accept 主链不适用

- `rpc_email_invitation_accept` 强依赖 `auth.uid()` 与 session email 匹配
- match 场景下会分流到 `rpc_match_accept_email_invitation`
- 后者以 user 身份 admission 为核心，天然会走 user participant 写入语义
- 这与“当前 match 按既有 guest participant 响应”目标冲突

## 6. Registration CTA Logic

- 注册按钮落到现有入口：`/login?mode=register`
- 注册成功后只做：
  - 创建 user
  - 建立与原 Contact Player 的 link/identity 关联（沿既有 identity 机制）
  - 允许查看历史 Contact Player 轨迹
  - 如业务确认允许，可对当前 match 的 contact player 执行 withdraw（需单独确认动作语义）
- 明确不做：
  - 不给当前 match 新增 user row
  - 不改当前 guest participant 主体
  - 不把当前 guest participant 直接转成 user participant
  - 不回扫历史 matches
  - 不做全量 canonicalization

## 7. Future User-First Rule

### 7.1 识别方式

系统可通过 `identity_links`（或等价 guest<->user 关系）识别“该 contact 已注册为 user”。

### 7.2 后续新流程策略

对“以后新产生”的邀请、match 交互、group/play-network 交互，优先按 user 身份入链。  
该规则不回写正在响应的当前 invitation 关联 participant。

### 7.3 本轮落地边界

本轮建议仅明确规则与接口预留，不做跨域的大规模 user-first 重构。

## 8. File-Level Change Plan

1) `src/lib/notifications/channels/email/render-invitation-email.ts`  
- 当前作用：渲染 invitation 邮件（单一 View CTA + 登录导向文案）  
- 本轮改动：改为 Yes/No 双主 CTA + Register 次 CTA；文案职责收窄  
- 改动风险：低（模板层）

2) `src/lib/notifications/workers/process-queued-notification-deliveries.ts`  
- 当前作用：按 payload 选择 `invitation` 模板并发送  
- 本轮改动：若 CTA 需携带 action/token，补充模板参数传递  
- 改动风险：低-中（投递 payload 兼容）

3) `src/app/invitations/[id]/InvitationActions.tsx`  
- 当前作用：未登录先 magic link；登录后调 user accept/decline  
- 本轮改动：改为 guest 主链动作按钮；去除“响应必须先登录”强依赖；保留独立注册 CTA  
- 改动风险：中（前端分流行为变化）

4) `src/lib/invitations/accept-invitation.ts`、`src/lib/invitations/decline-invitation.ts`  
- 当前作用：分别调用 `rpc_email_invitation_accept/decline`  
- 本轮改动：新增并切换到 guest 版本调用器（如 `accept-invitation-as-guest.ts`）  
- 改动风险：中（RPC 路由切换）

5) 新 migration：`supabase/migrations/*_guest_invitation_response.sql`（新建）  
- 当前作用：无  
- 本轮改动：新增 `rpc_email_invitation_accept_as_guest` / `rpc_email_invitation_decline_as_guest`；授予 `anon`；不改旧 RPC  
- 改动风险：中（权限与定位逻辑正确性）

6) `src/app/invitations/[id]/page.tsx`  
- 当前作用：按登录态与 `caller_email_matches` 控制响应组件  
- 本轮改动：调整展示与引导，主链不再依赖登录态  
- 改动风险：低-中（页面条件分支）

7) 测试与验证文件（建议新增）  
- `tests/INVITATION_MANUAL_TEST_CHECKLIST.md`：补 guest Yes/No + register 解耦 case  
- `supabase/validation/*guest_invitation_response*_validation.sql`：验证不新增 user row、不重复行、reconcile 正常  
- 改动风险：低（测试资产）

## 9. Risk Assessment

### 高风险

- 误改 `rpc_email_invitation_accept` / `rpc_match_accept_email_invitation` 或底层 helper 语义
- 在 decline 场景错误选择 action_type，导致状态机偏移
- 未约束好 invitation->participant 定位，造成误更新或重复写入

### 中风险

- guest RPC 的 `anon` 执行权限与 token 校验边界
- 邀请页从登录驱动切到 invitation 驱动后的前端分流
- 注册后 link 建立时机与当前 match 行为边界

### 低风险

- 邮件 CTA 文案/结构调整
- 注册次 CTA 跳转与页面文案更新
- 技术文档与手测清单补充

### 需实现前再次确认

1. invitation 是否能稳定定位唯一既有 guest participant（当前 schema 未见 `invitation -> participant_id` 直连）  
2. decline 在当前模型应映射为哪类动作（remove / withdraw / 仅标记 invitation declined）  
3. magic link 与 invitation token 的职责边界（是否完全去登录依赖）  
4. 注册后 identity link 的建立点（登录回调、后台任务或显式动作）  
5. “未来 user-first”是否需要新增 schema 或索引保障

## 10. Explicit Non-Goals

- 不改 `apply_participant_admission`
- 不改 `apply_participant_acceptance`
- 不改 `apply_participant_exit`
- 不改 `match_participant_reconcile_status`
- 不改 `identity_links` 核心规则
- 不改 canonical participant row 策略
- 不做历史 match participant 转换
- 不做历史 active matches 回扫
- 不做全量 canonicalization
- 不把“未来 user-first”误实现为“当前 guest participant 立即转 user participant”

## 11. Recommended Implementation Order

1. 先确认 5 个需确认项（尤其 invitation->participant 唯一定位与 decline 语义）  
2. 新增 guest accept/decline RPC migration（保持旧 RPC 不动）  
3. 新增前端 guest action 调用器，并改 `InvitationActions` 主链  
4. 改 invitation 邮件模板为 Yes/No + Register CTA  
5. 补 validation SQL + 手测清单（覆盖“不新增 user row / 不重复 participant”）  
6. 灰度验证后再考虑未来 user-first 的跨流程落地

---

## Validation Required — 本轮核验结果

1. `rpc_email_invitation_accept -> rpc_match_accept_email_invitation` 是否会新增 user row：**是（已由 SQL 函数体确认）**。  
2. 当前 guest 占位行何时生成：**在 invitation create 过程中未生成；更可能来自更早的 Contact Player/guest admission 链，需再确认唯一绑定机制**。  
3. 新方案 Yes/No 能否只落同一条既有 guest 行：**可设计为是，但前提是先解决 invitation->participant 的唯一定位问题**。  
4. 注册 CTA 是否可与当前 participant 更新解耦：**可以，应强制解耦**。  
5. 新方案是否避免重复 participant row：**可以，通过“先定位、仅更新、不存在才最小补建”实现**。  
6. reconcile 是否沿用现有机制：**是，建议只调用现有 reconcile，不改 helper 语义**。
