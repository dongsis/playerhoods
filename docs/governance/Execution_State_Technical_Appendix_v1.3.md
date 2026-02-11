# Execution State & Technical Appendix — playerhoods.com (v1.2)

> **v1.3 Release**  
> This document is the authoritative v1.3 release.  
> Key semantics updated: request is group-based; invite/nominate are individual-based; removed is reversible via organizer reactivation (same participant record).


## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`

Status: **Authoritative + Frozen within v1.2**

> 本文件是 playerhoods.com v1.2 的最高执行规范。  
> 任何实现、重构、AI 协作、UI 设计必须遵守。  
> 若与其他文档、代码、实现产生冲突：**本文件优先级最高**。  
> 本文件内容在 v1.2 内冻结（除非进入 v2+ 或显式 Unfreeze v1.3）。
> See Appendix U — Frontend UI State Machine (v1.3) for all UI-only states and actions.
> Frontend behavior MUST conform to Appendix U and Appendix U1 (v1.3).

---

## 0. Authority & Precedence

**Precedence order (highest → lowest):**
1) This file: **Execution State & Technical Appendix (v1.2)**
2) Frozen Specs under `docs/specs/` (Contract & behavior specs)
3) Repo implementation (SQL/RPC/UI)
4) Notes / discussions / screenshots

---

## 1. Global Execution & Governance Invariants (Authoritative)

### 1.1 Migration Invariants
- Migrations are **append-only**
- 已存在的 migration 文件 **不可修改、不可重排**
- 任意 schema 变更必须通过 **新增 migration**
- 已 apply 的 migration 历史 **不可变**

### 1.2 Enum & Contract Invariants
- Enum 值与语义在 v1.x 内 **不可变**
- 不允许重新解释已有 enum 含义（no silent repurpose）
- Enum 语义变更必须引入 **新 contract version（v2+）**

### 1.3 Contract View Invariants
- Contract-level views **禁止使用 `table.*`**
- 必须显式列出字段
- 字段顺序是 contract 的一部分
- Schema 演进不得破坏既有 contract

---

## 2. Relationship & Scope Invariants (Authoritative)

### 2.1 Group & Relationship Model
- **Group 是唯一关系容器**
- 所有社会关系、权限、可见性均通过 Group 间接建立
- 🚫 禁止：Invite Set / Related Group / 隐式或虚拟 Group

### 2.2 Match Scope Definition
- Match **不建立关系**
- Match 仅引用：
  - organizer
  - participants
  - invitation scope（通过 Group）
- Match **不属于 Group**
- Match 仅作用于 Group 成员（通过 scope/eligibility 约束）

---

## 3. Status & State Invariants (Authoritative)

### 3.1 Status Explosion 禁止（Frozen）
**match.status（冻结）**
- active
- cancelled
- archived

**match_participants.status（冻结）**
- pending
- confirmed
- removed

🚫 明确禁止新增：
- formed
- rejected
- expired
- waitlisted
- declined（使用 removed 表达）

### 3.2 Derived Semantics Rule（Frozen）
所有业务语义必须通过组合解释，而非新增状态。例如：
- 是否成局 = derived（confirmed_count >= required_count）
- 是否可加入 = invitation scope + eligibility + flags
- 是否有权限 = role + match flags

### 3.3 v1.2 Dual Confirmation Model（Frozen within v1.2）
> v1.2 解冻并升级参与确认语义：**双边确认字段**驱动 confirmed，避免新增状态值。

Fields (append-only on `match_participants`):
- `user_accepted_at timestamptz null`
- `org_approved_at timestamptz null`
- `org_approved_by uuid null` (recommended)

Derived confirmation definition:
- **User participant** (`user_id is not null`):  
  confirmed iff `user_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL`
- **Guest participant** (`guest_id is not null`):  
  confirmed iff `org_approved_at IS NOT NULL`

Status synchronization rule:
- If derived-confirmed becomes true → status MUST be set to `confirmed`
- Otherwise keep `pending`
- `removed` is terminal

---

## 4. Behavior & Authority Invariants (Authoritative)

