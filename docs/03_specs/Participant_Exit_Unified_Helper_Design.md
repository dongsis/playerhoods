# Participant Exit: Unified Helper Design — 审查与方案

**状态：** 已实现（migration `20260323000000_participant_exit_unified_helper.sql`）  
**优先级：** 下一优先级  
**约束：** 不合并外部 RPC、不改 admission/delegate/reset/Contact Player/preferences/naming/页面布局、不改旧 migration

---

## A. 当前 `rpc_match_remove_participant` 内部逻辑拆解

**签名：** `rpc_match_remove_participant(p_match_participant_id uuid)`

**步骤：**

1. **认证**  
   - `auth.uid() IS NULL` → `not_authenticated`

2. **查找参与者**  
   - `SELECT * FROM match_participants WHERE id = p_match_participant_id`  
   - 未找到 → `Participant not found`

3. **权限 gate**  
   - Organizer **或** (已确认参与者 **且** `can_participants_manage_participants`)  
   - 否则 → `You do not have permission to remove participants`

4. **幂等**  
   - `removed_at IS NOT NULL` → 直接返回，不写 log

5. **语义 action_type 与 note**（基于移除前状态）  
   - `reject_request` / `Request rejected` — requested + 未 confirmed  
   - `revoke_invite` / `Invitation revoked` — invited + 未 confirmed  
   - `reject_nomination` / `Nomination rejected` — nominated + 未 confirmed  
   - `remove_confirmed` / `Removed by organizer` — 已 confirmed  
   - `remove` / `Removed (join_method=...)` — 其他

6. **写入 match_participants**  
   - `removed_at = now()`  
   - `removed_by = auth.uid()`  
   - `removal_note = v_log_note`

7. **Reconcile**  
   - `match_participant_reconcile_status(p_match_participant_id)`

8. **Action log**  
   - `INSERT match_participant_actions (action_type, note, created_by)`  
   - `action_type = v_log_type`，`note = v_log_note`，`created_by = auth.uid()`

9. **返回**  
   - `SELECT * FROM match_participants WHERE id = p_match_participant_id`

**不涉及：** domain_events、通知、email 发送。

---

## B. 当前 `rpc_match_user_withdraw` 内部逻辑拆解

**签名：** `rpc_match_user_withdraw(p_match_id uuid)`

**步骤：**

1. **认证**  
   - `auth.uid() IS NULL` → `not_authenticated`

2. **查找参与者**  
   - `SELECT * FROM match_participants WHERE match_id = p_match_id AND user_id = auth.uid()`  
   - 未找到 → `You are not a participant in this match`  
   - 仅支持 user 参与者（`user_id`），guest 不能 withdraw

3. **幂等**  
   - `removed_at IS NOT NULL` → 直接返回，不写 log

4. **语义 action_type 与 note**（基于移除前状态）  
   - `decline` / `User declined invitation` — invited + 未 confirmed  
   - `decline` / `User declined nomination` — nominated + 未 confirmed  
   - `withdraw` / `User left match` — 已 confirmed  
   - `withdraw` / `User withdrew` — 其他

5. **写入 match_participants**  
   - `removed_at = now()`  
   - `removed_by = auth.uid()`  
   - `removal_note = v_log_note`

6. **Reconcile**  
   - `match_participant_reconcile_status(v_mp.id)`

7. **Action log**  
   - `INSERT match_participant_actions (action_type, note, created_by)`  
   - `action_type = v_log_type`，`note = v_log_note`，`created_by = auth.uid()`

8. **返回**  
   - `SELECT * FROM match_participants WHERE id = v_mp.id`

**不涉及：** domain_events、通知、email 发送。

---

## C. 两者共有逻辑

| 步骤 | 内容 |
|------|------|
| 1 | 认证检查 |
| 2 | 幂等：`removed_at IS NOT NULL` → 直接返回 |
| 3 | 写入 `match_participants`：`removed_at = now()`, `removed_by = <actor>`, `removal_note = <note>` |
| 4 | `match_participant_reconcile_status(p_mp_id)` |
| 5 | `INSERT match_participant_actions (match_id, match_participant_id, action_type, note, created_by)` |
| 6 | 返回更新后的 `match_participants` 行 |

**字段写入完全相同的部分：**

- `removed_at = now()`
- `removed_by`（来源不同：remove 用 auth.uid()，withdraw 也用 auth.uid()，但语义不同：前者是移除者，后者是退出者本人）
- `removal_note`（内容不同，由各自语义决定）
- reconcile 调用方式相同
- action log 结构相同（`action_type`、`note`、`created_by` 由各自语义决定）

---

