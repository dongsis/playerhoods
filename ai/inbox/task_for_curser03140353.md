# Task For Cursor

## Objective
基于已批准的最终实施决议版，开始第 1 阶段实现，只完成以下内容：

1. 增加 `email_invitations.match_participant_id` 锚点
2. 在 invitation create 链中完成最小绑定
3. 新增 guest accept / guest decline 的 RPC 或 server path 骨架
4. 在不接 UI 主页面之前，先把 DB / server path 打通并可验证

本轮目标是：先把“guest 当前 match 响应不再新增 user participant row”的底层实施基础建立起来。

## Background
当前已确认的问题与决议如下：

### 已确认现状问题
- guest 点邮件里的 Accept / Decline 时，会先走 magic link 登录（`signInWithOtp`）
- Accept 最终走：
  - `rpc_email_invitation_accept`
  - `rpc_match_accept_email_invitation`
- 这条路径会 INSERT 一条 `match_participants.user_id` 行

因此当前业务观感是：
- 原来已经有一条 contact / guest 占位 participant
- 点击邮件后，又新增出一条 user participant 记录
- 不是在原 guest participant 行上直接更新

### 已批准的最终方向
1. 当前 match 的响应，仍由 **guest / Contact Player participant 语义**完成
2. 不要求注册
3. 不因为响应创建 user participant row
4. 注册 CTA 独立，不回写当前 match 的 participant 行
5. 采用 `email_invitations.match_participant_id` 作为 invitation 锚点主方案
6. guest decline 业务语义优先定义为 `withdraw`
7. decline actor 采用可审计的 system actor 方案
8. 实施顺序为：
   - migration
   - invitation create 链最小绑定
   - guest accept / decline RPC
   - page / CTA wiring
   - validation

## Authority
必须严格遵守以下规则：

### 1. 当前 match guest 响应原则
- 当前 match 的响应，必须落在既有 guest participant 语义上
- 不得在 accept 时额外 INSERT 一条新的 user participant row
- 不得把当前 guest participant 直接 canonicalize 为 user participant

### 2. invitation 锚点原则
- 新 guest invitation 主链默认应绑定 `email_invitations.match_participant_id`
- 该锚点必须指向当前 invitation 所属 match 的真实 participant
- 不允许模糊猜测 participant
- 旧 invitation 仅允许在“严格唯一命中”前提下回退匹配；否则报错，不自行猜测

### 3. decline 原则
- guest 点击 “No, I can’t come” 的业务语义按 `withdraw` 处理
- invitation 应标记 declined
- participant 退出当前 match
- actor 使用明确可审计的 system actor，不伪装为 organizer / inviter / guest user

### 4. 本轮边界
本轮只实现底层基础，不做大范围 UI 重构，不做历史数据修复，不做全量 canonicalization。

## Scope In
本轮允许处理：

1. migration
2. `email_invitations` schema 补强
3. invitation create 链最小绑定
4. guest accept RPC / server path
5. guest decline RPC / server path
6. invitation anchor 校验
7. system actor 记账方案落地
8. 基础 validation / test

## Scope Out
本轮禁止处理：

- `apply_participant_admission`
- `apply_participant_acceptance`
- `apply_participant_exit`
- `match_participant_reconcile_status`
- canonical participant row 策略
- identity_links 核心规则
- 历史 match participant 回扫
- 全量 canonicalization
- 大范围 invitation page UI 重构
- 平台注册流整体重构
- 未来 user-first 全面落地（本轮最多只保留接口兼容）

## Required Work

### A. Migration：增加 invitation 锚点
请新增 migration，完成以下内容：

1. 在 `email_invitations` 增加：
   - `match_participant_id uuid null`
2. 建立到 `public.match_participants(id)` 的外键约束
3. 明确 invitation 锚点一致性要求：
   - `match_participant_id` 所指 participant 必须属于该 invitation 的 `related_id` 对应的 match
4. 如适合，补充必要索引
5. 如需约束检查，请尽量用最小可维护方案，不要引入过重复杂度

### B. Invitation create 链最小绑定
请定位当前 guest invitation 的 create 链，并做最小改动：

