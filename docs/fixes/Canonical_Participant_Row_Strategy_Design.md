# Canonical Participant Row Strategy — 设计方案

**日期:** 2026-03-11  
**状态:** 设计阶段，不实施  
**约束:** 不改动核心 helper、RPC、identity_links、不写 migration、不物理 delete guest row

---

## 1. 问题定义

### 1.1 Duplicate Participant Rows（重复 participant 行）

**定义：** 同一真实人在同一 match 中，存在两条或以上 `removed_at IS NULL` 的 `match_participants` 行。

**识别条件：**
- 一条行有 `guest_id`（guest participant）
- 另一条行有 `user_id`（user participant）
- 通过 `identity_links` 或 `guests.email = auth.users.email` 可判定为同一人

**当前已知产生路径：**
1. Organizer 通过 AddGuestForm / InviteGuestForm 调用 `rpc_match_nominate_guest` → 创建 guest participant
2. Contact 收到邮件，通过 email invitation 链接接受 → `rpc_match_accept_email_invitation` 创建 user participant
3. `rpc_match_accept_email_invitation` 仅检查 `user_id = p_user_id` 是否已存在，不检查同 email 的 guest row → 产生重复

### 1.2 Canonical Participant Row（权威 participant 行）

**定义：** 对于同一真实人在同一 match 中的参与，**唯一**用于表示其当前参与状态、用于 display / remove / withdraw / re-entry / activity 计算的那一行。

**性质：**
- 每个「真实人 × match」组合在任意时刻最多有一条 canonical row
- canonical row 的 `removed_at IS NULL` 表示该人当前为 active participant
- 非 canonical 行（如已 retire 的 guest row）保留在表中，但不再参与 active 集合

### 1.3 双 active rows 对 lifecycle 的破坏

| 问题 | 说明 |
|------|------|
| **Display 重复** | 同一人出现两次，UI 显示重复条目 |
| **Remove 不完整** | 只 remove 一条时，另一条仍 active，用户仍显示在 confirmed |
| **Stale status** | guest row 可能遗留 `status=confirmed` 但 `participant_accepted_at=NULL`，违反 reconcile 规则 |
| **Lifecycle 语义混乱** | Enter / Confirm / Exit / Re-entry 均假定「一人一行」，双行导致状态不一致 |
| **Activity 归属** | action log 可能分散在两条行上，难以正确归属 |
| **Reconcile 失效** | reconcile 只作用于单行，无法跨行协调 |

---

## 2. 方案比较

### 方案 A：User Row Canonical（保留/新建 user row，retire guest row）

**策略：**
- Contact 注册/登录并被识别为同一人后，**user participant row 成为 canonical row**
- guest participant row **不再 active**，通过 `removed_at` / `removal_note` 标记为 retired / superseded
- 不物理 delete guest row，保留历史与 action log

**流程：**
1. 当 `rpc_match_accept_email_invitation` 或类似入口发现「同 match 中已有同 email 的 guest row」时：
   - 先 retire guest row（见下文 D 节）
   - 再创建 user row（或复用已有 user row）
2. user row 成为唯一 active canonical row

### 方案 B：Guest Row 升级为 User Row

**策略：**
- 不创建新的 user participant row
- 将 guest row 直接「升级」为 user row：例如 `UPDATE match_participants SET user_id = X, guest_id = NULL WHERE id = guest_mp_id`

**问题：**
- 违反 `match_participants_exactly_one_identity` 约束：`(user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL)`
- 若通过 `UPDATE guest_id = NULL, user_id = X` 实现，会改变行的 identity 类型，但：
  - 历史 action log 指向 guest row，`match_participant_id` 不变，可保留
  - 需要处理 `guest_id` 外键、`identity_links` 中 `linked_type='guest_participant'` 的 linked_id 语义
- 实现复杂度高，需 schema 变更或约束放宽

### 2.1 对比维度

| 维度 | 方案 A（User Row Canonical） | 方案 B（Guest Row 升级） |
|------|-----------------------------|---------------------------|
| **与 lifecycle 一致性** | 高。user row 是既有模型，remove/withdraw/re-entry 均基于 user_id；guest row 仅需「退出 active」语义 | 中。需在单行上做 identity 迁移，与现有「一行一种 identity」的约束冲突 |
| **历史/action log** | 保留。guest row 完整保留，action log 仍指向原 id；仅新增 retire 相关 action | 保留。行 id 不变，action log 可保留；但 guest→user 语义需文档说明 |
| **identity_links** | 无影响。guest_participant link 仍指向 guest row；contact link 指向 guest；user 通过 user_id 直接关联 | 需调整。linked_type 或 linked_id 语义可能变化；guest_participant 指向的行 identity 已变 |
| **remove/withdraw/re-entry/display** | 简单。display 仅展示 `removed_at IS NULL` 的行；remove 只作用于 user row；withdraw 仅 user 有 | 需确保升级后行可被 user 的 withdraw 等逻辑正确识别 |
| **实现复杂度与风险** | 中。需新增 retire 语义、入口改造；不触碰 schema 约束 | 高。涉及 schema 约束、identity 迁移、可能影响外键与 RLS |

