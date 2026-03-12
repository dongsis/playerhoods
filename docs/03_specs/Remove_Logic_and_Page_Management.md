# Remove / Withdrawal / Revoke 逻辑与页面管理 — 全面梳理

**状态：** 梳理文档  
**更新：** 2026-03

---

## 1. 概览

项目中「撤销类」功能（remove / withdraw / decline / revoke）涉及多个领域，按实体分类如下：

| 领域 | 动作类型 | RPC/API | 页面入口 | 调用者 |
|------|----------|---------|----------|--------|
| **Match** | 组织者移除参与者 | `rpc_match_remove_participant` | Match 详情 | Organizer / 有权限的参与者 |
| **Match** | 用户退出/拒绝 | `rpc_match_user_withdraw` | Match 详情、Match 列表 | 参与者本人 |
| **Group** | 用户离开 | `rpc_group_leave` | Group 详情、Dashboard Players | 成员本人 |
| **Group** | 拒绝邀请 | `rpc_group_reject_invite` | Dashboard Players | 被邀请者 |
| **Email Invitation** | 拒绝邀请 | `rpc_email_invitation_decline` | `/invitations/[id]` | 被邀请者 |
| **Club/Venue Admin** | 撤销管理员 | `rpc_club_admin_revoke` | Admin Clubs/Venues | 超级管理员 |
| **Invite Circle** | 从邀请圈移除 | `rpc_invite_circle_remove_user` | Dashboard Invite Circle | 本人 |
| **Venue** | 移除场地偏好 | `removeVenuePreference` | Profile、Venue 详情 | 本人 |
| **Avatar** | 移除头像 | Storage remove + update | Dashboard | 本人 |
| **Form** | 本地表单移除 | 无 RPC | Match New / Match Edit | 本地 state |

---

## 2. 关键文件索引

| 功能 | API 文件 | 页面/组件 |
|------|----------|-----------|
| Match remove/withdraw | `src/lib/api/matches.ts` | `ParticipantGroups`, `MatchActions`, `MatchCard`, `ParticipantsList` |
| Group leave/reject | `src/lib/api/groups.ts` | `LeaveGroupButton`, `PlayersPanel` |
| Email decline | `src/lib/invitations/decline-invitation.ts` | `invitations/[id]/InvitationActions` |
| Admin revoke | `src/lib/api/clubs.ts` | `admin/clubs/[clubId]`, `admin/venues/[venueId]` |
| Invite Circle remove | `src/lib/api/play-network.ts` | `InviteCirclePanel` |
| Venue preference | `src/lib/api/identities.ts` | `profile/page`, `venues/[venueId]/page` |
| Avatar | — | `AvatarUpload` |

---

## 3. Match 参与者 Remove

### 3.1 数据库层

| RPC | 调用者 | 目标 | 效果 |
|-----|--------|------|------|
| `rpc_match_remove_participant(p_match_participant_id)` | **Organizer** 或（已确认参与者 + `can_participants_manage_participants`） | 任意非 removed 参与者 | 设置 `removed_at`, `removed_by`, `removal_note`；reconcile → status=removed |
| `rpc_match_user_withdraw(p_match_id)` | 参与者本人 | 自己的行 | 同上；语义为 decline/withdraw |

**action_type 映射（remove_participant）：**

- `reject_request` — 拒绝申请
- `revoke_invite` — 撤销邀请
- `reject_nomination` — 拒绝提名
- `remove_confirmed` — 移除已确认参与者
- `remove` — 其他

**action_type 映射（user_withdraw）：**

- `decline` — 拒绝邀请/提名
- `withdraw` — 主动离开

**幂等性：** 若已 removed，直接返回，不写 log。

### 3.2 API 层

```ts
// src/lib/api/matches.ts
removeParticipant(supabase, participantId)  // → rpc_match_remove_participant
userWithdraw(supabase, matchId)             // → rpc_match_user_withdraw
```

### 3.3 页面层

| 页面 | 组件 | 行为 |
|------|------|------|
| `/matches/[matchId]` | `ParticipantGroups.tsx` | Organizer 对每个非 removed 参与者显示 **Remove** 按钮；调用 `onRemoveParticipant`（server action）或 `removeParticipant`；removed 参与者显示 **Invite back** |
| `/matches/[matchId]` | `MatchActions.tsx` | 非 Organizer 参与者：pending 时显示 **Withdraw Request** / **Decline**；confirmed 时显示 **Leave Match**；removed 时显示提示 + **Request to Join**（若 inScope） |
| `/matches/[matchId]` | `page.tsx` | 定义 `handleRemoveParticipant` server action，调用 `removeParticipant` + `revalidatePath` |
| `/matches` | `MatchCard.tsx` | 列表卡片：pending/confirmed 非 Organizer 时，菜单中显示 **Withdraw**，调用 `userWithdraw` |
| `/matches/[matchId]` | `ParticipantsList.tsx` | 旧版列表，`canManage && status !== 'removed'` 时显示 Remove 按钮 |