### 4.1 State Transition Rules（Frozen）
- 所有状态变更必须通过 **RPC**
- 禁止：
  - 前端直写 status
  - SQL 直接 update 状态（除 migration 内定义函数/触发器外）
- RLS 只负责：是否能进入（门禁）
- RPC 负责：如何流转（状态机）

### 4.2 Participation Paths（Frozen）
- Invite = Push（他人发起）
- Request = Pull（本人发起）
- 两条通路**语义不同**，但都落在 `match_participants`

### 4.3 Role & Authority（Frozen）
- `join_method` 是历史事实，不可覆盖
- Participant ≠ Organizer
- Participant 权限只能通过 match flags 明确授予
- 🚫 不存在：隐式升级 / 自动继承

### 4.4 v1.2 Status Synchronization Rule（Frozen）
任何会修改以下字段的 RPC 必须调用 reconcile helper：
- `user_accepted_at`
- `org_approved_at`

---

## 5. Guest Invariants (Authoritative)

### 5.1 Guest Identity Model（Frozen）
- Guest 永远通过 `match_participants` 表达
- guest ≠ user
- guest 无 `user_accepted_at`（无 user-side confirmation）

### 5.2 Guest Initial State Rule（Frozen, v1.2）
Guest 的初始状态只取决于**创建者身份**（不再依赖 admission_mode）：

- **ORG 添加 guest**：  
  `status = confirmed` 且 `org_approved_at = now()`
- **非 ORG（confirmed participant 且有权限）添加 guest**：  
  `status = pending`，必须由 ORG approve 后 confirmed

🚫 禁止：使用 `match.admission_mode` 控制 guest 初始状态（v1.2 已彻底移除 admission_mode）

---

## 6. Derived State Invariants (Formed) (Authoritative)

### 6.1 Formed Definition（Frozen）
Formed 不是 match.status  
`is_formed` 为派生状态：
- `is_formed = confirmed_count >= required_count`

### 6.2 formed_at Semantics（Frozen）
`formed_at` 是一次性事件：
- 首次达成阈值 → 写入
- 不回滚、不清空、不重复写

---

## 7. Tooling & Process Invariants (Authoritative)
- 所有结构变更必须通过 migration
- authenticated 行为必须在真实 auth context 下验证
- migration 历史分叉只能通过 migration repair 追认

---

## 8. Final Invariant Statement (Non-Negotiable)
任何违反上述不变量的实现：
- 即使更方便
- 即使更直觉
- 即使 UI 更好做  
👉 都必须被视为 v1.2 缺陷，而不是特性

---

# Slice Index (Authoritative)

> Slice 1–3 = 执行真理层  
> Slice 4 = 验证层（UI wiring + SSR auth hardening）  
> Slice 5+ = 演进讨论层

---

## Slice 1 — Core Schema & RLS (Authoritative)
Slice ID: S1  
Status: ✅ Applied & Verified  
Scope: Core schema + minimal RLS boundary enforcement  
Type: Schema / RLS / helper functions (no RPC behavior)

**Objective**
- 建立 v1 最小可运行数据库基础（tables/enums/constraints/helper functions）
- 建立最小 RLS 边界：Match/Participants 可见性与写入入口可表达
- Slice 1 不实现业务行为（Accept/Approve/Guest rules 等），这些属于 Slice 2（RPC）

**Notes (v1.2 compatibility)**
- Slice 1 的 status 集合仍冻结不变
- v1.2 仅在后续 Slice（migration append-only）追加字段与 RPC

**Migration reference**
- `supabase/migrations/<timestamp>_slice1_core_schema_rls.sql`

---

## Slice 2 — RPC & Participant Behavior Logic (Authoritative)
Slice ID: S2  
Status: ✅ Applied & Verified (v1.0–v1.1 semantics); **superseded by v1.2 addendum below**  
Scope: participant transitions via authenticated RPC  
Type: RPC functions + RLS收口（no UI, no derived state）

**Important**
- Slice 2 原始实现基于 v1.0–v1.1 的单边确认语义
- v1.2 引入 Dual Confirmation Model 后，Slice 2 的确认/确认 RPC 需要按 v1.2 规则调整（见“v1.2 Unfreeze + RPC Catalog”）

