# playerhoods.com Notification MVP Spec v1

## 0. 文档定位

本 spec 定义 playerhoods.com 第一阶段通知系统（MVP）的：

- 目标边界
- 数据模型
- 事件模型
- 通知类型
- 投递规则
- RLS / 权限边界
- 推荐迁移顺序
- 推荐代码结构
- Phase 1 验收范围

本版本目标是：

> 先把 match 相关的关键通知统一纳入一个事件驱动的通知骨架中，优先支持 in-app + email，两种渠道。

---

## 1. MVP 目标

### 1.1 本阶段必须解决的问题

当前 playerhoods.com 已经进入真实业务建模阶段，match / participant / nominate / confirm / reconfirm / substitute 这些动作已经开始形成稳定业务语义。通知系统 MVP 需要优先支撑以下 3 类高价值场景：

#### A. nomination 通知
当某人被 nominate 进某场 match 时，应该收到通知。

#### B. match time changed + reconfirm 通知
当 match 的 date / time / duration 等关键时间信息变更，并且需要参与者重新确认时，应该通知相关参与者。

#### C. urgent substitute / spot-needed 通知
当 organizer 发起临时补位 / 缺人招募时，应该触发较高优先级通知。

### 1.2 本阶段不解决的问题

以下内容明确不在 MVP v1 内：

- marketing / growth 类通知
- club broadcast
- digest / 每日汇总
- recommendation / AI 排序发送
- push provider 接入
- SMS provider 接入
- group-level / club-level 复杂 mute 规则
- 多语言模板系统
- notification batching / collapse
- read receipts beyond basic in-app read_at

---

## 2. 设计原则

### 2.1 事件驱动，而不是页面驱动
通知必须来源于业务事件，而不是某个页面直接发 email。

错误方向：

- MatchEditor 页面保存后直接 resend.send()
- Nominate 按钮 onClick 后直接发信

正确方向：

- 业务事务成功
- emit domain event
- 由通知层解析并生成 notification + delivery
- 由 worker 异步投递

### 2.2 通知对象与投递对象分离
要区分：

#### notification
“有一个通知应该给某个 recipient”

#### delivery
“这个通知通过某个渠道发了一次”

所以需要：

- `notifications`
- `notification_deliveries`

而不是一个表混在一起。

### 2.3 先做 registered user 路径
MVP v1 优先服务已注册用户。guest / contact-only 的外部通知路径可以后置。

也就是说，v1 的主 recipient 模型先是：

- `user_id`

而不是一开始就全面支持：

- `guest_id`
- `contact_player_id`
- raw email target

### 2.4 in-app 是第一公民
MVP 里 in-app inbox 必须是核心渠道。email 是补充，但不能反过来让 email 成为唯一事实来源。

### 2.5 所有投递都要可审计
系统必须能回答：

- 哪个事件触发了通知
- 生成了哪些 notification
- 每个 notification 走了哪些渠道
- 哪次成功 / 哪次失败
- 错误是什么

---

## 3. MVP 范围

### 3.1 支持的事件类型

MVP v1 只支持以下 domain event：

1. `match.participant_nominated`
2. `match.time_changed_reconfirm_required`
3. `match.substitute_requested`

### 3.2 支持的通知类型

MVP v1 只支持以下 notification type：

1. `match_nomination`
2. `match_reconfirm_required`
3. `match_substitute_urgent`

### 3.3 支持的渠道

MVP v1 只支持：

1. `in_app`
2. `email`

### 3.4 支持的 priority

MVP v1 支持：

- `normal`
- `high`
- `urgent`

建议语义：

- `match_nomination` → `normal`
- `match_reconfirm_required` → `high`
- `match_substitute_urgent` → `urgent`

---

## 4. 数据模型

### 4.1 `domain_events`

#### 作用
记录业务事件，是通知系统的输入源。

#### 推荐字段

