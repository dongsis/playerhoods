# Match 函数分层与职责总览

**状态：** Authoritative  
**范围：** match 领域的 public RPC、wrapper、helper、分层边界  
**最后更新：** 2026-04-01

---

## 1. 这份文档解决什么问题

这份文档专门回答一个很实际的问题：

- 当前 match 领域里，哪些函数是主干 public RPC
- 哪些只是 thin wrapper
- 哪些是内部 helper
- 为什么有些函数虽然“看起来很像”，但不应该继续合并

它不是完整生命周期规则文档。  
生命周期、scope、re-entry、approval 规则的权威定义仍然以：

- `Match_Participant_Lifecycle_Canonical.md`
- `Match_Participation_Flows_and_Scope.md`

为准。

本文件的重点是：

- **函数分层**
- **职责边界**
- **调用关系**
- **哪些名字已经是 legacy**

---

## 2. 一句话总览

当前 match 领域建议按下面 5 层理解：

1. **Create / Read**
2. **Admission**
3. **Acceptance**
4. **Approval / Exit**
5. **Internal write core / reconcile**

其中：

- public RPC 负责表达产品动作、权限边界、错误语义
- wrapper 负责保留清晰的动作命名或兼容错误信息
- helper 负责统一底层数据库写法
- `match_participant_reconcile_status` 负责从字段推导最终状态

---

## 3. 当前主干 Public RPC

### 3.1 Create / Read

| 函数 | 职责 |
|------|------|
| `rpc_match_create` | 创建 match，并自动将 organizer 加为 confirmed participant |
| `rpc_match_admission_targets` | 统一返回 user / Contact Player 候选目标 |

### 3.2 Admission

| 函数 | 职责 |
|------|------|
| `rpc_match_request_join` | 用户自己申请加入比赛 |
| `rpc_match_admit_user` | user admission 的主写入口 |
| `rpc_match_invite_user` | organizer 语义的 user invite |
| `rpc_match_nominate_user` | participant 语义的 user nominate |
| `rpc_match_nominate_guest` | Contact Player / guest admission 主写入口 |

### 3.3 Acceptance

| 函数 | 职责 |
|------|------|
| `rpc_match_accept_invite` | 本人确认能参加 |
| `rpc_match_delegate_confirm_participant` | 代他人确认能参加 |
| `rpc_match_revoke_delegate_confirm_participant` | 撤销之前记录的代确认 |

### 3.4 Approval

| 函数 | 职责 |
|------|------|
| `rpc_match_org_approve_participant` | organizer 侧批准 |

### 3.5 Exit

| 函数 | 职责 |
|------|------|
| `rpc_match_user_withdraw` | 本人退出 / decline / leave |
| `rpc_match_remove_participant` | organizer 或其他授权 actor 移除 participant |

---

## 4. Thin Wrapper 层

当前真正意义上的 thin wrapper 主要有两个：

| 函数 | 包装谁 | 为什么保留 |
|------|--------|-----------|
| `rpc_match_invite_user` | `rpc_match_admit_user` | 保留 organizer-only 的清晰产品语义；保留兼容错误信息 |
| `rpc_match_nominate_user` | `rpc_match_admit_user` | 保留 participant nominate 的清晰产品语义；保留 caller gate 语义 |

这两个 wrapper 从“代码去重”角度看可以再瘦，但从“产品动作表达”和“调用方可读性”看，**保留是合理的**。

---

## 5. Internal Helper 层

### 5.1 `apply_participant_admission`

这是 **user admission** 的底层写入核心。

它统一处理：

- fresh insert 还是 removed row re-entry
- `join_method` 怎么写
- `participant_accepted_at` 和 `org_approved_at` 初始怎么写
- action log 怎么记
- 最后如何 reconcile

它服务的 public RPC 主要是：

- `rpc_match_request_join`
- `rpc_match_admit_user`
- 以及间接服务 `rpc_match_invite_user` / `rpc_match_nominate_user`

注意：

- `rpc_match_nominate_guest` **不走** 这个 helper
- Contact Player / guest 目前仍有自己的 admission 写路径

### 5.2 `apply_participant_acceptance`

这是 participant-side acceptance 的底层写入核心。

它统一处理：

- 写 `participant_accepted_at`
- 写 `participant_accepted_via`
- self accept 时不写 `manual_confirmed_by`
- delegate confirm 时写 `manual_confirmed_by`
- 最后 reconcile

它服务的 public RPC 主要是：

- `rpc_match_accept_invite`
- `rpc_match_delegate_confirm_participant`

注意：

- `rpc_match_revoke_delegate_confirm_participant` **不走** 这个 helper
- 因为 revoke 不是“写入 acceptance”，而是“撤回之前已经写入的 acceptance”

### 5.3 `apply_participant_exit`

这是 exit 的底层写入核心。

它统一处理：

- 写 `removed_at`
- 写 `removed_by`
- 写 `removal_note`
- 区分 `withdraw` 与 `remove`
- 写 action log
- 最后 reconcile 成 removed

它服务的 public RPC 主要是：

- `rpc_match_user_withdraw`
- `rpc_match_remove_participant`

### 5.4 `match_participant_reconcile_status`