**Migration reference**
- `supabase/migrations/<timestamp>_slice2_rpcs_and_rls.sql`

---

## Slice 3 — Match Formed (Derived State) (Authoritative)
Slice ID: S3  
Status: ✅ Applied & Verified  
Scope: derived formed state + one-time formed_at event  
Type: Schema / View / Trigger (no behavior RPC)

**Rules**
- confirmed_count counts only `match_participants.status='confirmed'`
- formed_at is one-time write

**Migration reference**
- `supabase/migrations/<timestamp>_slice3_formed_derived.sql`

---

## Slice 4 — Minimal UI / API Consumption (Authoritative)
Slice ID: S4  
Status: ✅ Applied (UI wiring + SSR auth hardening + group creation stability)  
Scope: Minimal UI + API usage (no new behavior)  
Type: UI / Client Logic Only + hardening migrations

**Constraints**
Slice 4 不得新增核心语义，不得引入新状态，不得在前端猜测规则；所有按钮必须对应 RPC。

**Applied migrations (example list)**
- `YYYYMMDDHHMMSS_fix_rls_groups_recursion_v2.sql` — Fix RLS recursion (groups ↔ group_members) via security definer helpers.
- `YYYYMMDDHHMMSS_add_groups_insert_policy.sql` — groups INSERT policy.
- `YYYYMMDDHHMMSS_fix_groups_select_for_bk.sql` — include BK/creator in select.
- `YYYYMMDDHHMMSS_rpc_group_create.sql` — RPC: rpc_group_create.
- `YYYYMMDDHHMMSS_fix_rpc_group_create_add_creator_member.sql` — creator becomes GM-ACTIVE.

---

# v1.2 Unfreeze — Dual Confirmation Model (Authoritative)

Status: ✅ Applied

## Rationale
v1.0–v1.1 假设 requested 参与为单边确认（ORG confirm 即 confirmed）。  
foundation-stage 发现不符合真实约球语义，因此 v1.2 引入双边确认：

- 用户必须确认能来（availability confirmed）
- organizer 必须批准进入（approval）
- 两者可并行，无时序要求
- 用字段表达确认，避免状态爆炸

## Changes Introduced (append-only)
- Add fields to `match_participants`:
  - `user_accepted_at`
  - `org_approved_at`
  - `org_approved_by`
- Request join now implies immediate user acceptance:
  - `rpc_match_request_join` must set `user_accepted_at = now()`
- Confirmation semantics become derived:
  - user: both fields required
  - guest: org_approved only
- Status values remain frozen:
  - pending / confirmed / removed

## Verification Checklist
- User request sets `user_accepted_at` immediately
- ORG approve sets `org_approved_at`
- status flips to confirmed only when derived conditions are satisfied
- ORG rejection / removal results in removed and is terminal

---

# v1.2 RPC Catalog (Authoritative, Final)

## Principle
- 所有写操作必须走 RPC
- RPC 必须：
  1) 权限校验
  2) 写入确认字段（user_accepted_at / org_approved_at）
  3) 调用 reconcile helper 同步 status
  4) 记录审计字段（org_approved_by / invited_by / removed_by 等）

---

## 0) Internal helper

### `match_participant_reconcile_status(p_mp_id uuid) returns void`
**Purpose**: synchronize status using v1.2 derived confirmation rules.

**Rules**
- if status = removed: do nothing
- if guest participant:
  - org_approved_at not null → status=confirmed
- if user participant:
  - user_accepted_at and org_approved_at both not null → status=confirmed
- else keep pending

**Required**: any RPC modifying `user_accepted_at` or `org_approved_at` MUST call this helper.

---

## 1) Match lifecycle

### 1.1 `rpc_match_create(...) returns matches`
**Who**: authenticated user (becomes ORG)  
**Must do**
- insert matches row (`organizer_id = auth.uid()`)
- insert ORG participant row:
  - join_method='created'
  - status='confirmed'
  - org_approved_at=now()
  - org_approved_by=auth.uid()
  - (optional) user_accepted_at=now()

---

## 2) Joining (user participants)

