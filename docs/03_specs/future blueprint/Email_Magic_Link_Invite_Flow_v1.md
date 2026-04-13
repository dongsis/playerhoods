# Email Magic Link Invite Flow v1

## 1. 文档目的

这份文档定义 playerhoods.com 中：

**通过 email 向 contact player / 外部联系人发送邀请，并通过 magic link 完成身份验证与邀请确认**

的首版实现方案。

本版采用：

## 版本 A：最简单版本
流程为：

1. 系统创建 invitation
2. 系统发邀请邮件
3. 对方点击邮件中的链接
4. 若未登录，则通过 magic link 完成邮箱验证 / 登录 / 注册
5. 登录后进入 invitation 页面
6. 用户再点击 `Accept` 或 `Decline`
7. 系统将邀请结果写入对应业务对象（match / activity / group）

---

## 2. 为什么优先采用版本 A

版本 A 的优点：

- 安全性更高
- 流程更清楚
- 更容易调试
- 更适合首版
- 更容易和现有业务对象衔接
- 不会把“点击 email 链接”误等同于“自动接受邀请”

版本 A 的核心原则：

**magic link 负责邮箱身份验证，不直接承担最终业务确认。**

---

## 3. 适用场景

本流程适用于以下场景：

### 3.1 Match Invite
邀请某个 contact player / 外部联系人参加一场 match。

### 3.2 Venue Activity Signup
通过邮件邀请某人参加某个 club activity / mixer / shuffle。

### 3.3 Group Invite
通过邮件邀请某人加入某个稳定 group。

---

## 4. 角色定义

### 4.1 Inviter
发起邀请的现有平台用户。

### 4.2 Invitee
收到邀请邮件的人，可能是：

- 已注册用户
- 未注册用户
- 仅存在于 external contact / contact player 列表中的人

### 4.3 Platform User
已在平台中有 auth 身份的用户。

### 4.4 External Contact / Contact Player
尚未完成平台身份验证，仅被 inviter 存为外部联系人的对象。

---

## 5. 流程总览

## 5.1 主流程

### Step 1
inviter 发起邀请。

### Step 2
系统创建一条 invitation 记录。

### Step 3
系统向 target_email 发送邮件。

### Step 4
invitee 点击邮件中的链接。

### Step 5
若 invitee 尚未登录，则通过 magic link 完成邮箱验证。

### Step 6
系统将 invitee 重定向到 invitation 页面。

### Step 7
invitee 查看邀请详情并点击：
- Accept
- Decline

### Step 8
系统将 invitation 状态更新，并同步写入业务对象。

---

## 6. 首版不做的事

首版不做：

- 点击 magic link 后自动接受邀请
- 无页面确认的自动入 match / group / activity
- 一封邮件承载多个 invitation 的复杂处理
- 一个链接同时处理多邮箱 claim
- 深度解决所有多账号/多邮箱合并问题

---

## 7. 数据模型

## 7.1 核心表：email_invitations

建议字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | invitation 主键 |
| `inviter_user_id` | uuid | 发起人 |
| `target_email` | text | 邀请目标邮箱 |
| `target_name` | text nullable | 目标姓名 |
| `related_type` | text | `match` / `activity` / `group` |
| `related_id` | uuid | 对应业务对象 id |
| `status` | text | `pending` / `accepted` / `declined` / `expired` / `canceled` |
| `magic_link_flow_status` | text | `not_opened` / `opened` / `verified_email` / `landed` |
| `accepted_by_user_id` | uuid nullable | 最终接受邀请的 user |
| `accepted_at` | timestamptz nullable | 接受时间 |
| `declined_at` | timestamptz nullable | 拒绝时间 |
| `expires_at` | timestamptz nullable | 失效时间 |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 更新时间 |

---

## 7.2 可选表：email_invitation_events

用于调试和审计。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | event 主键 |
| `invitation_id` | uuid | 关联 invitation |
| `event_type` | text | `sent` / `opened` / `verified` / `accepted` / `declined` / `expired` |
| `actor_user_id` | uuid nullable | 若已登录则记录 user |
| `metadata` | jsonb | 附加信息 |
| `created_at` | timestamptz | 时间 |

---

## 8. 与现有对象的衔接

## 8.1 Match
若 `related_type = match`：

当 invitee 点击 `Accept` 后：
- 找到或创建该 user 的 participant 记录
- 写入 participant acceptance
- 更新 invitation 为 `accepted`

若点击 `Decline`：
- 更新 invitation 为 `declined`
- 可选写入 participant decline 状态

---

## 8.2 Activity
若 `related_type = activity`：

Accept 后：
- 写入 activity signup / participant
- 更新 invitation 状态

Decline 后：
- invitation 状态改为 `declined`

---

## 8.3 Group
若 `related_type = group`：

Accept 后：
- 创建 / 激活对应 group membership
- 更新 invitation 状态

Decline 后：
- invitation 状态改为 `declined`

---

## 9. 邮件内容设计

## 9.1 邮件目标
邮件要完成三件事：

1. 让对方知道是谁邀请的
2. 让对方知道邀请内容是什么
3. 让对方点击进入平台查看并确认

---

## 9.2 推荐邮件结构

### Subject
根据场景动态生成，例如：

- Nancy invited you to a doubles game
- You are invited to a club activity
- Nancy invited you to join a group

### Body
包含：
- 邀请人姓名
- 邀请类型
- 时间 / 地点 / club（如适用）
- 一句简单说明
- 主按钮：`View Invitation`

---

## 9.3 首版按钮文案
首版建议使用：

**View Invitation**

不要直接写：
- Accept Now
- Confirm Instantly

因为首版不是一步到位确认。

---

