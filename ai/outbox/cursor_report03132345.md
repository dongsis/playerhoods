# Cursor Report — Final Implementation Decision

**Date:** 2026-03-12  
**Scope:** 最终实施决议（只定方案，不改代码）

## 1. Final Decision on Invitation Anchoring

### 1.1 主方案是否采用锚点字段

**决议：正式采用** `email_invitations.match_participant_id` 作为主方案锚点。

原因（最小改动 + 稳定性）：

- 现有 `email_invitations` 无法稳定唯一定位到既有 guest participant。
- `match_id + target_email` 只能回退，不保证唯一（`guests.email` 不唯一）。
- 增加单字段锚点即可把“invitation -> participant”从推断变成显式绑定。

### 1.2 新 invitation 是否必须绑定该字段

**决议：新 invitation 默认必须尝试绑定；无法唯一绑定时不写入并进入受控回退。**

执行规则：

- 创建 invitation 时，若能唯一识别既有 guest participant，则写 `match_participant_id`。
- 若无法唯一识别，不允许猜测绑定；保持 `NULL`，由响应阶段按回退规则处理。

### 1.3 旧 invitation 的回退匹配规则

回退仅在 `match_participant_id IS NULL` 时生效，规则固定为：

1. 按 `related_type='match'` + `related_id(match_id)` + `target_email`（标准化小写/trim）查找 active guest participant。  
2. 命中 **1 条**：允许继续，并回填 `match_participant_id`（建议）。  
3. 命中 **0 条**：报错。  
4. 命中 **>1 条**：报错。

### 1.4 必须报错而非猜测的场景

以下场景必须 fail fast：

- invitation 非 `match` 类型。
- invitation 已非 `pending`（已 accepted/declined/expired/canceled）。
- 锚点为空且回退命中 0 条。
- 锚点为空且回退命中多条（ambiguous）。
- 锚点存在但对应 participant 不属于该 invitation 的 `related_id(match_id)`。
- 锚点 participant 已 removed 且当前流程不允许 re-entry。

---

## 2. Final Decision on Guest Decline Actor Accounting

### 2.1 actor 方案

**决议：采用 system actor（服务账号）记账；不采用 invitation actor 或 synthetic actor。**

### 2.2 匿名 guest 点击 No 的记账方式

- participant 语义：`withdraw`（通过现有 participant exit helper 路径表达）。
- invitation 语义：`declined`。
- action log / participant exit 写入 actor：使用固定 system actor id（例如 `system_guest_invitation_actor` 对应的服务账号 user id）。

### 2.3 为什么这是最小且审计一致的方案

- 现有 helper 与 action log 要求 actor 非空；匿名 guest 无 `auth.uid()`。
- 用 system actor 可无缝复用现有写链，不改 helper 入参与约束。
- 审计语义可通过 note/metadata 补充“triggered_by=guest_invitation_link”，实现“系统代执行、来源可追溯”。
- invitation actor（inviter_user_id）会误导为“由邀请人执行了 decline”；synthetic actor 需要额外身份体系，改动更大。

---

## 3. Final Implementation Sequence

按以下顺序实施：

1. **Migration**
   - 新增 `email_invitations.match_participant_id`（nullable FK -> `match_participants.id`）。
   - 补必要索引与一致性校验（确保锚点与 match_id 可校验）。

2. **Invitation create 链最小绑定**
   - 创建 invitation 时执行“唯一可识别则绑定，否则留空”的策略。
   - 严禁猜测绑定。

3. **Guest accept RPC**
   - 优先按锚点定位 participant；无锚点才回退匹配。
   - 回退非唯一即报错。
   - 仅更新既有 participant，不新增 user participant row。

4. **Guest decline RPC**
   - 与 accept 相同的定位优先级与报错策略。
   - participant 走 `withdraw` 语义，invitation 标记 `declined`。
   - actor 使用 system actor。

5. **Invitation page / CTA wiring**
   - 邮件与页面接线到 guest accept/decline 新路径。
   - 注册 CTA 保持独立，不影响当前 match participant。

6. **Validation / test**
   - 覆盖锚点命中、回退唯一命中、0 命中、多命中、已非 pending、removed participant 等用例。
   - 覆盖“无新增 user participant row”“不重复 participant row”“decline 审计 actor 正确”。

---

## 4. Explicit Non-Goals

- 不改 `apply_participant_admission`。
- 不改 `apply_participant_acceptance`。
- 不改 `apply_participant_exit` 语义本身。
- 不改 `match_participant_reconcile_status`。
- 不改 `identity_links` 核心规则。
- 不做历史 match 回扫。
- 不做全量 canonicalization。
- 不把当前 guest participant 直接转换成 user participant。
- 不沿用 `rpc_email_invitation_accept -> rpc_match_accept_email_invitation` 作为 guest 当前 match 响应主链。