**userWithdraw 语义（由 join_method + confirmed 决定）：**

- pending + invited/nominated → **Decline**（拒绝邀请/提名）
- pending + requested → **Withdraw Request**（撤销申请）
- confirmed → **Leave Match**（主动离开）

**参与者可见性：**

- Organizer：看到 confirmed + pending + **removed**
- 非 Organizer：只看到 confirmed + 部分 pending（用于 delegate confirm），**不看到 removed**

**Removed 区块：** 仅 Organizer 可见，`ParticipantGroups` 中 "Removed" 区块始终展开。

### 3.4 Re-entry（重新加入）

Remove 后可通过以下方式重新加入：

- `rpc_match_request_join`（若在 scope）
- `rpc_match_invite_user`（Organizer 邀请；wrapper → rpc_match_admit_user）
- `rpc_match_nominate_user`（同组非 Organizer 提名）

---

## 4. Group Remove

### 4.1 数据库层

| RPC | 调用者 | 目标 | 效果 |
|-----|--------|------|------|
| `rpc_group_leave(p_group_id)` | 成员本人 | 自己 | 设置 `removed_at`, `removed_by`；status → removed。**Boundary Keeper 不能离开** |
| `rpc_group_reject_invite(p_group_id)` | 被邀请者 | 自己 | 拒绝待处理邀请；status → removed |

**注意：** 当前 **没有** `rpc_group_remove_member`（管理员踢人）。只有 self-leave 和 reject-invite。

### 4.2 API 层

```ts
// src/lib/api/groups.ts
leaveGroup(supabase, groupId)      // → rpc_group_leave
rejectGroupInvite(supabase, groupId) // → rpc_group_reject_invite
```

### 4.3 页面层

| 页面 | 组件 | 行为 |
|------|------|------|
| `/groups/[groupId]` | `LeaveGroupButton` | 非 Boundary Keeper 显示 "Leave Group"；confirm 后调用 `leaveGroup` |
| `/groups/[groupId]` | `page.tsx` | 展示 Active / Pending / **Removed** 区块 |
| `/groups/[groupId]/members` | `page.tsx` | 展示 Active / Pending / **Removed** 区块（`<details>` 折叠） |
| `/dashboard` | `PlayersPanel` | 组内 `LeaveGroupButton`；待处理邀请的 Reject 按钮（`rejectGroupInvite`） |

### 4.4 数据获取问题（潜在 Bug）

`getGroupMembers` 仅返回 **active** 成员：

```ts
// src/lib/api/groups.ts:29-38
.eq('status', 'active')
.not('accepted_at', 'is', null)
.is('removed_at', null)
```

因此：

- `groups/[groupId]/page.tsx` 和 `groups/[groupId]/members/page.tsx` 中的  
  `removedMembers = members.filter(m => m.status === 'removed')`  
  **始终为空**
- `pendingMembers = members.filter(m => m.status === 'pending')` 也**始终为空**

若要展示 Pending 和 Removed，需要新增 `getGroupMembersAll` 或修改 `getGroupMembers` 支持返回全部状态，并确保 RLS 允许 Boundary Keeper 查看。

---

## 5. Email Invitation Decline（邮件邀请拒绝）

### 5.1 数据库层

| RPC | 调用者 | 目标 | 效果 |
|-----|--------|------|------|
| `rpc_email_invitation_decline(p_invitation_id)` | 被邀请者（session email 需匹配） | 自己 | 设置 `declined_at`；幂等（已 declined 不报错） |

### 5.2 API 层

```ts
// src/lib/invitations/decline-invitation.ts
declineInvitation(supabase, invitationId)  // → rpc_email_invitation_decline
```

### 5.3 页面层

| 页面 | 组件 | 行为 |
|------|------|------|
| `/invitations/[id]` | `InvitationActions.tsx` | 显示 **Decline** 按钮；调用 `declineInvitation`；declined 后显示 "You declined this invitation." |

---

## 6. Club / Venue Admin Revoke（撤销管理员）

### 6.1 数据库层

| RPC | 调用者 | 目标 | 效果 |
|-----|--------|------|------|
| `rpc_club_admin_revoke(p_user_id, p_club_id)` | 超级管理员 | 俱乐部管理员 | 从 `club_admins` 移除 |
| `rpc_club_admin_revoke(p_user_id, p_venue_id)` | 超级管理员 | 场地管理员 | 从 `venue_admins` 移除（同一 RPC，venue 作为 club 处理） |

### 6.2 API 层

```ts
// src/lib/api/clubs.ts
revokeClubAdmin(supabase, userId, clubId)
revokeClubAdmin(supabase, userId, venueId)  // venue 使用相同 API
```

### 6.3 页面层