---

## 3. 推荐方案

**推荐：方案 A — User Row Canonical**

**理由：**
1. **与现有模型一致**：lifecycle 已假定 user participant 有 `user_id`，withdraw、re-entry 等均基于 user；guest 仅作为「未注册时的占位」。
2. **历史保留**：guest row 不物理 delete，通过 `removed_at` + 专用 `removal_note` / `action_type` 标记为 superseded，审计可追溯。
3. **不改 schema 约束**：`match_participants_exactly_one_identity` 保持不变，无需迁移。
4. **identity_links 不变**：guest_participant、contact 的 link 语义保持，仅 guest row 退出 active。
5. **实现路径清晰**：入口处增加「同 match 同 email 已有 guest 则先 retire」逻辑即可，风险可控。

---

## 4. Guest Row Retire / Supersede 语义（建议）

### 4.1 目标

- guest row 退出 active set
- 不物理 delete
- 保留历史与审计
- 与现有 exit 语义兼容

### 4.2 建议：复用 `removed_at` 机制

**原则：** 使用既有 `removed_at` / `removed_by` / `removal_note` 标记 guest row 为「已 superseded」，与现有「removed = 退出 active」语义一致。

**建议字段：**
- `removed_at` = now()
- `removed_by` = 触发 supersede 的 actor（如 system / user_id 在 accept 时）
- `removal_note` = 专用文案，如 `Superseded by registered user (user_id=xxx)` 或 `Contact registered; user row is canonical`

### 4.3 Action Log 语义

**建议：** 新增 `action_type` 值 `superseded_by_registered_user`（或 `supersede`），用于 `match_participant_actions`。

- 需在 `match_participant_actions_action_type_chk` 中增加该值
- `note` 可记录：`Canonical row: participant_id=xxx` 或类似

**可选：** 若暂不扩展 action_type，可用 `removal_note` 承载语义，action_type 用 `remove` 或 `revoke_invite` 等近似值；但 `superseded_by_registered_user` 更清晰，便于审计与报表。

### 4.4 实现方式（设计，不实施）

**选项 1：** 新增 internal helper `retire_guest_participant_superseded(p_guest_mp_id, p_actor_id, p_canonical_user_mp_id)`  
- 仅做 UPDATE + action log，不调用 `apply_participant_exit`（避免 `exit_kind` 语义混淆）
- 或：扩展 `apply_participant_exit` 支持 `exit_kind = 'supersede'`，但本轮**不改** apply_participant_exit

**选项 2：**  dedicated RPC `rpc_match_retire_guest_superseded(p_guest_mp_id, p_canonical_user_mp_id)`  
- SECURITY DEFINER，供 `rpc_match_accept_email_invitation` 或 reconcile 流程调用
- 内部逻辑：UPDATE guest row，INSERT action log

**选项 3：** 在入口（如 `rpc_match_accept_email_invitation`）内联写 retire 逻辑  
- 不新增 helper，逻辑集中在一处

**建议：** 选项 2 或 1，便于复用与测试；本轮仅设计，不实施。

---

## 5. 历史数据修复策略（设计，不实施）

### 5.1 识别重复行

**SQL 逻辑：**
```sql
-- 同一 match 中，guest 与 user 通过 email 关联，且均 removed_at IS NULL
SELECT mp_guest.id AS guest_mp_id, mp_user.id AS user_mp_id, ...
FROM match_participants mp_guest
JOIN guests g ON g.id = mp_guest.guest_id
JOIN match_participants mp_user ON mp_user.match_id = mp_guest.match_id AND mp_user.user_id IS NOT NULL
JOIN auth.users u ON u.id = mp_user.user_id
WHERE mp_guest.guest_id IS NOT NULL
  AND lower(trim(g.email)) = lower(trim(u.email::text))
  AND mp_guest.removed_at IS NULL
  AND mp_user.removed_at IS NULL;
```

### 5.2 决定保留哪一条

**按推荐方案 A：** 保留 user row 为 canonical，retire guest row。

- 保留：`mp_user`（user participant）
- Retire：`mp_guest`（guest participant），设置 `removed_at`, `removed_by`, `removal_note`，插入 `superseded_by_registered_user` action

### 5.3 处理 Stale Guest Confirmed Rows

**若 guest 已被 retire，但之前有 `status=confirmed` 且 `participant_accepted_at=NULL`：**
- 先执行 retire（supersede），再对 guest row 调用 `match_participant_reconcile_status` 已无意义（removed_at 已设，reconcile 会走 removal 分支）
- 若 guest 尚未 retire，仍为 active 且 stale：先调用 `match_participant_reconcile_status(id)` 修正 status，再执行 retire（若存在对应 user row）