```sql
create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

#### 字段说明

- `event_type`: 业务事件类型
- `aggregate_type`: 聚合根类型，MVP 固定为 `match`
- `aggregate_id`: 对应 match id
- `actor_user_id`: 触发事件的用户
- `payload`: 事件上下文数据
- `created_at`: 事件创建时间

#### MVP 要求

- 只允许服务端写入
- 用户前端不可直接写

### 4.2 `notifications`

#### 作用
表示“系统产生的一条用户通知”。

#### 推荐字段

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.domain_events(id) on delete cascade,

  notification_type text not null,
  priority text not null default 'normal',

  title text not null,
  body text null,
  data jsonb not null default '{}'::jsonb,

  status text not null default 'pending',
  read_at timestamptz null,

  created_at timestamptz not null default now()
);
```

#### 建议约束

- `status` 取值建议：
  - `pending`
  - `partial`
  - `sent`
  - `failed`
  - `cancelled`

#### 说明

- `user_id` 是 recipient
- `event_id` 指向产生它的业务事件
- `data` 用于前端跳转 / 展示附加信息

### 4.3 `notification_deliveries`

#### 作用
记录某条 notification 在某个渠道的一次投递。

#### 推荐字段

```sql
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,

  channel text not null,
  provider text null,
  destination text null,

  delivery_status text not null default 'queued',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz null,
  sent_at timestamptz null,

  provider_message_id text null,
  error_code text null,
  error_message text null,

  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

#### 建议约束

- `channel` 取值：
  - `in_app`
  - `email`
- `delivery_status` 取值：
  - `queued`
  - `sending`
  - `sent`
  - `failed`
  - `skipped`

#### 说明

MVP 里可以直接把 `notification_deliveries` 当作轻量 job queue 使用。

### 4.4 `notification_preferences`

#### 作用
记录用户通知偏好。

#### 推荐字段

```sql
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,

  match_nomination_in_app boolean not null default true,
  match_nomination_email boolean not null default true,

  match_reconfirm_in_app boolean not null default true,
  match_reconfirm_email boolean not null default true,

  match_substitute_urgent_in_app boolean not null default true,
  match_substitute_urgent_email boolean not null default true,

  updated_at timestamptz not null default now()
);
```

#### MVP 原则

- 没有记录时视为默认开启
- Phase 1 可以自动为新用户插默认行，也可以 lazy create

---

## 5. 事件 payload 规范

为避免后面 event 混乱，MVP 就要给 payload 立基本格式。

### 5.1 `match.participant_nominated`

#### 触发时机
某位 user 被 nominate 进入某场 match。

#### payload 建议

```json
{
  "match_id": "uuid",
  "participant_user_id": "uuid",
  "nominated_by_user_id": "uuid",
  "role": "player"
}
```

#### 备注

- `aggregate_id` 已经是 `match_id`
- payload 里保留 `participant_user_id`，方便 resolver 直接取 recipient

### 5.2 `match.time_changed_reconfirm_required`

#### 触发时机
match 关键时间信息发生变化，并且需要参与者重新确认。

#### payload 建议

```json
{
  "match_id": "uuid",
  "old_start_at": "2026-03-08T18:00:00Z",
  "new_start_at": "2026-03-08T19:00:00Z",
  "old_duration_minutes": 120,
  "new_duration_minutes": 90,
  "reconfirm_required": true
}
```

#### recipient 规则
不是 payload 直接写死 recipients，而是由 resolver 根据当前 match participants 决定。

### 5.3 `match.substitute_requested`

#### 触发时机
organizer 发起临时补位 / 缺人请求。

#### payload 建议

```json
{
  "match_id": "uuid",
  "requested_by_user_id": "uuid",
  "slots_needed": 1,
  "urgency": "urgent",
  "starts_at": "2026-03-08T18:00:00Z",
  "message": "Need 1 substitute tonight"
}
```

#### recipient 规则
由 resolver 从 eligible pool 中选定候选 recipients。

MVP 可先简化为：

- 当前 match scope 内有资格且未参加的人
- 或 organizer 指定的 users

---

## 6. 通知类型定义

### 6.1 `match_nomination`

#### 业务含义
你被 nominate 进了一场 match，需要知晓并可能进一步确认。

#### 推荐前端文案

- title: `You were added to a match`
- body: `Open the match to review details and respond.`

#### data 建议

```json
{
  "match_id": "uuid",
  "deep_link": "/matches/{match_id}"
}
```

### 6.2 `match_reconfirm_required`

#### 业务含义
比赛时间已变化，需要重新确认。

#### 推荐前端文案

- title: `Match time changed — reconfirm required`
- body: `The match schedule changed. Please review the update and confirm again.`

#### data 建议

```json
{
  "match_id": "uuid",
  "deep_link": "/matches/{match_id}",
  "old_start_at": "...",
  "new_start_at": "..."
}
```

### 6.3 `match_substitute_urgent`

#### 业务含义
某场 match 临时缺人，正在紧急找 substitute。

#### 推荐前端文案

- title: `Urgent: substitute needed`
- body: `A match needs a substitute soon. Open to see details.`

#### data 建议

```json
{
  "match_id": "uuid",
  "deep_link": "/matches/{match_id}",
  "slots_needed": 1
}
```

---

## 7. Recipient Resolver 规则

这是 MVP 真正的关键逻辑，不是建表本身。

### 7.1 nomination 事件

#### event
`match.participant_nominated`

#### recipients

- `payload.participant_user_id`

#### 不通知给谁

- 不给全体 participant 群发
- 不给 organizer 自己额外发一条，除非未来另有 activity feed 需求

### 7.2 reconfirm 事件

#### event
`match.time_changed_reconfirm_required`

#### recipients
建议为当前 match 中需要重新确认的活跃 participant users。

通常应满足：

- `removed_at is null`
- `participant_accepted_at is not null`
- 此次修改后处于“需要 reconfirm”的人

具体以你当前 authoritative match participant 语义为准。

#### 不通知给谁

- 已退出的人
- 非 user recipient 的 guest/contact 路径先不做
- organizer 是否也收，MVP 建议默认不发，避免噪音

### 7.3 substitute 事件

#### event
`match.substitute_requested`

#### recipients
MVP 可以采用最保守版本：

- organizer 显式选择的一组 user ids
  或
- match scope 内 eligible users（由服务层 resolver 计算）

#### MVP 建议
先不要在 SQL 层做过度复杂“全局智能匹配”。先用服务层 resolver，保证逻辑可调。

---

## 8. 渠道决策规则

### 8.1 总原则

每个 recipient 每种 notification type，根据：

- user preference
- recipient 联系方式是否可用
- priority

生成 1~2 条 delivery。

### 8.2 MVP 默认策略矩阵

| notification_type | priority | in_app | email |
|---|---:|---:|---:|
| match_nomination | normal | yes | yes |
| match_reconfirm_required | high | yes | yes |
| match_substitute_urgent | urgent | yes | yes |

### 8.3 用户偏好生效规则

例如：

#### `match_nomination`
如果：

- `match_nomination_in_app = true` → 建 `in_app` delivery
- `match_nomination_email = true` 且有 email → 建 `email` delivery

否则跳过对应 channel。

### 8.4 email destination

MVP 用已注册用户邮箱：

- `profiles.contact_email` 优先；如果你现阶段没有这列，可直接用 `auth.users.email`

但建议统一封装，不要让业务代码 everywhere 直接查 `auth.users.email`。

---

## 9. In-app Inbox 规则

### 9.1 Inbox 数据来源
前端 inbox 列表读取：

- `notifications`
- 当前用户自己的记录
- 按 `created_at desc`

### 9.2 已读规则
用户打开通知或主动 mark as read 时：

- 更新 `read_at`

### 9.3 前端需要的最小字段
列表至少要展示：

- title
- body
- created_at
- read/unread
- deep_link

---

## 10. Email 规则

### 10.1 Provider
MVP 使用 Resend。

### 10.2 模板策略
先不要做复杂模板引擎。MVP 用简单模板函数即可：

- `renderMatchNominationEmail(notification)`
- `renderMatchReconfirmEmail(notification)`
- `renderMatchSubstituteUrgentEmail(notification)`

### 10.3 必需环境变量

```env
RESEND_API_KEY=...
EMAIL_FROM=PlayerHoods <notifications@playerhoods.com>
NEXT_PUBLIC_SITE_URL=https://playerhoods.com
```

开发环境可暂时：

```env
EMAIL_FROM=PlayerHoods <onboarding@resend.dev>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 10.4 worker 投递要求
email worker 执行时：

