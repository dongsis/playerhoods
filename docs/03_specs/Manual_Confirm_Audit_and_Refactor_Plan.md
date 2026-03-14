# manual_confirm / manual_confirm_user 审查与重构计划

**状态：** 已实施（2026-03-22）  
**更新：** 2026-03

**实施摘要：**
- Phase 1: `20260322000000_manual_confirm_refactor_phase1_delegate_organizer.sql` — 放宽 delegate_confirm，允许 organizer 对 user 参与者调用
- Phase 2: API 改为组合调用；`manualConfirmParticipant` = delegate_confirm + org_approve；`manualConfirmUser` = admit_user + delegate_confirm
- Phase 3: `20260322000001_manual_confirm_refactor_phase3_deprecate_rpcs.sql` — manual_confirm* RPC 改为 stub
- Phase 4: `20260322000002_drop_manual_confirm_rpcs.sql` — 物理删除两个 RPC

---

## 背景

当前 match lifecycle 主干已清晰：
- 找人：`rpc_match_admission_targets`
- user admission：`rpc_match_admit_user`
- Contact Player admission：`rpc_match_nominate_guest`
- self confirm：`rpc_match_accept_invite`
- delegate confirm existing participant：`rpc_match_delegate_confirm_participant`
- organizer approve：`rpc_match_org_approve_participant`
- remove / withdraw：已分开
- re-entry：走 admission family，不走特例 delegate path

本审查判断 `rpc_match_manual_confirm` 与 `rpc_match_manual_confirm_user` 是否应从「核心领域 RPC」降级为「由现有主干函数组合实现的 organizer convenience action」。

---

## A. `rpc_match_manual_confirm` 真实语义拆解

### 签名与权限

```
rpc_match_manual_confirm(p_match_participant_id uuid, p_note text DEFAULT NULL)
```

- **调用者：** Organizer only（`is_match_organizer`）
- **目标：** 已有 pending **user** participant 行（guest 显式拒绝，用 `rpc_match_org_approve_participant`）

### 实际行为（逐行）

1. 校验：authenticated、participant 存在、organizer、user 行（非 guest）、非 removed
2. **UPDATE** `match_participants`：
   - `participant_accepted_at = COALESCE(participant_accepted_at, now())`
   - `participant_accepted_via = COALESCE(participant_accepted_via, 'manual')`
   - `manual_confirmed_by = auth.uid()`
   - `org_approved_at = COALESCE(org_approved_at, now())`
   - `org_approved_by = auth.uid()`
3. `match_participant_reconcile_status`
4. INSERT `match_participant_actions`：`action_type = 'manual_confirm'`

### 语义等价

| 步骤 | 主干 RPC | 说明 |
|------|----------|------|
| 1. 设置 participant 侧 | `rpc_match_delegate_confirm_participant` | 设置 participant_accepted_at、participant_accepted_via='delegate_manual'、manual_confirmed_by |
| 2. 设置 org 侧 | `rpc_match_org_approve_participant` | 设置 org_approved_at |

**障碍：** `rpc_match_delegate_confirm_participant` 对 **user** 参与者显式禁止 organizer 调用：

```sql
IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
  RAISE EXCEPTION 'organizer_use_manual_confirm_or_approve';
END IF;
```

因此，**当前无法**用 `delegate_confirm + org_approve` 组合替代 `manual_confirm`，除非放宽 delegate_confirm 的 caller gate，允许 organizer 对 user 调用。

### 差异点

| 项目 | manual_confirm | delegate_confirm + org_approve |
|------|----------------|-------------------------------|
| participant_accepted_via | `'manual'` | `'delegate_manual'` |
| action_type | `'manual_confirm'` | `'delegate_manual_confirm'` + `'approve'` |
| action log 条数 | 1 条 | 2 条 |

若允许 organizer 调用 delegate_confirm，则语义上等价，仅 audit trail 不同。

---

## B. `rpc_match_manual_confirm_user` 真实语义拆解

### 签名与权限

```
rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid)
```

- **调用者：** Organizer only
- **目标：** 尚未加入（或 removed）的 user；Target: InScope OR ShareGroup(organizer)

### 实际行为（两分支）

**分支 1：Re-entry（removed 行存在）**

1. 找到 `status='removed'` 的 participant 行
2. **UPDATE**：清除 removed_*，join_method='manual'，participant_accepted_at + org_approved_at 同时设置
3. reconcile
4. action log：`reenter` + `manual_confirm`