### 2.1 `rpc_match_invite_user(p_match_id uuid, p_user_id uuid) returns match_participants`
**Who**: ORG only  
**Writes**
- join_method=invited
- status=pending
- org_approved_at=now()  (invite implies approval)
- org_approved_by=auth.uid()
- user_accepted_at=NULL
- invited_by=auth.uid() (if exists)

**After**: reconcile (will remain pending until user accepts)

---

### 2.2 `rpc_match_user_accept_invite(p_match_id uuid) returns match_participants`
**Who**: invitee self  
**Preconditions**
- participant exists for (match_id, auth.uid)
- join_method=invited
- status != removed

**Writes**
- user_accepted_at = coalesce(user_accepted_at, now())

**After**: reconcile (becomes confirmed if ORG already approved)

---

### 2.3 `rpc_match_request_join(p_match_id uuid) returns match_participants`
**Who**: user self  
**Key v1.2 rule**: request implies immediate user acceptance

**Writes**
- join_method=requested
- status=pending
- user_accepted_at=now()
- org_approved_at=NULL

**After**: reconcile (if ORG already approved, becomes confirmed immediately)

---

### 2.4 `rpc_match_org_approve_participant(p_mp_id uuid) returns match_participants`
**Who**: ORG only  
**Writes**
- org_approved_at = coalesce(org_approved_at, now())
- org_approved_by = auth.uid()

**After**: reconcile (user participant becomes confirmed if user_accepted_at exists)

---

### 2.5 `rpc_match_user_withdraw(p_match_id uuid) returns match_participants`
**Who**: user self  
**Writes**
- status=removed
- removed_at=now() (if exists)
- removed_by=auth.uid() (if exists)

**Notes**: terminal; user no longer counted in formed_count

---

## 3) Nomination by participants (MP assist)

### 3.1 `rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) returns match_participants`
**Who**
- confirmed participant
- AND match.can_add_participants = true

**Semantics**
- nomination is NOT invitation
- nomination creates a requested pending record only

**Writes**
- join_method=requested
- status=pending
- user_accepted_at=NULL
- org_approved_at=NULL
- nominated_by=actor (if exists)

**After**: reconcile (no-op)

**Anti-abuse (recommended)**
- nomination quota per actor per match: N

---

## 4) Guests

### 4.1 `rpc_match_add_guest_by_org(p_match_id uuid, p_guest_name text, ...) returns match_participants`
**Who**: ORG only  
**Writes**
- join_method=guest_added (or enum name guest_add)
- status=confirmed
- org_approved_at=now()
- org_approved_by=auth.uid()
- invited_by=auth.uid() (if exists)

---

### 4.2 `rpc_match_add_guest_by_participant(p_match_id uuid, p_guest_name text, ...) returns match_participants`
**Who**
- confirmed participant
- AND match.can_add_participants = true

**Writes**
- join_method=guest_added
- status=pending
- org_approved_at=NULL
- invited_by=actor (if exists)

**After**: reconcile (no-op until ORG approves)

---

## 5) Removal / Rejection

### 5.1 `rpc_match_remove_participant(p_mp_id uuid) returns match_participants`
**Who**
- ORG always
- OR confirmed participant AND match.can_remove_participants=true

**Writes**
- status=removed
- removed_at=now() (if exists)
- removed_by=actor (if exists)
- removed_reason optional (recommended)

**Semantics**
- reject is represented by removed (+ reason), not a new status

---

## 6) Read-side constraints (Authoritative)

### 6.1 Visibility defaults
- User default: sees only `status != removed`
- ORG may see removed for audit/replay

### 6.2 Formed counting
- confirmed_count counts only `status='confirmed'`
- formed_at remains one-time write at first threshold crossing

---

# v1.2 Permission Matrix (Authoritative)

