# Staging Merge Gate Runtime Checklist

## Scope

用于 `guest invitation` 改造在合并 `main` 前的运行时验收。  
目标：验证链路正确、权限正确、语义正确、无旧链误用。

---

## 0) Preflight

- [ ] 确认当前部署分支与 commit（记录 SHA）
- [ ] 确认 staging 使用的 DB 项目/连接
- [ ] 确认环境变量已配置：
  - [ ] `GUEST_INVITATION_SYSTEM_ACTOR_ID`
- [ ] 确认关键 migration 已应用：
  - [ ] `20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`
  - [ ] `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
  - [ ] `20260328010000_guest_invitation_rpc_permissions_hardening.sql`

---

## 1) Schema + Permission Gate

### 1.1 Anchor column and constraints

- [ ] 执行并确认有结果：

```sql
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'email_invitations'
  and column_name = 'match_participant_id';
```

- [ ] 执行并确认存在：

```sql
select conname
from pg_constraint
where conname = 'email_invitations_match_participant_id_fkey';
```

### 1.2 Guest RPC grants hardened

- [ ] 执行：

```sql
select routine_name, grantee, privilege_type
from information_schema.role_routine_grants
where specific_schema = 'public'
  and routine_name in (
    'rpc_email_invitation_accept_as_guest',
    'rpc_email_invitation_decline_as_guest'
  )
order by routine_name, grantee;
```

- [ ] 结果必须满足：
  - [ ] 包含 `anon`, `authenticated`, `service_role`
  - [ ] 不包含 `PUBLIC`

### 1.3 Batch A drop verification

- [ ] 执行：

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'rpc_email_invitation_update_flow_status';
```

- [ ] 预期：0 行

---

## 2) Invitation Create Gate (anchor behavior)

准备 3 组数据场景：

1. **唯一命中**：`match_id + target_email` 仅命中 1 条 active guest participant  
2. **0 命中**：无对应 active guest participant  
3. **多命中**：故意构造 ambiguous（同 match 下 email 对应多条 active guest participant）

### 2.1 Unique-hit create

- [ ] 发起 invitation create
- [ ] 校验 invitation：
  - [ ] `match_participant_id` 已写入

### 2.2 Zero-hit create

- [ ] 发起 invitation create
- [ ] 校验 invitation：
  - [ ] 允许创建
  - [ ] `match_participant_id` 为 `NULL`

### 2.3 Ambiguous create

- [ ] 发起 invitation create
- [ ] 预期：报错 `anchor_ambiguous_guest_participant`

---

## 3) Guest Accept Gate

### 3.1 Anchored invitation accept

- [ ] 调用 `rpc_email_invitation_accept_as_guest`
- [ ] 校验 participant 行：
  - [ ] 仅更新既有 guest participant
  - [ ] `participant_accepted_at` 已写
  - [ ] `participant_accepted_via='email_invitation'`
  - [ ] **不默认补写** `org_approved_at/org_approved_by`
- [ ] 校验 invitation 行：
  - [ ] `status='accepted'`
- [ ] 校验无新增 user participant row

### 3.2 Legacy fallback unique-hit

- [ ] 构造 `match_participant_id IS NULL` 的 invitation
- [ ] 调用 guest accept
- [ ] 预期：
  - [ ] 成功
  - [ ] 回填 `match_participant_id`

### 3.3 Legacy fallback zero-hit / ambiguous

- [ ] zero-hit 调用
  - [ ] 预期报错 `participant_not_found_for_invitation`
- [ ] ambiguous 调用
  - [ ] 预期报错 `participant_ambiguous_for_invitation`

---

## 4) Guest Decline Gate

### 4.1 Decline semantics

- [ ] 调用 `rpc_email_invitation_decline_as_guest`
- [ ] 校验 participant：
  - [ ] 按 `withdraw` 语义退出
  - [ ] 只作用于当前定位到的 guest participant
- [ ] 校验 invitation：
  - [ ] `status='declined'`

### 4.2 System actor audit

- [ ] 校验 decline action / invitation event：
  - [ ] actor 使用 `GUEST_INVITATION_SYSTEM_ACTOR_ID`
  - [ ] 可在审计表中追溯

---

## 5) Page Wiring Gate

- [ ] 访问 `/invitations/[id]`
- [ ] 确认按钮文案：
  - [ ] `Yes, I can come`
  - [ ] `No, I can't come`
  - [ ] `Register for PlayerHoods`
- [ ] 点击 Yes/No 后页面状态刷新正确（accepted/declined）
- [ ] 注册 CTA 跳转到 `/login?mode=register`
- [ ] 注册行为不回写当前 match participant

---

## 6) Legacy Isolation Gate

- [ ] 确认 invitation 页面主 CTA 不再经过旧 `rpc_email_invitation_accept/decline`
- [ ] 旧链函数仅视为 compat-only（未作为 guest 主链入口）
- [ ] 无旧 `InvitationActions` 组件残留入口

---

## 7) Merge Gate Decision

### Pass Criteria

- [ ] 上述 1~6 全部通过
- [ ] 无 blocker 级异常
- [ ] 失败场景均按预期 fail-fast

### Decision

- [ ] Ready to merge
- [ ] Ready with caveats（需列 caveats）
- [ ] Not ready（需列 blockers）

### Execution Record

- 执行人：
- 日期：
- 环境：
- 分支：
- Commit SHA：
- Caveats/Blockers：