**分支 2：Fresh insert（无 removed 行）**

1. **INSERT** 新 participant：join_method='manual'，participant_accepted_at + org_approved_at 同时设置
2. reconcile
3. action log：`manual_confirm`

### 语义等价

| 步骤 | 主干 RPC | 说明 |
|------|----------|------|
| 1. 加人 / re-entry | `rpc_match_admit_user`（经 `rpc_match_invite_user`） | Organizer 调用 → join_method='invited'，org_approved_at 已设，participant_accepted_at=NULL |
| 2. participant 侧 | 需额外设置 participant_accepted_at | admit_user 的 organizer 分支**不**设 participant_accepted_at |
| 3. org 侧 | 已由 admit 完成 | org_approved_at 在 admit 时已设 |

**关键差异：** `rpc_match_admit_user` 的 organizer 分支：
- Fresh：`participant_accepted_at = NULL`，`org_approved_at = now()` → pending，等 user Accept
- Re-entry：同上，`participant_accepted_at = NULL`

而 `manual_confirm_user` 是**同时**设置 participant_accepted_at 和 org_approved_at → 直接 confirmed。

因此等价组合应为：

1. `rpc_match_invite_user(match_id, user_id)` → 加人 / re-entry，pending
2. `rpc_match_delegate_confirm_participant(new_mp_id)` → 设置 participant_accepted_at  
   - **但** organizer 对 user 被禁止调用
3. `rpc_match_org_approve_participant(new_mp_id)` → 在 admit 时已设，此处为 no-op

若允许 organizer 调用 delegate_confirm，则：

- **Fresh：** `invite_user` → 得到 mp_id → `delegate_confirm_participant(mp_id)` → `org_approve_participant(mp_id)`（admit 已设，可省略）
- **Re-entry：** 同上

实际上 `invite_user` 已设 org_approved_at，所以只需再设 participant_accepted_at 即可 confirmed。即：

- `invite_user` + `delegate_confirm_participant`（若 organizer 可调）

但 `invite_user` 的 re-entry 会写 `join_method='invited'`，而 `manual_confirm_user` 写 `join_method='manual'`。这是 join_method 的语义差异，不影响 confirmed 状态。

---

## C. 是否可被现有主干函数完全替代

### `rpc_match_manual_confirm`

| 条件 | 可替代性 |
|------|----------|
| 若**允许** organizer 调用 `delegate_confirm_participant` 对 user | **可替代**：`delegate_confirm_participant` + `org_approve_participant` |
| 若**不**放宽 delegate gate | **不可替代**：organizer 无法完成 participant 侧写入 |

### `rpc_match_manual_confirm_user`

| 条件 | 可替代性 |
|------|----------|
| 若**允许** organizer 调用 `delegate_confirm_participant` | **可替代**：`invite_user` + `delegate_confirm_participant`（org_approve 已由 invite 完成） |
| 若**不**放宽 | **不可替代**：无法在单次「加人+确认」中完成 participant 侧 |

**结论：** 两者都依赖「organizer 能否对 user 调用 delegate_confirm_participant」。若能放宽，则可完全由主干组合替代；若不能，则需保留。

---

## D. 推荐方案

### 方案选项

| 选项 | manual_confirm | manual_confirm_user | 说明 |
|------|----------------|---------------------|------|
| **A. 保留** | 保留 | 保留 | 不改动，维持现状 |
| **B. 降级为组合** | 废弃，前端改组合调用 | 废弃，前端改组合调用 | 需放宽 delegate gate |
| **C. 仅 manual_confirm 降级** | 废弃 | 保留 | manual_confirm_user 的 re-entry 与 join_method='manual' 有独立语义 |

### 推荐：**B. 降级为组合动作**

理由：

1. 两者均为「organizer 一键完成多步」的 convenience，无独立领域语义
2. 主干已覆盖：admit、delegate_confirm、org_approve
3. 放宽 delegate gate 仅影响「organizer 对 user 调用 delegate_confirm」——语义合理（organizer 代 user 确认）
4. 可减少 RPC 数量，统一走主干

**前提：** 需在 `rpc_match_delegate_confirm_participant` 中允许 organizer 对 **user** 参与者调用（guest 已允许）。

---

## E. 替代调用链（若废弃）

