# Organizer Match 操作逻辑 — 全面梳理

**状态：** 梳理文档  
**更新：** 2026-03

---

## 1. 概览

Organizer（组织者）是 match 的创建者，`matches.organizer_id = user_id`。Organizer 拥有 match 的最高管理权限，可执行以下操作：

| 类别 | 操作 | RPC/API | 页面入口 |
|------|------|---------|----------|
| **创建** | 创建 match | `rpc_match_create` | `/matches/new` |
| **编辑** | 修改时间/日期/时长 | `updateMatchDetails` (RLS) | Match 详情 `MatchEditForm` |
| **编辑** | 修改 scope groups | `updateMatchDetails` | Match 详情 `MatchScopeGroupsForm` |
| **编辑** | 设置场地 | `setMatchCourts` (RLS) | Match 详情 `MatchEditForm` |
| **取消** | 取消 match | `cancelMatch` (RLS) | Dashboard `MatchesPanel` |
| **参与者** | 邀请用户 | `rpc_match_invite_user` | Match 详情 Organizer Admin |
| **参与者** | 提名 Contact Player | `rpc_match_nominate_guest` | Match 详情 Organizer Admin |
| **参与者** | Approve 待审批参与者 | `rpc_match_org_approve_participant` | Match 详情 `ParticipantGroups` |
| **参与者** | Manual Confirm 用户 | 组合：`delegate_confirm` + `org_approve`；或 `admit_user` + `delegate_confirm` | Match 详情 `ParticipantGroups` |
| **参与者** | 移除参与者 | `rpc_match_remove_participant` | Match 详情 `ParticipantGroups` |
| **参与者** | Invite back 已移除参与者 | `rpc_match_invite_user` | Match 详情 `ParticipantGroups` |
| **邮件** | 发送邮件邀请 | `createMatchEmailInvitationAndSend` | Match 详情 `InviteByEmailForm` |

---

## 2. 关键文件索引

| 功能 | API 文件 | 页面/组件 |
|------|----------|-----------|
| 创建 match | `src/lib/api/matches.ts` → `createMatch` | `matches/new/page.tsx`, `CreateMatchInline` |
| 编辑/取消/场地 | `src/lib/api/matches.ts` | `matches/[matchId]/page.tsx`, `MatchEditForm`, Dashboard |
| 邀请/审批/移除 | `src/lib/api/matches.ts` | `ParticipantGroups`, `InviteUserForm`, `InviteGuestForm` |
| 邮件邀请 | `matches/[matchId]/invite-actions.ts` | `InviteByEmailForm` |

---

## 3. 创建 Match

### 3.1 RPC

| RPC | 说明 |
|-----|------|
| `rpc_match_create(...)` | 创建 match，自动将 organizer 加入为 confirmed 参与者 |

### 3.2 API

```ts
// src/lib/api/matches.ts
createMatch(supabase, { required_count, match_date, start_time, duration_minutes, game_type,
  club_id?, court_ids?, invitation_scope_group_ids?,
  can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants })
```

### 3.3 页面

| 页面 | 行为 |
|------|------|
| `/matches/new` | 表单创建 match；可同时添加 Contact Players、邀请用户 |
| Dashboard `CreateMatchInline` | 内联创建 match |

---

## 4. 编辑 Match（Organizer 专属）

### 4.1 数据库层

- **RLS 策略：** `matches_update_organizer` 允许 `organizer_id = auth.uid()` 时 update
- **match_courts：** RLS 允许 organizer 对 match_courts 做 insert/delete

### 4.2 API 层

| 函数 | 说明 |
|------|------|
| `updateMatchDetails(supabase, matchId, { match_date?, start_time?, duration_minutes?, invitation_scope_group_ids? })` | 更新 match 字段；时间变更会触发 `sendMatchTimeChangeEmails` |
| `setMatchCourts(supabase, matchId, courtLabels[], userId)` | 替换所有场地 slot |
| `setMatchSingleCourt(supabase, matchId, courtLabel, userId)` | 单场地快捷设置 |

### 4.3 页面层

| 组件 | 行为 |
|------|------|
| `MatchEditForm` | 编辑日期、时间、时长、场地；`onSave` → `handleUpdateMatchDetails` |
| `MatchScopeGroupsForm` | 编辑 invitation_scope_group_ids；`onSave` → `handleUpdateScopeGroups` |

**可见性：** `isOrganizer && match.status === 'active'` 时显示。

---

## 5. 取消 Match

### 5.1 API

```ts
cancelMatch(supabase, matchId)  // matches.status → 'cancelled'
```

RLS：`matches_update_organizer` 允许 organizer 更新。

### 5.2 页面

| 页面 | 行为 |
|------|------|
| Dashboard `MatchesPanel` | Organizer 的 match 卡片显示 Cancel 入口；`onCancelMatch` → `handleCancelMatch` |

---

## 6. 参与者管理（Organizer Admin）

### 6.1 邀请用户（Invite）

| RPC | 说明 |
|-----|------|
| `rpc_match_invite_user(p_match_id, p_user_id)` | **Organizer only**。Pre-approve 用户；被邀请者只需 Accept 即可 confirmed。Target: InScope OR ShareGroup(organizer)。支持 re-entry。 |

**API：** `inviteUserToMatch(supabase, matchId, userId)`

**页面：** Organizer Admin → `InviteUserForm`，选择 `scopeUsers` 中的用户。

### 6.2 提名 Contact Player

| RPC | 说明 |
|-----|------|
| `rpc_match_nominate_guest(p_match_id, p_guest_id)` | Organizer 或 MatchAssociated 可调用。Organizer 调用时：`org_approved_at` 自动设置；guest 需 delegate_confirm 才能 confirmed。 |