**顺序：** 1) 识别重复行；2) 对 stale guest 做 reconcile（若仍 active）；3) retire guest row

### 5.4 一次性 Migration vs Admin Job

| 方式 | 优点 | 缺点 |
|------|------|------|
| **一次性 migration** | 一次执行，数据一致 | 需充分测试；回滚难 |
| **Admin script / job** | 可 dry-run、分批、人工审核 | 需运维执行 |

**建议：** 先做 **只读审计脚本**（Level 2），输出受影响行列表；再根据审计结果决定用 migration 还是 admin job。本轮不实施。

---

## 6. 未来入口改造建议（设计，不实施）

### 6.1 需改造的入口

| 入口 | 当前行为 | 建议改造 |
|------|----------|----------|
| `rpc_match_accept_email_invitation` | 仅检查 `user_id` 是否已存在；若不存在则创建 user row | 先检查同 match 中是否存在同 email 的 guest row；若存在，先 retire guest row，再创建 user row（或复用已有 user row） |
| `rpc_reconcile_identity_guest_participants` | 仅创建 identity_links，不修改 match_participants | 可选：在 link 创建后，触发「同 match 同 email 的 guest→user 合并」逻辑；或保持只读，由 accept 入口负责 |
| `rpc_reconcile_identity_after_magic_link` | 同上 | 同上 |

### 6.2 其他可能产生 user participant 的路径

- `rpc_match_request_join` — 仅 user，不涉及 guest
- `rpc_match_admit_user` / `rpc_match_invite_user` — 仅 user
- `rpc_match_nominate_user` — 仅 user

**结论：** 当前唯一会同时产生 guest + user 的路径是 **email invitation accept**。

### 6.3 改造优先级

1. **P0：** `rpc_match_accept_email_invitation` — 在创建 user row 前，检查并 retire 同 email 的 guest row
2. **P1：** 可选 — 在 reconcile_identity 流程中增加检测与告警，不自动 retire，仅记录或触发修复 job

---

## 7. 风险与实施分层

### Level 1：纯文档/规则确定（本轮上限）

| 内容 | 说明 |
|------|------|
| 本设计文档 | 定义 canonical 策略、retire 语义、历史修复思路 |
| 更新 `Match_Participant_Lifecycle_Canonical.md` | 增加「Canonical Row 规则」一节，说明「同一人同一 match 仅一条 active row」 |
| 更新 `00_AUTHORITATIVE_INDEX.md` | 引用本设计，标明「策略已定，实施待后续」 |

**不实施：** 任何代码、migration、RPC

---

### Level 2：只读审计 / Dry-Run 报告

| 内容 | 说明 |
|------|------|
| 审计 SQL / script | 输出：同一 match 中 guest+user 重复行列表 |
| Stale guest 报告 | 输出：`status=confirmed` 且 `participant_accepted_at IS NULL` 的 guest 行 |
| Dry-run 报告 | 模拟 retire 逻辑，输出「将被 retire 的 guest_mp_id」列表，不写库 |

**不实施：** 任何写操作

---

### Level 3：历史数据修复

| 内容 | 说明 |
|------|------|
| Retire script / migration | 对重复行执行 retire guest row |
| Stale status 修复 | 对 stale guest 调用 reconcile（若仍 active） |
| 验证 | 修复后再次审计，确认无重复、无 stale |

**依赖：** Level 1 文档、Level 2 审计结果

---

### Level 4：入口语义改造

| 内容 | 说明 |
|------|------|
| `rpc_match_accept_email_invitation` 改造 | 创建 user row 前先 retire 同 email guest row |
| 新增 `retire_guest_superseded` helper / RPC | 若采用方案 A 的选项 2 |
| `action_type` 扩展 | 增加 `superseded_by_registered_user` |

**依赖：** Level 1 文档、Level 3 历史修复完成（或与 Level 3 并行，需谨慎）

---

## 8. 总结

| 项目 | 结论 |
|------|------|
| **Canonical row 定义** | 同一真实人同一 match 在任意时刻最多一条 active row；用于 display / remove / withdraw / re-entry |
| **双 active rows** | 不允许；破坏 lifecycle、display、remove、reconcile |
| **推荐策略** | 方案 A：user row canonical，guest row retire/supersede |
| **Retire 语义** | 使用 `removed_at` / `removed_by` / `removal_note`；建议新增 `action_type = superseded_by_registered_user` |
| **历史修复** | 识别重复 → 对 stale guest 做 reconcile（若仍 active）→ retire guest row |
| **入口改造** | 优先改造 `rpc_match_accept_email_invitation` |
| **本轮范围** | 仅 Level 1（文档/规则），不实施任何代码或 migration |