### `rpc_match_manual_confirm` 替代

```
1. rpc_match_delegate_confirm_participant(p_match_participant_id)
2. rpc_match_org_approve_participant(p_match_participant_id)
```

**注意：** 需先放宽 delegate_confirm 的 organizer 限制。

### `rpc_match_manual_confirm_user` 替代

**Canonical write path:** `rpc_match_admit_user`（organizer 经 `rpc_match_invite_user` 调用）

```
1. rpc_match_admit_user(p_match_id, p_target_user_id)  -- 加人/re-entry，得到新 mp
   （organizer 调用时经 rpc_match_invite_user 薄包装）
2. 从返回的 match_participants 取 id
3. rpc_match_delegate_confirm_participant(new_mp_id)  -- 设 participant_accepted_at
```

Organizer path in `rpc_match_admit_user` already satisfies organizer approval (`org_approved_at` set). Therefore `manualConfirmUser` only needs `delegateConfirmParticipant` after `admitUserToMatch` — no `orgApproveParticipant` call.

**join_method 差异：** 替代链为 `invited`，原为 `manual`。若产品要求区分「organizer 直接确认」与「邀请后接受」，可保留 `manual_confirm_user` 仅用于该语义；否则可接受 `invited`。

---

## F. 前端/API 受影响点

| 位置 | 当前调用 | 影响 |
|------|----------|------|
| `ParticipantGroups.tsx` | `manualConfirmParticipant(supabase, p.id)` | 需改为 `delegateConfirmParticipant` + `orgApproveParticipant` 组合 |
| `ManualConfirmUserForm.tsx` | `manualConfirmUser(supabase, matchId, userId)` | 需改为 `inviteUserToMatch` + `delegateConfirmParticipant` 组合 |
| `src/lib/api/matches.ts` | `manualConfirmParticipant`, `manualConfirmUser` | 可改为组合封装，或删除后由调用方直接组合 |

**ManualConfirmUserForm 使用情况：** 该组件**未**在 `page.tsx` 中渲染，属**死代码**。Organizer Admin 仅有 InviteUserForm、InviteGuestForm、AddGuestForm。若废弃 `manual_confirm_user`，可一并移除 ManualConfirmUserForm。

---

## G. 下一步最小实现方案（计划，不直接改）

### Phase 1：放宽 delegate_confirm 的 organizer gate

1. 修改 `rpc_match_delegate_confirm_participant`：
   - 对 **user** 参与者：移除 `organizer_use_manual_confirm_or_approve` 限制，允许 organizer 调用
   - 对 **guest**：保持现状（已允许）
2. 验证：organizer 对 pending user 调用 delegate_confirm 不再报错

### Phase 2：前端改为组合调用

1. **manual_confirm（现有 participant）：**
   - `ParticipantGroups`：将 `manualConfirmParticipant` 替换为 `delegateConfirmParticipant` + `orgApproveParticipant` 顺序调用
   - 或封装 `manualConfirmParticipantAsCombo` 内部做两步
2. **manual_confirm_user（按 user_id 加人）：**
   - 若保留 ManualConfirmUserForm 的入口：改为 `inviteUserToMatch` + `delegateConfirmParticipant`
   - 若确认为死代码：可删除 ManualConfirmUserForm 及 `manualConfirmUser` API

### Phase 3：废弃 RPC

1. 将 `rpc_match_manual_confirm`、`rpc_match_manual_confirm_user` 改为 stub，raise `deprecated_use_combo`
2. 更新文档、FACTS、PERMISSION_ARCHITECTURE
3. 后续 migration 中 DROP 两个 RPC

### 不在此轮改动的范围

- Contact Player 逻辑
- delegate 主线（仅放宽 organizer gate）
- remove / withdraw
- preferences
- naming model
- page layout
- 旧 migration 文件

---

## 附录：当前 schema 中 manual_confirm_user 的 re-entry 行为

`schema.sql` / `file.sql` 中 `rpc_match_manual_confirm_user` **支持** re-entry（IF FOUND 分支做 UPDATE）。  
迁移 `20260304124500` 曾禁止 re-entry，但后续迁移（如 `20260303121500`）又恢复。当前以 schema 为准：**支持 re-entry**。

替代链 `invite_user` 同样支持 re-entry（`rpc_match_admit_user` 有 re-entry 分支），故可完全覆盖。
