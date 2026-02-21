# PlayerHoods Changelog

## v1.4
- # v1.4 — Club Identity System

### Added
- club_identities table
- per-club handle system
- primary_club_id on profiles
- generated club_handle_norm
- full RPC-only identity writes

### Changed
- display_name is now derived from primary club
- direct UPDATE on profiles removed

### Security
- All profile identity writes restricted to SECURITY DEFINER RPCs
- Unique constraints enforce club-level identity isolation

This establishes contextual identity as a platform invariant.


## v1.5
PlayerHoods v1.5
Governance & Architecture Update
Match Scope · Participation Logic · Venue Model · Identity · Group Discoverability
1️⃣ Match Visibility Scope Redesign
1.1 Scope 原则（权威规则）

Match 可见性 严格基于 invitation scope。

唯一有效范围：
matches.invitation_scope_group_ids

仅：

该 group 的 active 成员可见

明确禁止 fallback：

organizer 所在其他 group

全平台 venue identities

任意用户目录

城市匹配

venue overlap

Scope 是硬边界。

1.2 Participant 信息披露规则
Confirmed

可见范围：

Scope 内成员

Pending 参与者

Organizer

显示：

名字可见

作为社交吸引层

Pending

Organizer：

可见完整名单

Confirmed：

仅显示人数

Pending：

仅显示自己 + 人数

Scope 内但未参与者：

仅显示人数

不可展开

Removed

仅 Organizer 可见

本人可见“你已不在这个 match 里”

不对其他人展示

1.3 Pending 名单 UI 规则

UI 不显示：

Real
tt
Orgtest

而显示：

Pending (3)

仅 Organizer 可展开。

2️⃣ Match Participation Channels
2.1 参与路径类型

Match Participants 的加入渠道：

Invite

Nominate

Manual Confirm

2.2 Nominate 权限

允许：

Organizer

Confirmed

Pending

Scope 内非参与者

但：

Nominate ≠ Manage

不可：

approve

remove

confirm 他人

2.3 Nominate 语义

创建或重置 match_participants 行

join_method = 'nominated'

需要：

participant_accepted_at

org_approved_at

reconcile → confirmed

不允许平台级 fallback。

2.4 Manual Confirm 定义

适用对象：

Scope 内 user

invited user

guest（non-user）

语义：

参与者已在线下确认可参加
不需要其在系统内点击确认

流程：

写入 participant_accepted_at

participant_accepted_via = 'manual'

仍需 org_approved_at

reconcile → confirmed

审计要求

Manual confirm 必须：

写 action log

可审计

不改变 scope 规则

2.5 Match 创建后的权限原则

所有：

Scope 内 user

Invited user

可：

Nominate

Manual Confirm user

Manual Confirm guest

不可：

approve

remove

manage 他人

UI 无需展示“你拥有该权限”。

3️⃣ Participation Field Model v1.5
字段重构

将：

user_accepted_at

改为：

participant_accepted_at

新增：

participant_accepted_via = 'in_app' | 'manual'
字段职责最终定义
participant_accepted_at

表达：

参与者侧确认时间

适用于：

user（in_app / manual）

guest（manual）

org_approved_at

表达：

Organizer 批准时间

confirmed_at

表达：

双方确认完成的快照时间

规则：

if removed_at is null
and participant_accepted_at is not null
and org_approved_at is not null
→ confirmed_at = now()

confirmed_at：

仅 reconcile 写入

RPC 不允许直接写

三种确认来源
类型	参与者类型	accepted_via
In-app confirm	user	in_app
Manual confirm (user)	user	manual
Guest confirm	guest	manual

组合形成三种场景。

4️⃣ 修改 Match 后的 Reconfirm 流程

当 Organizer 修改：

日期

时间

Venue

时长

系统必须：

participant_accepted_at = null
confirmed_at = null
org_approved_at = 保持

状态：

→ pending_reconfirm

UI 显示：

Match details changed. Please reconfirm.

Manual confirmed 的 user：

→ 原代确认人需重新 manual confirm

5️⃣ Identity System v1.5
5.1 Identity 分层
层级	唯一性	用途
user_id	全局唯一	系统引用
display_name	可重复	默认展示名
group_display_name	group 内可重复	群昵称
personal_remark	私有	仅本人可见
booking_court_name	可重复	展示给 match org
5.2 显示优先级

在 group 上下文：

personal_remark

group_display_name

display_name

5.3 Emoji 规则

允许 emoji

≤ 32 字符

过滤控制字符

5.4 移除

per-club handle 字段完全取消

6️⃣ Venue Model v1.5
6.1 统一命名

clubs → venues

club admin → venue admin

6.2 Venue Type

新增字段：

venue_type

值：

Club

Public

Community

Private

6.3 地理字段

新增：

country_code

admin1

locality

admin2 (nullable)

postal_code (nullable)

7️⃣ Group Discoverability & Matching Framework
7.1 Group 画像字段

home_city

primary_club_id (nullable)

top_venue_ids uuid[] (≤3)

gender_policy

age_band

skill_band

play_time_windows jsonb

discoverability_mode

discoverability_scope

7.2 Discoverability 硬门槛
private

不可搜索

仅邀请

club_only

viewer 必须为 primary_club member

city_match

viewer.home_city == group.home_city

venue_overlap

viewer.venue_ids ∩ group.top_venue_ids ≥ 1

hybrid

city OR venue overlap

7.3 软匹配排序
条件	分值
同城	+3
venue overlap	+2 each
性别兼容	+2
年龄重叠	+2
skill 重叠	+2
时间重叠	+2

仅用于排序，不用于强过滤。

7.4 安全原则

电话不可用于 discoverability

private group 永不公开

discoverable ≠ auto-join

必须经 organizer 批准

8️⃣ 核心架构原则总结

Scope 是硬边界

Confirm 由双时间戳派生

Manual confirm 可审计

Identity 不作为权限依据

Discoverability 是增长机制，不是开放目录

Club group 边界最强

v1.5 架构升级定位

本版本：

消除确认字段语义混乱

统一 user / guest 参与模型

强化 match scope 边界

引入 venue 全球化模型

建立结构化 group 发现机制

去 handle 化

强化审计与隐私控制