1. 找到 `channel='email' and delivery_status='queued'`
2. 标记为 `sending`
3. 调 Resend
4. 成功则 `sent`
5. 失败则 `failed`，并记录 `error_message`

---

## 11. 状态流转建议

### 11.1 notifications.status
推荐聚合规则：

- 初始：`pending`
- 若所有 deliveries sent → `sent`
- 若部分 sent / 部分 failed → `partial`
- 若全部 failed → `failed`

MVP 也可以先简化，前期不强制完全同步这个聚合状态，先确保 `notification_deliveries` 是准确的。

### 11.2 notification_deliveries.delivery_status

```text
queued → sending → sent
queued → sending → failed
queued → skipped
```

---

## 12. 服务边界

### 12.1 前端可以做什么
前端只做：

- 触发业务动作
- 读自己的 notifications
- mark own notifications as read

### 12.2 后端必须做什么
后端负责：

- 业务事务完成
- emit domain event
- process event → create notifications + deliveries
- delivery worker 发消息

### 12.3 严禁的做法
不要让前端直接：

- 发 Resend API
- 插 `domain_events`
- 插别人的 `notifications`

---

## 13. RLS / 权限边界

### 13.1 `notifications`
用户只能：

- `select` 自己的 notifications
- `update read_at` 仅自己记录

