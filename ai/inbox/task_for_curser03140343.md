# Task For Cursor

## Objective
基于当前补充报告，输出“最终实施决议版”，只定实施方案，不改代码。

## Background
当前方案已经基本明确：

- 当前 match 的 guest / Contact Player 响应不应再复用现有 user accept 主链
- 点击邮件 Accept / Decline 不应再额外 INSERT 一条 user participant row
- 注册 CTA 应独立，不回写当前 match participant
- 当前最关键的未决点，已经收敛为两个实施前硬点：
  1. invitation 如何稳定锚定到唯一既有 guest participant
  2. guest decline 采用 withdraw 语义时，匿名响应的 actor 如何记账

当前补充报告还进一步指出：

- 现有 `email_invitations` 无法稳定唯一定位到既有 guest participant
- `related_id(match_id) + target_email` 只能作为弱匹配，不足以成为长期稳定方案
- 在 `email_invitations` 增加 `match_participant_id` 作为锚点，是当前最小且最稳的补强方向
- guest decline 优先定义成 `withdraw` 较符合现有 participant / reconcile 语义，但 actor accounting 尚需定稿

## Authority
必须严格遵守以下已确认规则：

1. 当前 match 的 guest 响应，必须保留在既有 guest / Contact Player participant 语义上
2. 当前 match 的 guest Accept / Decline，不得额外创建 user participant row
3. 注册 PlayerHoods 是独立 CTA，不影响当前 match participant
4. 不做历史 match 回扫
5. 不做全量 canonicalization
6. 不改以下底层 helper / reconcile 主干：
   - `apply_participant_admission`
   - `apply_participant_acceptance`
   - `apply_participant_exit`
   - `match_participant_reconcile_status`
7. 不擅自扩大到 identity / canonical participant row 体系重构

## Scope In
本轮允许处理：

- 最终锚点方案定稿
- guest decline actor accounting 方案定稿
- 最终实施顺序整理
- 明确旧 invitation 的回退匹配规则
- 明确哪些场景应报错而非猜测匹配
- 输出最终实施决议版 markdown

## Scope Out
本轮禁止处理：

- 改代码
- 改 migration 实现
- 改 RPC 实现
- 改 invitation page 实现
- 改现有底层 helper / reconcile 逻辑
- 大范围 schema 重构
- 历史数据回填或批量修复

## Required Work

### 1. invitation anchoring 方案定稿
请明确并定稿以下问题：

1. 是否正式采用：
   - `email_invitations.match_participant_id uuid NULL REFERENCES public.match_participants(id)`
   作为推荐主方案
2. 新 guest invitation 是否默认必须绑定该字段
3. 旧 invitation 的回退匹配规则是什么
4. 哪些情况允许回退匹配
5. 哪些情况必须报错，而不是猜测 participant
6. 为什么该方案最符合：
   - 最小改动
   - 避免重复 participant row
   - 当前 match 响应只更新既有 guest participant

### 2. guest decline actor accounting 方案定稿
请明确并定稿以下问题：

1. 匿名 guest 点击 “No, I can’t come” 时：
   - `withdraw` 这类 participant exit / action log 的 actor 如何记录
2. 是否采用以下某一类方案：
   - system actor
   - invitation actor
   - synthetic actor
   - 其他最小方案
3. 该方案为什么最符合：
   - 当前审计语义
   - 最小实现改动
   - 不破坏现有 helper / reconcile
4. 该方案是否需要额外 schema 支持
5. 若现有体系无法优雅表达，该问题应如何最小化降级处理

### 3. 旧 invitation 的兼容策略
请明确：

1. 旧 invitation（没有 `match_participant_id`）如何处理
2. 是否允许基于 `match_id + target_email` 的严格回退匹配
3. 回退匹配需要满足哪些严格条件
4. 如果不满足严格唯一条件，应如何失败
5. 是否需要在 UI / API 上返回明确错误语义

### 4. 最终实施顺序
请输出明确、线性的实施顺序，至少包含：

1. migration
2. invitation create 链最小绑定
3. guest accept RPC
4. guest decline RPC
5. invitation page / CTA wiring
6. validation / test

并说明每一步的：
- 输入
- 输出
- 依赖
- 风险点

### 5. Explicit Non-Goals
请明确列出本轮最终实施中仍然不做的事，包括但不限于：

- 历史 match participant 转换
- 当前 guest participant 转 user participant
- 注册后回写当前 match row
- 全量 canonicalization
- identity_links 体系重构
- participant row 主策略重写

## Constraints
- 本轮只做“最终实施决议版”，不改代码
- 不得把未确认实现写成既定事实
- 不得在没有稳定锚点时默认声称“可安全更新既有 participant”
- 不得回避 guest decline actor accounting 问题
- 不得把旧 invitation 的弱匹配写成无条件安全

## Deliverables
请输出到 `ai/outbox/cursor_report.md`：

1. Final decision on invitation anchoring
2. Final decision on guest decline actor accounting
3. Backward compatibility / fallback policy for legacy invitations
4. Final implementation sequence
5. Explicit non-goals
6. Remaining must-confirm items（若仍存在）

## Validation Required
请至少核对并说明：

1. 当前 `email_invitations` 是否确实无法稳定唯一锚定 participant
2. `match_participant_id` 是否足以解决当前 guest 响应唯一定位问题
3. guest decline = `withdraw` 是否确实最贴合现有 helper / reconcile 语义
4. 匿名 actor accounting 是否在当前系统中已有可复用表达
5. 旧 invitation 回退匹配是否存在误伤或歧义风险

## Output Format
请按以下结构输出 markdown：

1. Overview
2. Final Decision: Invitation Anchoring
3. Final Decision: Guest Decline Actor Accounting
4. Legacy Invitation Fallback Policy
5. Final Implementation Sequence
6. Explicit Non-Goals
7. Remaining Must-Confirm Items

## Escalate Instead Of Guessing
如果你发现以下问题仍无法从现有代码 / schema 中确认，请不要擅自拍板；请在报告中列为“Remaining Must-Confirm Items”：

- 现有 action log / exit actor 的真实字段要求
- `match_participant_id` 加入后是否会影响现有 invitation create 兼容性
- 旧 invitation 回退匹配的唯一性是否在真实数据中站得住
- invitation create 链上谁最适合负责写入 `match_participant_id`