| RPC | ORG | Confirmed participant (cap enabled) | Pending participant | Outsider | Target user(self) |
|---|---:|---:|---:|---:|---:|
| rpc_match_create | ✅ | — | — | — | — |
| rpc_match_invite_user | ✅ | ❌ | ❌ | ❌ | — |
| rpc_match_user_accept_invite | — | — | — | — | ✅ |
| rpc_match_request_join | — | — | — | ✅ (if eligible) | ✅ |
| rpc_match_org_approve_participant | ✅ | ❌ | ❌ | ❌ | — |
| rpc_match_nominate_user | ✅(optional) | ✅ | ❌ | ❌ | — |
| rpc_match_add_guest_by_org | ✅ | ❌ | ❌ | ❌ | — |
| rpc_match_add_guest_by_participant | ❌ | ✅ | ❌ | ❌ | — |
| rpc_match_user_withdraw | — | — | — | — | ✅ |
| rpc_match_remove_participant | ✅ | ✅ (if can_remove_participants) | ❌ | ❌ | — |

---


### User Rejoin & Reactivation Semantics (v1.3 — Frozen)

There is **no user-initiated rejoin RPC** in v1.3.

If a participant is in `removed` status:

- Re-entry into the match flow MUST occur via **organizer reactivation** on the **same participant record**.
- Users MAY express intent to rejoin via UI, but this action MUST NOT change database state.
- Only after organizer reactivation may the user proceed with acceptance (if applicable).

User-triggered state transitions MUST NOT bypass organizer authority.



## Group Membership Lifecycle (v1.3)
1. Membership 基本原则

Group 是唯一的关系容器；用户与 Group 之间的关系由 group_members 表表示。

每个 (group_id, user_id) 在任一时刻 最多存在一条 membership 记录。

status 仅使用既有枚举值：pending / active / removed（v1.3 冻结）。

2. Membership 状态语义
2.1 pending

表示用户已被邀请但尚未完成加入流程。

可能来源：

Boundary Keeper 邀请（join_method = 'invited'）

被重新邀请的 removed 成员（re-invite）

2.2 active

表示用户已完成加入流程，是 Group 的有效成员。

2.3 removed

表示 当前 membership 生命周期已结束。

removed 不是 terminal 状态，但在未被重新邀请前不可恢复。

removed 成员不被视为 Group 成员，且不参与任何 Group 级权限计算。

3. Leave（用户主动离开）
3.1 行为定义

非 Boundary Keeper 的 active 成员可以通过 rpc_group_leave 主动离开 Group。

离开行为将：

设置 status = 'removed'

设置 removed_at = now()

设置 removed_by = auth.uid()（self-leave 审计）

3.2 约束

Boundary Keeper 不允许直接 leave；

必须先转移 boundary_keeper 身份，才能离开。

4. Remove（Boundary Keeper 移除成员）

（预留：当实现 BK-remove 时）

Boundary Keeper 移除成员应同样设置：

status = 'removed'

removed_at = now()

removed_by = <boundary_keeper_id>

5. Re-invite（重新邀请已移除成员）
5.1 行为定义

Boundary Keeper 可以通过 rpc_group_invite_user 重新邀请已被移除的成员。

Re-invite 不创建新记录，而是复活既有 group_members 行。

5.2 Re-invite 状态变更规则

当目标用户存在 status = 'removed' 的 membership 行时：

更新该行：

status = 'pending'

join_method = 'invited'

invited_by = <boundary_keeper_id>

removed_at = NULL

removed_by = NULL

accepted_at = NULL

5.3 语义说明

Re-invite 表示 开启一段新的 membership 生命周期。

任何来自上一生命周期的终止信息（removed_*）都不会影响新的加入流程。

被 re-invite 的用户必须重新完成加入确认流程。

6. 幂等性与一致性

对已 active 或 pending 的用户重复 invite，应明确拒绝。

对已 removed 的用户：

self 行为不可直接复活

仅 Boundary Keeper 的 re-invite 可恢复 membership

所有 Group membership 写操作 必须通过 RPC 执行。

7. Schema 要求（v1.3）

group_members 表必须包含以下字段：

join_method（existing）

accepted_at（existing）

removed_at（existing）

removed_by uuid（v1.3 新增，用于审计）

不新增、不修改任何 enum 值。

8. 设计结论（冻结）

removed 表示 membership 生命周期结束，但 允许被 BK 显式重新开启。

不允许用户自行从 removed 状态恢复。

Re-invite 始终是一次新的加入流程，不继承旧确认状态。

本条款自 v1.3 起冻结，除非明确升级版本，否则不得改变其语义。