**API：** `nominateGuest(supabase, matchId, guestId)`

**页面：** Organizer Admin → `InviteGuestForm`（从 roster 选）+ `AddGuestForm`（新建 Contact Player）。

**注意：** Organizer **不使用** Nominate User（`rpc_match_nominate_user`）— 那是 participant-only。Organizer 用 Invite 直接 pre-approve。

### 6.3 Approve 待审批参与者

| RPC | 说明 |
|-----|------|
| `rpc_match_org_approve_participant(p_match_participant_id)` | **Organizer only**。设置 `org_approved_at`。若 `participant_accepted_at` 已存在 → reconcile → confirmed。 |

**API：** `orgApproveParticipant(supabase, participantId)`

**页面：** `ParticipantGroups` → 每个 pending 参与者旁的 Approve 按钮。

### 6.4 Manual Confirm（已降级为组合动作）

| 组合 | 说明 |
|------|------|
| `rpc_match_delegate_confirm_participant` + `rpc_match_org_approve_participant` | 对已有 pending user 行，organizer 一键确认。 |
| `rpc_match_admit_user` + `rpc_match_delegate_confirm_participant` | 对尚未加入的 user，加人并确认。Organizer path in admit_user 已设 org_approved_at，故只需 delegate_confirm 补 participant 侧。 |

**API：** `manualConfirmParticipant(supabase, participantId)`, `manualConfirmUser(supabase, matchId, userId)` — 内部已改为组合调用。

**页面：** `ParticipantGroups` → Manual Confirm 按钮（对 pending user）。

**废弃 RPC：** `rpc_match_manual_confirm`、`rpc_match_manual_confirm_user` 已 stub，raise 废弃错误。

### 6.5 移除参与者

| RPC | 说明 |
|-----|------|
| `rpc_match_remove_participant(p_match_participant_id)` | **Organizer** 或（已确认参与者 + `can_participants_manage_participants`）。设置 removed_at；reconcile → status=removed。 |

**API：** `removeParticipant(supabase, participantId)`

**页面：** `ParticipantGroups` → 每个非 removed 参与者旁的 Remove 按钮。仅 Organizer 可见（v1.5 参与者不能 remove 他人）。

### 6.6 Invite back 已移除参与者

对 `status === 'removed' && user_id !== null` 的参与者，Organizer 可点击 "Invite back"，调用 `inviteUserToMatch`（即 `rpc_match_invite_user`）实现 re-entry。

---

## 7. 目标列表（Organizer vs Participant）

| RPC | 调用者 | 说明 |
|-----|--------|------|
| `rpc_match_admission_targets(p_match_id, p_search)` | Organizer **或** (can_participants_invite + InScope/MatchAssociated) | 统一目标列表：reentry, invite_circle, club_members, groups |
| `rpc_match_invite_targets` | **Organizer only**（thin wrapper） | 保留 legacy，实际调用 admission_targets |
| `rpc_match_nominate_targets` | **Non-organizer**（org 调用返回空） | 同上，nominate 用 |

**API：** `getAdmissionTargets(supabase, matchId)` → `admissionTargetsToScopeUsers` / `admissionTargetsToContactPlayers`

---

## 8. 邮件邀请

| 函数 | 说明 |
|------|------|
| `createMatchEmailInvitationAndSend({ supabase, matchId, targetEmail, ... })` | 创建 email_invitation 记录并发送邮件。Organizer 在 Match 详情页通过 `InviteByEmailForm` 调用。 |

---

## 9. Organizer 可见性 vs 非 Organizer

| 内容 | Organizer | 非 Organizer |
|------|-----------|--------------|
| 参与者列表 | confirmed + pending + **removed** | confirmed + pending guests + pending invited/nominated users（用于 delegate confirm） |
| Pending 数量 | 本地 count | 使用 match_formed view 的 pending_count |
| Match 编辑表单 | 显示 | 不显示 |
| Scope groups 编辑 | 显示 | 不显示 |
| Organizer Admin 区块 | 显示 | 不显示 |
| Remove / Invite back | 显示 | 不显示 |
| Approve / Manual Confirm | 显示 | 不显示（participant 只有 delegate confirm） |
| MatchActions（Accept/Withdraw/Request） | 不显示（admin 在 Organizer Admin） | 显示 |

---

## 10. 总结表

| 操作 | RPC/API | 权限 | 页面 |
|------|---------|------|------|
| 创建 match | `rpc_match_create` | 任意登录用户 | `/matches/new`, Dashboard |
| 编辑时间/scope/场地 | `updateMatchDetails`, `setMatchCourts` | Organizer (RLS) | Match 详情 |
| 取消 match | `cancelMatch` | Organizer (RLS) | Dashboard |
| 邀请用户 | `rpc_match_invite_user` | Organizer only | Organizer Admin |
| 提名 Contact Player | `rpc_match_nominate_guest` | Organizer 或 MatchAssociated | Organizer Admin |
| Approve | `rpc_match_org_approve_participant` | Organizer only | ParticipantGroups |
| Manual Confirm | 组合：delegate_confirm + org_approve；或 admit_user + delegate_confirm | Organizer only | ParticipantGroups |
| 移除参与者 | `rpc_match_remove_participant` | Organizer 或 (confirmed + can_manage) | ParticipantGroups |
| Invite back | `rpc_match_invite_user` | Organizer only | ParticipantGroups |
| 邮件邀请 | `createMatchEmailInvitationAndSend` | Organizer | InviteByEmailForm |

---

## 11. 相关文档

- `Match_Participation_Flows_and_Scope.md` — 参与流程与 scope 定义
- `Remove_Logic_and_Page_Management.md` — Remove/Withdraw 类操作梳理
- [FACTS_functions](../02_facts/FACTS_functions.md) — RPC 函数索引