1. 新创建的 guest invitation，应默认绑定 `match_participant_id`
2. 绑定来源应是当前已存在的 guest participant row
3. 不得在 create 阶段新增 user participant
4. 不得把 create 阶段扩展成身份 canonicalization
5. 若当前 create 链存在多入口，请明确哪些入口本轮需要改，哪些入口先不改

同时请说明：
- 旧 invitation 没有 `match_participant_id` 时，后续 guest accept / decline 的严格回退规则是什么

### C. Guest accept path
请新增或调整 guest accept 主路径，使其满足：

1. 以 invitation 为入口
2. 优先使用 `match_participant_id` 直接定位既有 guest participant
3. 若无锚点，仅允许在严格唯一命中时回退定位
4. 对既有 guest participant 执行 participant-side accept
5. 写入：
   - `participant_accepted_at`
   - `participant_accepted_via = 'email_invitation'` 或最合适的 guest-email 来源值
6. reconcile 仍沿用现有机制
7. 明确不创建 user participant row
8. 明确不走现有：
   - `rpc_email_invitation_accept`
   - `rpc_match_accept_email_invitation`
   这条 user accept 主链

### D. Guest decline path
请新增或调整 guest decline 主路径，使其满足：

1. 以 invitation 为入口
2. 优先使用 `match_participant_id` 直接定位既有 guest participant
3. 若无锚点，仅允许在严格唯一命中时回退定位
4. decline 的 participant 语义按 `withdraw` 落地
5. invitation 标记 declined
6. actor 使用明确、可审计的 system actor
7. reconcile 仍沿用现有机制
8. 明确不创建 user participant row

请同时明确：
- system actor 的具体来源
- 若项目中已有服务 actor / system user，优先复用
- 若没有，请给出最小、安全、可审计的落地方式

### E. Validation / tests
请至少完成并说明以下验证：

1. 新 invitation 创建时，是否正确写入 `match_participant_id`
2. guest accept 是否只更新既有 guest participant 行
3. guest accept 后是否不再新增 user participant row
4. guest decline 是否按 `withdraw` 落地
5. guest decline 是否使用 system actor 正确记账
6. 无锚点旧 invitation 是否仅在严格唯一命中时回退
7. 模糊匹配场景是否明确报错而不是猜测
8. 现有 helper / reconcile 是否未被改动

## Constraints
- 不要改底层 helper 语义
- 不要把本轮扩展成 UI 全链路大改
- 不要把注册 CTA 混回当前 match 响应主链
- 不要默认兼容一切历史 invitation；模糊历史数据应报错而不是猜测
- 所有新增逻辑都要围绕“更新既有 guest participant”这个原则

## Deliverables
请输出到 `ai/outbox/cursor_report.md`：

1. 已改动文件列表
2. migration 内容摘要
3. invitation create 链绑定方式说明
4. guest accept path 说明
5. guest decline path 说明
6. system actor 记账方式说明
7. validation 结果
8. 仍存在的风险 / 未决点
9. 下一轮建议（例如 page / CTA wiring）

并更新 `ai/outbox/technical_snapshot.md`，补充：

- 受影响 migration
- 受影响 invitation create 入口
- 新增 guest accept / decline 入口
- system actor 落地位置
- validation 结果摘要

## Output Format
请按以下结构输出 markdown：

1. Overview
2. Files Changed
3. Migration Added
4. Invitation Anchor Binding
5. Guest Accept Implementation
6. Guest Decline Implementation
7. System Actor Accounting
8. Validation Performed
9. Known Risks / Follow-ups

## Escalate Instead Of Guessing
遇到以下情况请不要自行扩大设计，必须在报告中明确指出：

- 当前 create 链无法稳定拿到既有 guest participant
- `match_participant_id` 一致性校验难以在现有 schema 下优雅表达
- system actor 没有现成可审计来源
- `withdraw` 落地需要额外 action_type / enum 变更
- 旧 invitation 回退规则在真实数据中不够安全

请把这些作为“需确认项”列出，而不是擅自继续扩展。