不能：

- 插入
- 删除
- 看别人的

### 13.2 `notification_deliveries`
普通用户默认不直接访问。这是内部投递记录。

如果后续你想做 user-facing delivery debug，再加 view，不在 MVP。

### 13.3 `domain_events`
普通用户不直接访问。内部系统表。

### 13.4 写入方式
建议通过：

- service role
- security definer RPC
- server action / backend route

写入 `domain_events` / `notifications` / `notification_deliveries`。

---

## 14. 推荐的实现模式

你当前技术栈偏 Next.js + Supabase，MVP 建议采用：

### 14.1 业务动作完成后 emit event
例如：

- nominate user 成功后
- match 编辑并 commit 成功后
- substitute request 成功后

由服务端插入 `domain_events`。

### 14.2 事件处理器
做一个统一处理入口，例如：

```ts
processDomainEvent(eventId)
```

它负责：

1. 读 event
2. 按 `event_type` 选择 resolver
3. 算 recipients
4. 插 `notifications`
5. 插 `notification_deliveries`

### 14.3 投递 worker
再做一个 worker：

```ts
processQueuedNotificationDeliveries()
```

负责：

- 处理 queued email
- 处理 queued in_app

注意：`in_app` 可以视为“插入 notification 就已完成”，也可以仍然保留一条 `in_app` delivery 记录用于审计。MVP 我建议保留，架构更一致。

---

## 15. 推荐目录结构

```text
src/
  lib/
    notifications/
      event-types.ts
      notification-types.ts
      priorities.ts

      emit/
        emit-domain-event.ts

      resolvers/
        match-participant-nominated.ts
        match-time-changed-reconfirm.ts
        match-substitute-requested.ts

      processors/
        process-domain-event.ts
        process-queued-deliveries.ts

      channels/
        in-app/
          create-in-app-delivery.ts
        email/
          send.ts
          templates.ts

      queries/
        get-user-notifications.ts
        mark-notification-read.ts

      shared/
        preferences.ts
        recipients.ts
        destinations.ts
```

Supabase migration 建议：

```text
supabase/
  migrations/
    20260308xxxxxx_create_domain_events.sql
    20260308xxxxxx_create_notifications.sql
    20260308xxxxxx_create_notification_deliveries.sql
    20260308xxxxxx_create_notification_preferences.sql
    20260308xxxxxx_notifications_rls.sql
```

---

## 16. Phase 1 Migration 清单

建议 append-only，不要混进旧 migration 里改。

### Migration 1
`create_domain_events.sql`

内容：

- 建 `domain_events`
- 索引：
  - `(aggregate_type, aggregate_id)`
  - `(event_type, created_at desc)`

### Migration 2
`create_notifications.sql`

内容：

- 建 `notifications`
- 索引：
  - `(user_id, created_at desc)`
  - `(event_id)`
  - `(status, created_at desc)`

### Migration 3
`create_notification_deliveries.sql`

内容：