## 10. 链接结构

首版建议使用：

- `/auth/callback`
- `/invitations/:id`

邮件中的按钮链接应携带：
- invitation id
- redirect target
- 可选签名参数 / nonce

目标是：
- auth 完成后能回到正确 invitation 页面
- invitation 页能知道当前 session user 是谁

---

## 11. 页面设计

## 11.1 Invitation Landing Page
路径示意：

`/invitations/:id`

页面需展示：

- 邀请人
- 邀请类型
- 相关对象摘要（match / activity / group）
- 时间地点（如适用）
- 当前状态
- Accept / Decline 按钮

---

## 11.2 未登录状态
如果用户未登录，页面不直接显示完整操作，而是：

- 提示需要验证邮箱
- 引导走 magic link auth
- auth 完成后回到本页

---

## 11.3 已登录状态
如果当前 session 已存在：

- 系统检查该 session user 是否与 `target_email` 一致
- 一致则允许 Accept / Decline
- 不一致则提示邮箱不匹配，不允许直接接受

---

## 12. 状态机

## 12.1 invitation 状态

### 初始
`pending`

### 中间状态
- `opened`
- `verified_email`
- `landed`

### 终态
- `accepted`
- `declined`
- `expired`
- `canceled`

---

## 12.2 推荐逻辑
- 邮件发送成功后：`pending`
- 首次打开链接：记录 opened event
- 完成 magic link 验证：记录 verified event
- 落到 invitation page：记录 landed event
- Accept：状态 → `accepted`
- Decline：状态 → `declined`
- 超时未处理：状态 → `expired`

---

## 13. 核心校验规则

## 13.1 target_email 校验
首版建议：

**只有完成 target_email 验证的用户才能接受这条 invitation。**

也就是：
- invitation 绑定某个邮箱
- 最终 Accept 必须由该邮箱登录后的用户执行

---

## 13.2 related object 有效性校验
Accept 之前应检查：

- related object 是否还存在
- invitation 是否未过期
- invitation 是否未被取消
- related object 是否仍允许加入

例如：
- match 是否未取消
- group 是否仍开放邀请
- activity 是否仍有名额

---

## 13.3 幂等校验
同一条 invitation：

- Accept 多次不应重复创建对象
- 已 accepted 再打开，只显示“已确认”
- 已 declined 再打开，只显示“已拒绝”
- 已 expired 再打开，只显示“已过期”

---

## 14. contact player / external contact 到 platform user 的升级

这是本流程的关键价值之一。

在发邀请前，某人可能只是：
- 一个 email
- 一个 name
- 一个 external contact

当他点 magic link 完成邮箱验证后：

### 系统可以做的事
- 自动创建 auth user
- 自动创建基础 profile
- 将该 invitation 标记为由该 user claim
- 将原 external contact 与该 user 关联起来（若有对应关系）

这样就完成了：

**contact player → verified platform user**

---

## 15. 需要注意的风险点

## 15.1 邮件被转发
风险：
- invitation 邮件被别人转发
- 别人点击链接

首版防护策略：
- 必须完成 target_email 对应邮箱验证
- 验证邮箱不匹配则不能 Accept

---

## 15.2 多邮箱用户
问题：
- 用户收到邀请的邮箱与其已有平台账号邮箱不一致

首版建议：
- invite 绑定 target_email
- 必须通过 target_email 完成该 invitation 的验证
- 暂不优先处理多邮箱合并

---

## 15.3 重复邀请
同一 email 可能同时收到多次邀请。

首版建议：
- 每条 invitation 独立存在
- 每条 invitation 独立状态机
- 后续再做合并视图

---

## 15.4 失效时间
首版建议：
- invitation 具有 `expires_at`
- 超时后不可 Accept
- 可允许 inviter 重新发送

---

## 16. 与 Supabase / Auth 系统的关系

如果当前平台使用 Supabase Auth，这个流程会更容易实现。

Supabase 已提供：
- email magic link / OTP 登录
- redirect URL
- session 建立

因此你不需要从零实现邮箱登录本身。

你真正要做的是：

1. invitation 数据层
2. email 模板与发送
3. auth callback 与 redirect
4. invitation page
5. accept / decline 业务逻辑
6. external contact 升级为 platform user 的衔接

---

## 17. MVP 范围

首版 MVP 建议只覆盖：

### 支持对象
- match invite
- club activity invite

### 可选稍后再加
- group invite

### 首版只做
- email invitation
- magic link auth
- invitation page
- Accept / Decline
- 状态机
- 审计事件

### 首版不做
- 自动确认
- deep merge identity
- 多邮箱复杂 claim
- 多 invitation 批处理页面

---

## 18. 推荐实施步骤

## Phase 1
先做：
- `email_invitations`
- invitation email 模板
- invitation landing page
- Accept / Decline
- related_type = match

## Phase 2
再做：
- related_type = activity
- invitation events log
- expired / resend flow

## Phase 3
再做：
- related_type = group
- external contact 自动关联 user
- 更好的 invitation inbox / history

---

## 19. 未来升级路径（为版本 B 预留）

当版本 A 跑顺后，可以升级到更丝滑的：

### A+
- 点击邮件
- 完成 magic link
- 进入 accept-ready 页面
- 只差最后一个确认按钮

### B
- 点击 magic link 后，如果上下文与验证都严格匹配，可更接近直接确认

但首版不建议跳过 A。

---

## 20. 一句话结论

**Email Magic Link Invite Flow v1 的最佳首版方案，是让 magic link 负责邮箱身份验证，再由 invitation 页面完成最终 Accept / Decline。**

这样既能顺滑地把平台外联系人带入平台，又能保持安全、清晰、可扩展。