| 页面 | 组件 | 行为 |
|------|------|------|
| `/admin/clubs/[clubId]` | `ClubAdminsDrawer` / `AdminManager` | 每个管理员旁显示 **Revoke** 按钮 |
| `/admin/venues/[venueId]` | 同上 | 每个管理员旁显示 **Revoke** 按钮 |

---

## 7. Invite Circle Remove

### 7.1 数据库层

| RPC | 调用者 | 目标 | 效果 |
|-----|--------|------|------|
| `rpc_invite_circle_remove_user(p_target_user_id)` | 本人 | 目标用户 | 从调用者的 Invite Circle 中移除。幂等（不存在不报错） |

### 7.2 API 层

```ts
// src/lib/api/play-network.ts
removeFromInviteCircle(supabase, targetUserId)  // → rpc_invite_circle_remove_user
```

### 7.3 页面层

| 页面 | 组件 | 行为 |
|------|------|------|
| `/dashboard` | `InviteCirclePanel.tsx` | 每个已保存用户旁提供 Remove 入口，调用 `removeFromInviteCircle` |

---

## 8. Venue 偏好 Remove

### 8.1 API 层

```ts
// src/lib/api/identities.ts
removeVenuePreference(supabase, identityId, venueId)
```

直接对 `identity_venue_preferences` 做 delete，无专用 RPC。

### 8.2 页面层

| 页面 | 行为 |
|------|------|
| `/profile` | 已保存场地旁显示 Remove 按钮，`handleRemoveVenuePref` server action |
| `/venues/[venueId]` | 已保存时显示 Remove，调用 `removeVenuePreference` |

---

## 9. Avatar Remove

### 9.1 逻辑

- Storage: `supabase.storage.from('avatars').remove([\`${userId}/avatar.webp\`])`
- 更新 profile: `setAvatarUrl(supabase, null)`

### 9.2 页面层

`/dashboard` 的 `AvatarUpload` 组件，有 "Remove" 按钮。

---

## 10. 表单内本地 Remove（无持久化）

| 页面 | 用途 |
|------|------|
| `/matches/new` | `removeContactPlayer(i)` — 从 Contact Players 列表中移除一项 |
| `/matches/[matchId]` 的 `MatchEditForm` | `removeCourt(i)` — 从场地列表中移除一项 |

均为本地 state，提交时一起保存。

---

## 11. Dashboard 与通知中的 Remove 展示

### 11.1 Matches 徽章

`DashboardShell` 中，Matches 标签的徽章逻辑：

- Pending 邀请/提名（需用户操作）→ +1
- **Removed** 且 match 为 active、未过期、非 self-declined → +1
- 进入 Matches 标签后，将 "removed" 的 match 加入 `dismissedMatchIds`，徽章数减少

### 11.2 Inbox 通知

`InboxPanel` 的 `KIND_LABELS`：

- `removed`: "You were removed from match"
- `delegate_target_removed`: "Your nominee was removed"

---

## 12. 总结表

| 实体 | 动作 | RPC/API | 页面 | 备注 |
|------|------|---------|------|------|
| Match 参与者 | 组织者/管理者移除 | `rpc_match_remove_participant` | Match 详情 `ParticipantGroups` | 支持 re-entry、Invite back |
| Match 参与者 | 用户退出/拒绝 | `rpc_match_user_withdraw` | Match 详情 `MatchActions`、Match 列表 `MatchCard` | Decline / Withdraw Request / Leave |
| Group | 用户离开 | `rpc_group_leave` | Group 详情、Dashboard `PlayersPanel` | BK 不可离开 |
| Group | 拒绝邀请 | `rpc_group_reject_invite` | Dashboard `PlayersPanel` | |
| Email Invitation | 拒绝邀请 | `rpc_email_invitation_decline` | `/invitations/[id]` | |
| Club/Venue | 撤销管理员 | `rpc_club_admin_revoke` | Admin Clubs/Venues | |
| Group | 管理员踢人 | **无** | — | 未实现 |
| Invite Circle | 移除用户 | `rpc_invite_circle_remove_user` | Dashboard `InviteCirclePanel` | |
| Venue 偏好 | 移除偏好 | `removeVenuePreference` | Profile、Venue 详情 | |
| Avatar | 移除头像 | Storage remove + update | Dashboard `AvatarUpload` | |
| 表单 | 移除 Contact/Court | 本地 state | Match New/Edit | 无 RPC |

---

## 13. 相关文档

- `Organizer_Match_Operations.md` — Organizer 专属 match 操作（创建、编辑、取消、邀请、审批、移除等）完整梳理

## 14. 待办 / 建议

1. **Group 成员列表：** 修复 `getGroupMembers` 或新增 `getGroupMembersAll`，使 Pending/Removed 区块有真实数据。
2. **Group 管理员踢人：** 若产品需要，可新增 `rpc_group_remove_member`。
3. **ParticipantsList vs ParticipantGroups：** 确认 `ParticipantsList` 是否仍在使用，避免重复逻辑。
