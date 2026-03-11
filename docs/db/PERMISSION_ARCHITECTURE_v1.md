# 权限架构：Helper / 谓词 / RPC 分层

**目标**：用 Helper 和谓词函数统一 RPC 权限逻辑，减少漂移。

---

## 1. 分层定义

| 层级 | 职责 | 示例 |
|------|------|------|
| **Helper** | 单一事实查询，不组合业务规则 | `is_match_organizer(match_id, user_id)` |
| **谓词 (Predicate)** | 组合 helpers，表达业务权限 | `can_invite_user(match_id, caller_id)` |
| **RPC** | 调用谓词做 caller gate，再执行业务 | `rpc_match_invite_user` |

---

## 2. Helper 清单（约 10 个）

**原则**：Helper 只做「是否存在 / 是否满足」的原子查询，不包含 OR/AND 业务组合。

| Helper | 签名 | 依赖 | 用途 |
|--------|------|------|------|
| `is_match_organizer` | (match_id, user_id) → bool | matches | 是否组织者 |
| `is_user_in_scope_groups` | (scope_group_ids[], user_id) → bool | group_members | 是否在 scope 群组内 |
| `is_user_in_match_scope` | (match_id, user_id) → bool | matches, is_group_active_member | 是否在 match scope |
| `is_user_match_associated` | (match_id, user_id) → bool | match_participants, identity_links | 是否有关联参与者（含 identity-linked guest） |
| `is_match_participant_confirmed` | (match_id, user_id) → bool | match_participants | 是否已确认参与者 |
| `do_users_share_group` | (user_a, user_b) → bool | group_members, groups (friend) | 是否共享 friend 群组 |
| `sharegroup_exists` | (user_a, user_b) → bool | 同 do_users_share_group | RLS 用，语义同 do_users_share_group |
| `is_group_active_member` | (group_id, user_id) → bool | group_members | 是否群组活跃成员 |
| `is_group_boundary_keeper` | (group_id, user_id) → bool | groups | 是否群组 boundary keeper |
| `is_club_admin` | (club_id) → bool | club_admins, profiles | 是否俱乐部管理员 |

**可选 / 合并**：
- `is_caller_in_match_scope(match_id)` = `is_user_in_match_scope(match_id, auth.uid())` — 可保留为 caller 专用 wrapper
- `is_caller_match_associated(match_id)` = `is_user_match_associated(match_id, auth.uid())` — 同上
- `match_organizer_id(match_id)` — 纯取值，可算 helper

---

## 3. 谓词清单（约 8 个）

**原则**：谓词 = 业务权限判断，由 1～3 个 helper 组合而成。

| 谓词 | 组合逻辑 | 使用的 Helpers |
|------|----------|----------------|
| `can_invite_user` | 组织者 OR (can_participants_invite_users AND 已确认) | is_match_organizer, is_match_participant_confirmed |
| `can_add_guests` | 组织者 OR (can_participants_add_guests AND 已确认) | is_match_organizer, is_match_participant_confirmed |
| `can_manage_participants` | 组织者 OR (can_participants_manage_participants AND 已确认) | is_match_organizer, is_match_participant_confirmed |
| `can_nominate_user` | 非组织者 AND (in_scope OR match_associated) AND can_participants_invite_users | is_match_organizer, is_user_in_match_scope, is_user_match_associated |
| `can_delegate_confirm_user` | 非组织者 AND (in_scope OR match_associated) | is_match_organizer, is_user_in_match_scope, is_user_match_associated |
| `can_nominate_guest` | 组织者 OR match_associated | is_match_organizer, is_user_match_associated |
| `can_invite_target` | 目标 in_scope OR share_group(target, organizer) | is_user_in_match_scope, do_users_share_group, match_organizer_id |
| `can_group_invite_user` | boundary_keeper OR (active_member AND share_group(caller, target)) | is_group_boundary_keeper, is_group_active_member, do_users_share_group |

---

## 4. RPC → 谓词映射

每个 RPC 的 caller gate 用 1～2 个谓词表达。

### Match RPCs