## D. 两者必须保留的差异

| 维度 | remove | withdraw |
|------|--------|----------|
| **调用者** | Organizer 或 (confirmed + can_manage) | 参与者本人 |
| **目标定位** | 按 `p_match_participant_id` | 按 `p_match_id` + `user_id = auth.uid()` |
| **目标范围** | 任意非 removed 参与者（含 user、guest） | 仅 user 参与者（guest 不能 withdraw） |
| **actor** | 移除者（auth.uid()） | 退出者本人（auth.uid()） |
| **removal_note 语义** | 管理侧（Request rejected / Invitation revoked / Nomination rejected / Removed by organizer） | 用户侧（User declined invitation / User declined nomination / User left match / User withdrew） |
| **action_type 集合** | `reject_request`, `revoke_invite`, `reject_nomination`, `remove_confirmed`, `remove` | `decline`, `withdraw` |
| **通知对象** | 被移除者 | 组织者 / 其他参与者（当前未实现 domain event） |

**结论：**

- actor 在 withdraw 时恒等于 participant 本人；在 remove 时恒等于移除者（非本人）。
- removal_note 和 action_type 必须按 remove / withdraw 分别计算。
- 目标查找方式不同（participant_id vs match_id + user_id）。

---

## E. 是否建议抽统一 helper

**建议：是。**

理由：

1. 写入、reconcile、action log 的流程高度一致。
2. 差异集中在：目标查找、actor、action_type、removal_note 的推导，这些都可以通过参数或子逻辑区分。
3. 未来若增加 domain event / 通知，可在 helper 内统一扩展，避免两处重复。
4. 与 `apply_participant_acceptance`、`apply_delegate_confirm_user_target` 等模式一致，便于维护。

---

## F. 推荐 helper 的职责与参数

**名称：** `apply_participant_exit`

**签名建议：**

```sql
apply_participant_exit(
  p_match_participant_id uuid,
  p_actor_id uuid,
  p_exit_kind text,  -- 'remove' | 'withdraw'
  p_removal_note text DEFAULT NULL  -- 可选，NULL 时由内部根据 mp 状态推导
)
RETURNS match_participants
```

**职责：**

1. 校验 `p_match_participant_id` 存在且 `removed_at IS NULL`（否则幂等返回）。
2. 根据 `p_exit_kind` 和当前 `mp` 状态推导 `action_type` 和 `removal_note`（若 `p_removal_note` 为 NULL）。
3. 更新 `match_participants`：`removed_at`, `removed_by`, `removal_note`。
4. 调用 `match_participant_reconcile_status`。
5. 插入 `match_participant_actions`。
6. 返回更新后的行。

**参数说明：**

- `p_match_participant_id`：要退出的参与者行 ID。
- `p_actor_id`：发起退出的人（remove 为移除者，withdraw 为本人）。
- `p_exit_kind`：`'remove'` 或 `'withdraw'`，用于选择 action_type / note 的推导规则。
- `p_removal_note`：可选；若提供则覆盖内部推导的 note。

**内部推导逻辑（伪代码）：**

```
IF p_exit_kind = 'remove' THEN
  action_type := CASE
    WHEN confirmed_at IS NULL AND join_method = 'requested'  THEN 'reject_request'
    WHEN confirmed_at IS NULL AND join_method = 'invited'    THEN 'revoke_invite'
    WHEN confirmed_at IS NULL AND join_method = 'nominated' THEN 'reject_nomination'
    WHEN confirmed_at IS NOT NULL                           THEN 'remove_confirmed'
    ELSE 'remove'
  END;
  removal_note := COALESCE(p_removal_note, CASE ... 同上语义 ...);
ELSIF p_exit_kind = 'withdraw' THEN
  action_type := CASE
    WHEN join_method IN ('invited','nominated') AND confirmed_at IS NULL THEN 'decline'
    ELSE 'withdraw'
  END;
  removal_note := COALESCE(p_removal_note, CASE ... 同上语义 ...);
END IF;
```

**可选扩展：** 若未来需要 domain event，可在 helper 末尾增加：

```sql
-- 预留：INSERT domain_events (event_type = 'match.participant_removed' | 'match.user_withdrew', ...)
```

---

## G. 最小实现方案（Plan）

### 阶段 1：新增 helper

1. 新建 migration：`YYYYMMDDHHMMSS_participant_exit_unified_helper.sql`。
2. 定义 `apply_participant_exit(p_match_participant_id, p_actor_id, p_exit_kind, p_removal_note)`。
3. 实现上述 6 项职责。
4. 不修改现有 RPC 签名。

### 阶段 2：重构 remove RPC

