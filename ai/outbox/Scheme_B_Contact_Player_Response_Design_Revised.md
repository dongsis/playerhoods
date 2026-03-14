# 方案 B：Contact Player 非注册响应 — 修订版设计说明

**Date:** 2026-03-11  
**Status:** 修订版方案表述（不改代码）  
**背景:** Contact Player 通过 invitation link 响应当前 match，不因 accept/decline 自动创建 user participant row；注册始终为独立 CTA

---

## 1. 核心规则（明确）

### 1.1 Contact Player 响应身份

- Contact Player 通过 invitation link 响应当前 match 时，**默认应以既有 contact/guest participant 身份完成**。
- 不因 accept/decline **自动创建** user participant row。
- **注册始终是独立 CTA**，与当前 match 响应解耦。

### 1.2 响应路径原则

- Accept：在既有 participant 占位上完成确认（UPDATE），不默认 INSERT。
- Decline：更新 invitation 状态，不触碰 participant 写入逻辑（除非已有占位需 retire）。
- 仅在现有数据模型下**确实不存在**该 invitation 对应的 participant 占位记录时，才允许**最小化创建**。

---

## 2. 技术路径（修订）

### 路径 1：邀请发送时创建 guest 占位，Accept 时更新

| 步骤 | 行为 |
|------|------|
| **邀请创建** | 当 `related_type=match` 时：创建或获取 guest（按 target_email），创建 match_participant（guest_id, join_method=invited, pending）— 即「占位」 |
| **Accept（anon）** | 校验 invitation → **定位**该 match 下 target_email 对应的既有 guest participant → **仅 UPDATE**（participant_accepted_at、participant_accepted_via、org_approved_at）→ reconcile → action log |
| **Decline（anon）** | 更新 invitation.status=declined；若已有 guest 占位，按业务规则决定是否 retire（本轮不展开） |

**要点：** 占位在邀请发出时即存在；Accept 只做 UPDATE，不 INSERT participant。

---

### 路径 2：Accept 时「先定位、后最小创建」（修订表述）

| 步骤 | 行为 |
|------|------|
| **邀请创建** | 不改动；仅创建 email_invitations 记录 |
| **Accept（anon）** | 1）校验 invitation；2）**先定位**当前 invitation 对应的既有 participant（match_id + target_email，通过 guests.email 或 identity_links 关联）；3）**若存在**：UPDATE 该 participant；4）**若不存在**：仅在确实无占位时，做最小化创建（guest + match_participant）→ reconcile → action log |
| **Decline（anon）** | 仅更新 invitation.status |

**修订要点：**

- Accept **不是默认 INSERT participant**。
- **必须先定位**当前 invitation 对应的既有 participant。
- **仅当**现有数据模型下确实不存在该 participant 占位记录时，才允许最小化创建。

**定位逻辑：**

- 按 `match_id` + `target_email` 查找：`match_participants` JOIN `guests` WHERE `guests.email = target_email` AND `match_participants.match_id = invitation.related_id` AND `match_participants.removed_at IS NULL`。
- 若找到 guest participant → UPDATE。
- 若未找到 → 最小化创建（guest + match_participant）。

---

### 路径比较（修订后）

| 维度 | 路径 1 | 路径 2 |
|------|--------|--------|
| **占位创建时机** | 邀请创建时 | Accept 时（仅当无既有占位） |
| **Accept 默认行为** | UPDATE 既有 guest row | **先定位** → 有则 UPDATE，无则最小创建 |
| **Decline** | 更新 invitation；占位可保留或 retire | 仅更新 invitation |
| **实现复杂度** | 中（改 invitation 创建链） | 低（仅新 RPC，定位优先） |

---

## 3. Participant Row Invariant（新增）

### 3.1 不变式

| 规则 | 说明 |
|------|------|
| **不重复生成** | 一个 invitation 响应流程**不得**额外生成重复 participant row。 |
| **不直接 canonicalize** | **不得**把 contact/guest 响应直接 canonicalize 为 user participant。 |
| **不历史回扫** | 不做历史 match 回扫，不做全量 canonicalization。 |

### 3.2 具体约束

- 同一 invitation 的 accept 流程中：若已存在对应 participant（guest 或 user），则只更新该行，不新建。
- 响应路径不调用 `rpc_match_accept_email_invitation`，不创建 user participant row。
- 注册为独立 CTA，注册动作不触发当前 match 的 participant 写入。

---

## 4. 承载方式与最小新能力（保持）

- **推荐承载：** 专门 guest-response RPC（anon 可调）。
- **新 RPC：** `rpc_email_invitation_accept_as_guest`、`rpc_email_invitation_decline_as_guest`。
- **分流：** invitation 页无论登录与否，均走 guest 路径，不调用 `rpc_email_invitation_accept`。

---

## 5. 邮件 CTA 最终结构（保持）

| CTA | 文案 | 落点 |
|-----|------|------|
| **主 CTA** | `View Invitation` | `/invitations/[id]` — 以 contact/guest 身份直接 Accept/Decline，无需注册 |
| **次 CTA** | `Or register for PlayerHoods to manage future invites` | `/login?mode=register` |

---

## 6. 明确不动项（保持）

- `apply_participant_admission`、`apply_participant_acceptance`、`apply_participant_exit`
- `match_participant_reconcile_status`
- `rpc_match_accept_email_invitation` 的实现
- canonical participant row 策略
- identity_links 核心规则
- 全量 canonicalization、历史 match 回扫
- 任何把「当前 match 响应」自动转成 user participant row 的逻辑