| RPC | Caller Gate（谓词） | Target Gate（如适用） |
|-----|---------------------|------------------------|
| `rpc_match_invite_user` | `can_invite_user(match_id, auth.uid())` | `can_invite_target(match_id, target_user_id)` |
| `rpc_match_request_join` | `is_user_in_match_scope(match_id, auth.uid())` | — |
| `rpc_match_nominate_user` | `can_nominate_user(match_id, auth.uid())` | `do_users_share_group(auth.uid(), target)` AND target 非 match_associated |
| `rpc_match_nominate_guest` | `can_nominate_guest(match_id, auth.uid())` | guest in roster |
| `rpc_match_accept_invite` | 自己是参与者 | — |
| `rpc_match_org_approve_participant` | `is_match_organizer(match_id, auth.uid())` | — |
| `rpc_match_manual_confirm` | `is_match_organizer(match_id, auth.uid())` | — |
| `rpc_match_manual_confirm_user` | `is_match_organizer(match_id, auth.uid())` | `can_invite_target(match_id, target)` |
| `rpc_match_delegate_confirm_participant` | `can_delegate_confirm_user(match_id, auth.uid())` | `do_users_share_group(auth.uid(), participant)` |
| `rpc_match_delegate_confirm_guest` | `is_user_match_associated(match_id, auth.uid())`（任意参与者） | — |
| `rpc_match_delegate_confirm_user` (re-entry) | `can_delegate_confirm_user` | `do_users_share_group` |
| `rpc_match_remove_participant` | `is_match_organizer` OR `can_manage_participants` | — |
| `rpc_match_user_withdraw` | 自己是参与者 | — |
| `rpc_match_admission_targets` | organizer OR (can_participants_invite + InScope/MatchAssociated) | — |
| `rpc_match_delegate_manual_confirm_targets` | `can_delegate_confirm_user` | — |

### Group RPCs

| RPC | Caller Gate | Target Gate |
|-----|-------------|-------------|
| `rpc_group_invite_user` | `can_group_invite_user(group_id, auth.uid(), target_id)` | — |

### Club / Roster / 其他

| RPC | Caller Gate |
|-----|-------------|
| `rpc_club_admin_grant` | `is_club_admin(club_id)` |
| `rpc_roster_guest_contact_links` | 每个 guest 在 caller roster | — |

---

## 5. 谓词 → Helper 依赖图

```
can_invite_user
  ├── is_match_organizer
  └── is_match_participant_confirmed

can_add_guests
  ├── is_match_organizer
  └── is_match_participant_confirmed

can_manage_participants
  ├── is_match_organizer
  └── is_match_participant_confirmed

can_nominate_user
  ├── is_match_organizer (NOT)
  ├── is_user_in_match_scope
  ├── is_user_match_associated
  └── matches.can_participants_invite_users

can_delegate_confirm_user
  ├── is_match_organizer (NOT)
  ├── is_user_in_match_scope
  └── is_user_match_associated

can_nominate_guest
  ├── is_match_organizer
  └── is_user_match_associated

can_invite_target
  ├── is_user_in_match_scope(match_id, target)
  ├── do_users_share_group(target, organizer)
  └── match_organizer_id / is_match_organizer

can_group_invite_user
  ├── is_group_boundary_keeper
  ├── is_group_active_member
  └── do_users_share_group
```

---

## 6. 数量汇总

| 类型 | 数量 | 说明 |
|------|------|------|
| **Helper** | 10 | 原子查询，无业务组合 |
| **谓词** | 8 | 组合 helpers，表达业务权限 |
| **Match RPC** | ~16 | 每个用 1～2 个谓词 + 0～1 个 target 谓词 |
| **Group RPC** | 1 | 用 1 个复合谓词 |

---

## 7. 实施建议

1. **先统一 Helper**：确保 `is_user_match_associated` 含 identity_links，`do_users_share_group` 限定 friend。
2. **谓词集中定义**：新建 `predicates.sql` 或 migration，所有谓词显式 CREATE。
3. **RPC 只调谓词**：RPC 内用 `IF NOT predicate(...) THEN RAISE`，不再内联 helpers 组合。
4. **RLS 复用**：RLS 继续用 helper（如 `is_match_organizer`, `sharegroup_exists`），不直接调谓词。
5. **文档同步**：`Match_Participation_Flows_and_Scope.md` 的「Scope & helper」表与本文档对齐。

---

## 8. 与现有代码的对应

| 现有 | 归类 |
|------|------|
| `is_match_organizer`, `is_user_in_scope_groups`, `is_user_in_match_scope`, `is_user_match_associated`, `do_users_share_group`, `sharegroup_exists`, `is_match_participant_confirmed`, `is_group_active_member`, `is_club_admin` | Helper |
| `can_add_guests`, `can_invite_users`, `can_manage_participants` | 谓词（已存在） |
| `is_caller_in_match_scope`, `is_caller_match_associated` | caller 专用 wrapper，可保留 |
| `is_match_participant_active` | Helper（与 confirmed 区分：pending+confirmed） |
| `group_boundary_keeper_id` | Helper（取值） |
| `match_organizer_id` | Helper（取值） |

**需新增的谓词**：
- `can_nominate_user`
- `can_delegate_confirm_user`
- `can_nominate_guest`
- `can_invite_target`
- `can_group_invite_user`

**需新增的 Helper**（如尚未有）：
- `is_group_boundary_keeper(group_id, user_id)` — 若目前只有 `group_boundary_keeper_id`，可封装为 `= auth.uid()`