1. 在同一 migration 中重写 `rpc_match_remove_participant`：
   - 保留认证、权限 gate、幂等。
   - 查找参与者后，调用 `apply_participant_exit(p_match_participant_id, auth.uid(), 'remove', NULL)`。
   - 移除原有 UPDATE、reconcile、INSERT 等重复逻辑。

### 阶段 3：重构 withdraw RPC

1. 在同一 migration 中重写 `rpc_match_user_withdraw`：
   - 保留认证、self-only 查找。
   - 若找到参与者，调用 `apply_participant_exit(v_mp.id, auth.uid(), 'withdraw', NULL)`。
   - 移除原有 UPDATE、reconcile、INSERT 等重复逻辑。

### 阶段 4：验证

1. 确认 `rpc_match_remove_participant`、`rpc_match_user_withdraw` 签名不变。
2. 确认 `match_participant_actions` 的 action_type 集合不变。
3. 确认 reconcile 行为不变。
4. 可选：增加 validation migration，对 remove / withdraw 的典型场景做断言。

### 不做的部分

- 不合并两个 RPC。
- 不新增 domain event（除非后续明确需求）。
- 不修改 action_type 的约束。
- 不修改 `match_participants` 表结构。
- 不修改 `match_participant_reconcile_status`。

---

## 附录：与 apply_participant_acceptance 的类比

| 维度 | apply_participant_acceptance | apply_participant_exit（拟） |
|------|------------------------------|------------------------------|
| 用途 | 统一 participant 侧确认（accept / delegate） | 统一 participant 退出（remove / withdraw） |
| 参数 | mp_id, actor_id, is_self, action_type | mp_id, actor_id, exit_kind, removal_note |
| 写入 | participant_accepted_at, participant_accepted_via, manual_confirmed_by | removed_at, removed_by, removal_note |
| 后续 | reconcile | reconcile |
| 调用方 | accept_invite, delegate_confirm_participant, delegate_confirm_guest | remove_participant, user_withdraw |

---

## 参考文献

- [Remove_Logic_and_Page_Management](Remove_Logic_and_Page_Management.md)
- [Match_Participation_Flows_and_Scope](Match_Participation_Flows_and_Scope.md)
- [Organizer_Match_Operations](Organizer_Match_Operations.md)
- `supabase/migrations/20260305171000_fix_reconcile_set_status_removed_when_removed_at_set.sql`
- `file.sql`（rpc_match_remove_participant, rpc_match_user_withdraw 实现）

---

## 实现交付摘要（2026-03-23）

### A. Migration 文件名

`supabase/migrations/20260323000000_participant_exit_unified_helper.sql`

### B. 完整 Migration SQL

见上述 migration 文件。包含：
1. `apply_participant_exit(p_match_participant_id, p_actor_id, p_exit_kind, p_removal_note)`
2. 重构后的 `rpc_match_remove_participant`
3. 重构后的 `rpc_match_user_withdraw`

### C. Validation SQL

`supabase/validation/20260323000000_participant_exit_unified_helper_validation.sql`

### D. 变更内容

- **新增**：`apply_participant_exit` 内部 helper
- **重构**：`rpc_match_remove_participant` 将写入、reconcile、action log 委托给 helper
- **重构**：`rpc_match_user_withdraw` 将写入、reconcile、action log 委托给 helper
- **移除**：两个 RPC 中重复的 UPDATE、reconcile、INSERT 逻辑

### E. 已保留的行为

- **RPC 签名**：`rpc_match_remove_participant(p_match_participant_id uuid)`、`rpc_match_user_withdraw(p_match_id uuid)` 不变
- **权限 gate**：remove 仍为 organizer 或 (confirmed + can_manage)；withdraw 仍为 self-only
- **幂等**：已 removed 时直接返回，不写 action log（由 helper 内部处理）
- **action_type 语义**：remove 路径仍为 reject_request / revoke_invite / reject_nomination / remove_confirmed / remove；withdraw 路径仍为 decline / withdraw
- **removal_note 语义**：与原先一致
- **reconcile**：仍调用 `match_participant_reconcile_status`
- **action log**：非幂等路径仍插入一次 action log

### F. 实现中的细微差异

- **idempotent 检查位置**：原先由 RPC 在调用前检查 `removed_at` 并直接返回；现改为在 helper 内部检查。行为等价：已 removed 时均不写 action log，返回当前行。
- **withdraw 查找**：`rpc_match_user_withdraw` 仍通过 `match_id + user_id = auth.uid()` 查找参与者；若未找到，直接返回 "You are not a participant in this match"，不调用 helper。guest 参与者仍不能 withdraw（无 user_id）。
