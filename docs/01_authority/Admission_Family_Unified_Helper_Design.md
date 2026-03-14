# Admission Family: Unified Helper Design — 审查与方案

**状态：** 设计 + 实现  
**优先级：** Priority 3  
**约束：** 保持外部 RPC 名称独立、仅内部 write-path 清理

---

## 1. 当前三个 admission 路径

| RPC | 调用者 | 目标 | join_method | participant_accepted_at | org_approved_at | nominated_by | action_type |
|-----|--------|------|-------------|-------------------------|-----------------|--------------|-------------|
| **request_join** | User (self) | auth.uid() | requested | now(), in_app | NULL | NULL | request_join |
| **admit_user (invite)** | Organizer | p_target | invited | NULL | now(), actor | NULL | invite |
| **admit_user (nominate)** | Non-org | p_target | nominated | NULL | NULL | actor | nominate |

---

## 2. 共有逻辑（fresh + re-entry）

**Re-entry:**
- 查找 `match_participants WHERE match_id AND user_id AND status='removed'`
- UPDATE: clear removed_at, removed_by, removal_note, confirmed_at
- 按 admission_kind 设置 join_method, participant_accepted_at, org_approved_at, nominated_by
- reconcile
- action log: reenter + (request_join | invite | nominate)

**Fresh:**
- INSERT match_participants
- reconcile
- action log: (request_join | invite | nominate)

---

## 3. Helper 设计

**名称:** `apply_participant_admission`

**签名:**
```sql
apply_participant_admission(
  p_match_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid,
  p_admission_kind text  -- 'requested' | 'invited' | 'nominated'
)
RETURNS match_participants
```

**职责:**
1. 查找 removed 行（re-entry）
2. 若找到：UPDATE + reconcile + action log (reenter + kind)
3. 若未找到：INSERT + reconcile + action log (kind)
4. 返回更新后的行

**不负责:** auth、permission、match/target 校验、already-participant 检查。

---

## 4. 实现交付摘要（2026-03-24）

### Migration

`supabase/migrations/20260324000000_admission_family_unified_helper.sql`

### 变更内容

- **新增**：`apply_participant_admission` 内部 helper
- **重构**：`rpc_match_admit_user` 将 fresh/re-entry 写入委托给 helper
- **重构**：`rpc_match_request_join` 将 fresh/re-entry 写入委托给 helper
- **未改**：`rpc_match_nominate_user` 仍为 thin wrapper，调用 `rpc_match_admit_user`

### 已保留的行为

- RPC 签名不变
- 权限 gate 不变（admit_user: can_admit_user_to_match；request_join: scope）
- join_method / participant_accepted_at / org_approved_at / nominated_by 语义不变
- action_type: request_join, invite, nominate
- re-entry: reenter + kind
- reconcile 仍调用 `match_participant_reconcile_status`

### 细微差异

- **status 不直接写入**：helper 不写 `status`，由 reconcile 推导（符合 00_AUTHORITATIVE_INDEX）