这是整个 participant lifecycle 的状态归并核心。

它不表达产品动作，只负责根据字段推导最终状态：

- `removed_at IS NOT NULL -> removed`
- `participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL -> confirmed`
- 否则 -> `pending`

当前模型里：

- public RPC 不应该直接写最终 `status`
- helper 也不应该绕开 reconcile 去硬写 `confirmed`

---

## 6. App-side 组合层

除了数据库 public RPC，还有一层前端 / API client 组合动作：

| 名称 | 组合逻辑 | 作用 |
|------|----------|------|
| `manualConfirmParticipant` | `delegate_confirm_participant + org_approve_participant` | organizer 对已有 pending row 执行“manual confirm”语义 |
| `manualConfirmUser` | `admit_user + delegate_confirm_participant` | organizer 对尚未入场的 user 执行“manual confirm by user id”语义 |

这两个动作现在是 **组合动作**，不是独立 canonical DB RPC。

所以：

- `manual confirm` 仍然是产品语义
- 但已经不再是数据库主干函数名

---

## 7. 为什么这些函数不建议继续合并

### 7.1 `rpc_match_request_join` 不建议 wrap `rpc_match_admit_user`

虽然它们都属于 admission 家族，但公开语义不同：

- `request_join` 是 **self action**
- `admit_user` 是 **add other user**

而且两者写入结果不同：

- `request_join` -> `requested`
- `admit_user` -> `invited` 或 `nominated`

它们已经在 helper 层统一到底：

- 都通过 `apply_participant_admission` 进入底层写模型

所以当前最好的结构是：

- **public RPC 分开**
- **internal helper 统一**

### 7.2 `rpc_match_delegate_confirm_participant` 不建议 wrap `rpc_match_accept_invite`

虽然两者都属于 acceptance 家族，但公开语义不同：

- `accept_invite` 是 **self accept**
- `delegate_confirm_participant` 是 **delegate accept**

而且：

- 参数不同
- caller gate 不同
- guest 分支 side effect 不同

它们已经在 helper 层统一到底：

- 都通过 `apply_participant_acceptance` 写 participant-side acceptance

所以也应该保持：

- **public RPC 分开**
- **internal helper 统一**

### 7.3 `withdraw / remove / revoke_delegate_confirm` 不建议合并成一个统一 public RPC

原因是：

- `withdraw` 和 `remove` 属于 **exit**
- `revoke_delegate_confirm` 属于 **acceptance rollback**

前两者最终会把 row 送进 removed；  
后者不会 removed，而是把 row 拉回 pending。

所以它们不应该在 public API 层被硬并成一个多模式 RPC。

当前最合理的结构是：

- exit 用 `apply_participant_exit`
- acceptance rollback 单独保留 `rpc_match_revoke_delegate_confirm_participant`

---

## 8. 当前 Legacy / Removed 名单

下面这些名字不应再作为当前主干函数使用：

- `rpc_match_manual_confirm`
- `rpc_match_manual_confirm_user`
- `rpc_match_delegate_confirm_user`
- `rpc_match_delegate_manual_confirm_targets`
- `rpc_match_add_guest_org`
- `rpc_match_add_guest_participant`
- `rpc_match_invite_guest_from_roster`
- `rpc_match_invite_targets`
- `rpc_match_nominate_targets`
- `can_add_guests`

注意：

- 它们可能仍出现在 archive、baseline、历史 truth-check、历史设计文档里
- 这些历史出现并不代表它们仍是现行模型

---

## 9. 当前推荐阅读顺序

如果要理解当前 match 底层实现，推荐按下面顺序阅读：

1. `Match_Function_Layering_Canonical.md`  
   先建立函数分层概念

2. `Match_Participant_Lifecycle_Canonical.md`  
   再理解 admission / acceptance / approval / exit 的状态语义

3. `Match_Participation_Flows_and_Scope.md`  
   再理解 caller gate、target gate、scope、re-entry

4. `PERMISSION_ARCHITECTURE_v1.md`  
   最后理解 helper、predicate、RPC 的权限层次

---

## 10. 一张最简结构图

```text
Create / Read
  rpc_match_create
  rpc_match_admission_targets

Admission
  rpc_match_request_join
  rpc_match_admit_user
    -> rpc_match_invite_user
    -> rpc_match_nominate_user
  rpc_match_nominate_guest

Acceptance
  rpc_match_accept_invite
  rpc_match_delegate_confirm_participant
  rpc_match_revoke_delegate_confirm_participant

Approval
  rpc_match_org_approve_participant

Exit
  rpc_match_user_withdraw
  rpc_match_remove_participant

Internal write core
  apply_participant_admission
  apply_participant_acceptance
  apply_participant_exit
  match_participant_reconcile_status
```

---

## 11. 结论

当前 match 领域最重要的结构原则是：

- **public RPC 负责表达动作**
- **wrapper 负责表达清晰语义**
- **helper 负责统一底层写法**
- **reconcile 负责导出最终状态**

不要为了减少函数数量，而把不同产品动作硬合并。  
当前更重要的目标不是“继续并函数”，而是：

- 保持 public RPC 清晰
- 保持 helper 边界稳定
- 清理 legacy 文档和残留概念