- 建 `notification_deliveries`
- 索引：
  - `(delivery_status, created_at asc)`
  - `(notification_id)`
  - `(channel, delivery_status)`

### Migration 4
`create_notification_preferences.sql`

内容：

- 建 `notification_preferences`

### Migration 5
`notifications_rls.sql`

内容：

- notifications select own
- notifications update own read_at only
- 其他表默认不开放给 anon / authenticated 直接写

---

## 17. Resolver / Processor 清单

### 17.1 `match.participant_nominated`
输入：

- event payload

输出：

- 给 `participant_user_id` 建 1 条 `notifications`
- 建：
  - `in_app` delivery
  - `email` delivery（若 enabled）

### 17.2 `match.time_changed_reconfirm_required`
输入：

- event payload + 查询当前 active/affected participants

输出：

- 每个需 reconfirm 的 user 建 1 条 `notifications`
- 建：
  - `in_app`
  - `email`

### 17.3 `match.substitute_requested`
输入：

- event payload + resolver 选出的 eligible user ids

输出：

- 每个 recipient 建 1 条 `notifications`
- 建：
  - `in_app`
  - `email`

---

## 18. 最小 API / RPC 面

MVP 不一定非要全用 SQL RPC，服务层处理通常更灵活。但至少建议明确以下边界：

### 18.1 服务函数

- `emitDomainEvent(...)`
- `processDomainEvent(eventId)`
- `processQueuedNotificationDeliveries(limit?)`
- `markNotificationRead(notificationId)`

### 18.2 前端查询

- `getMyNotifications()`
- `getUnreadNotificationCount()`

---

## 19. 前端页面接入建议

### 19.1 Match 页面
当用户打开 match 页面时，如果由 notification deep link 进入，前端只做正常展示，不在前端做通知逻辑。

### 19.2 Inbox 页面
至少要有：

- unread / all
- title
- body
- created time
- click to deep link
- mark as read

### 19.3 Header Bell
MVP 可先只做：

- unread count
- 点击展开最近 5 条

---

## 20. 验收标准（MVP）

以下 3 个场景通过，即视为 playerhoods.com Notification MVP Spec v1 可验收。

### Scenario A: nomination
当 organizer / eligible user 成功 nominate 某 registered user 进入 match 后：

- 系统创建 1 条 `domain_events`
- 系统为该 user 创建 1 条 `notifications`
- 系统创建对应的 `in_app` delivery
- 若 email enabled，则创建并成功发送 `email` delivery
- 该 user 登录后可在 inbox 看见该通知

### Scenario B: match reconfirm
当 match 时间变更并触发 reconfirm 后：

- 系统创建 1 条 `domain_events`
- 对所有需 reconfirm users 创建各自通知
- 每人各有 `in_app` + `email` delivery
- inbox 可见
- email 模板可带 old/new time 简要信息

### Scenario C: substitute urgent
当 organizer 发起 urgent substitute request 后：

- 系统创建 1 条 `domain_events`
- 对 resolver 计算出的 recipients 创建通知
- priority = `urgent`
- 每人创建 `in_app` + `email`
- worker 可正确投递或记录失败

---

## 21. 当前不建议做的事

你现在最需要避免 4 件事：

### A. 不要页面直接发信
否则以后每个流程都散。

### B. 不要一开始就支持 guest/contact/raw-email 全量分支
会把 recipient 模型复杂度拉爆。

### C. 不要把 provider 状态混进 notifications 主表
投递细节必须独立。

### D. 不要先上 SMS
先把 in-app + email 走顺。

---

## 22. 推荐实施顺序

这是最稳的落地顺序。

### Step 1
先建 4 张表 + RLS。

### Step 2
实现 `match.participant_nominated` 全链路。

### Step 3
实现 inbox UI。

### Step 4
接 Resend，跑通 email。

### Step 5
实现 `match.time_changed_reconfirm_required`。

### Step 6
实现 `match.substitute_requested`。

---

## 23. 最终建议

对 playerhoods.com 来说，通知系统的正确起点不是“先发出邮件”，而是：

> 先把业务事件、用户通知对象、投递记录三层结构立住。

只要这三层立住，后面你再接：

- push
- SMS
- club 通知
- AI 优先级路由

都不会推倒重来。
