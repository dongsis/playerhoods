# playerhoods_master_module_priority_and_tech_map_v1

## 1. 文档目的

这份文档把当前讨论过的核心方向合并成一个统一总图，用来回答四件事：

1. 平台有哪些大的模块
2. 每个模块包含哪些具体功能点
3. 近期最应该优先实现哪些
4. 技术上应该如何实现，并为后续扩展打基础

---

## 2. 总体优先级结论

当前阶段最应该优先跑通的主链是：

**Venue / Venue 试点页  
→ Venue Members  
→ Invite Circle  
→ Match / Invite / Booking  
→ AI 辅助创建与导入  
→ 赛后记录 / Reflection  
→ Player Showcase 轻量版**

近期最优先的六大块：

1. Venue / Venue Network 试点基础
2. Play Network 主链
3. AI 操作基础能力
4. Play Memory / 赛后复盘
5. Player Showcase 轻量版
6. Venue Operations 试点活动

第二梯队：

7. Service Ecosystem（Coach / Stringer）
8. 全国 / 全球 club page 大规模扩张

---

## 3. 平台总模块总览表

| 大模块 | 作用 | 近期优先级 | 为什么现在做 / 不做 |
|---|---|---:|---|
| Venue & Venue Network | 建立 club / 场地页面与试点入口 | 很高 | 是冷启动底座，没有 club 锚点，后续很难聚合用户 |
| Player Journey | 个人成长记录与里程碑 | 中 | 很重要，但先做轻量版，不必一开始太重 |
| Player Showcase | 个人展示空间 | 高 | 能帮助弱连接破冰，提升识别度 |
| Play Network | 找人、存人、组局、长期圈子 | 最高 | 这是当前产品主线和核心价值入口 |
| Play Memory | 共打记录、照片、结果、复盘 | 高 | 让平台不只是工具，而是有沉淀 |
| Venue Operations | 俱乐部活动组织与分工 | 中高 | 很有价值，但应先从一个场景试点 |
| Service Ecosystem | 教练、穿线、装备服务生态 | 中 | 先做角色入口，不急着做全套商业化 |
| AI Capability Layer | 对话创建、截图识别、邮件解析、赛后对话 | 最高 | 能显著降低录入和操作成本，是核心差异化能力 |

---

## 4. 近期最值得先做的大块排序表

| 排名 | 大块 | 近期目标 |
|---:|---|---|
| 1 | Play Network | 先把“找人—存人—邀请—成局”主链做通 |
| 2 | Venue & Venue Network | 先做 1 个 club 试点页和基础 club 数据结构 |
| 3 | AI Capability Layer | 先做最省操作的 AI 功能：对话建局、截图导入、booking 解析 |
| 4 | Play Memory | 先做打完球后的记录和赛后复盘 |
| 5 | Player Showcase | 先做最轻的“我是怎样的球友”展示 |
| 6 | Venue Operations | 先做 1 个 recurring / mixer 活动试点 |
| 7 | Service Ecosystem | 先做 coach / stringer profile 入口 |
| 8 | Player Journey 深化 | 后续再加强成长时间线、年终总结等 |

---

## 5. 分模块功能与技术地图

### A. Venue & Venue Network（俱乐部 / 场地网络）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 为什么能为后续打基础 |
|---|---|---|---|---|
| Venues 表 | 立即做 | 存 club 基础信息 | `venues` 表 + slug + address + geo | 后续 Venue Members / 活动 / 教练 / venue page 都依赖它 |
| Venues / Courts 表 | 立即做（可先简） | 场地与 court 信息 | `venues` / `courts` 表 | booking、court record、活动页都需要 |
| Venue Page 模板 | 立即做 | 每个 club 一个聚合入口页 | 动态路由 + 模板渲染 | 未来可扩到 Canada / 全球 |
| Claim this Venue | 稍后 | 让 club manager / organizer 认领页面 | `club_claims` 表 + 角色审批 | 为 club 运营和增长做入口 |
| Venue 图片 | 谨慎做 | 不默认抓官网图 | 用户上传 / 自拍 / 授权 / 合规来源 | 避免版权问题，同时保留扩展空间 |
| Venue Members 聚合入口 | 立即做 | 在 club 页下聚合用户 | `venue_identities` + user join flow | 是 Play Network 的入口 |

#### 近期结论
先做：
- `venues`
- `venues`
- `courts`
- `venue_identities`
- `/venues/[slug]`

先不做：
- 全量全球导入
- 重 SEO 内容运营
- 批量官网文案 / 照片抓取

---

### B. Play Network（找人 / 存人 / 组局）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Venue Members | 立即做 | 同 club 找人池 | 基于 `venue_identities` + `profiles` 查询 | 冷启动最关键入口 |
| Invite Circle | 立即做 | 私有、单向、无通知 | 新表 `user_invite_circle` | 比 group 更轻，符合真实场景 |
| Groups | 保持已有 | 稳定圈子 | 延续现有 groups / members | 不改核心治理 |
| Non-group Invite | 立即做 | 同 club 可直接 invite | 新增用户设置 + match invite 通道 | 解决“没进 group 也能约” |
| 自动加入 Invite Circle | 立即做 | 一起打过球后自动加入 | match 完成后写入 invite circle | 形成自然关系沉淀 |
| Preferred fill-in / backup tags | 稍后 | 按用途分类 invite circle | 在 invite circle 增加 tag/type | 为智能推荐打基础 |

#### 关键定稿规则
- Invite Circle 不通知对方
- Save 到 Invite Circle 不需要确认
- 真正触达发生在 Invite
- Group 仍然是强关系容器

#### 近期技术建议
新增：
- `user_invite_circle`
- `show_in_venue_member_discovery`
- `allow_non_group_invites`
- `auto_add_played_users_to_invite_circle`

---

### C. Match / Booking 主链

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Match Draft | 立即做 | 先建草案，再确认 | `match_draft` 或 draft JSON 层 | AI 创建 match 的落点 |
| Match 正式创建 | 立即做 | 从草案生成 match | 复用现有 matches / participants | 保持现有核心模型 |
| Invite to Match | 立即做 | 从 Venue Members / Invite Circle 发 invite | 复用现有 match invite 逻辑 | 这是成局核心 |
| Booking Request Draft | 立即做 | AI 帮写订场邮件草稿 | `booking_request_draft` | 让平台走向真实执行 |
| Booking Record | 立即做 | 保存俱乐部回信后的定场记录 | `booking_records` | 为后续通知、留档、日历同步打基础 |
| Venue Reply Parser | 立即做 | 解析 club 回信 / 截图 | parse pipeline + booking matcher | 降低 organizer 操作成本 |
| Participant Update | 立即做 | 场地确认后通知参与者 | `participant_notification_draft` | 把平台真正变成执行平台 |

#### 参与者通知关键环节（Participant Notification Events）

以下关键环节需向参与者发送通知，发送通道按用户偏好：`contact_channel` 为 email 则发邮件，为 sms 则发短信；未设置则回退到注册邮箱。

| 触发环节 | 说明 | 接收者 | 技术方向 |
|---|---|---|---|
| **Game formed** | 比赛成局（人数凑齐、场地确认等） | 所有 confirmed 参与者 | 事件触发 + 通知队列 |
| **Match time change pending** | 比赛改时间待确认（date/time/duration 变更，需 reconfirm） | 所有 confirmed 参与者（除 organizer） | 与 `fn_match_detail_change_reconfirm` 联动 |
| **Invite / Nominate** | 被邀请或提名加入比赛 | 被邀请/提名者 | 已有 invite 流程，可加外发通知 |
| **Booking confirmed** | 场地订场确认 | 所有 confirmed 参与者 | 与 booking record 联动 |
| **Participant removed** | 被移出比赛 | 被移除者 | remove 动作后触发 |

#### 通知发送通道逻辑（Delivery Channel）

| 用户设置 | 发送方式 | 技术实现 |
|---|---|---|
| `contact_channel = 'email'` | 邮件 | 使用 `contact_email`；若为空则用 `auth.users.email` |
| `contact_channel = 'sms'` | 短信 | 使用 `contact_phone`；需接入短信服务（见下） |
| 未设置 / 默认 | 邮件 | 回退到注册邮箱 `auth.users.email` |

**短信接入考虑：**

- 可选服务商：Twilio、AWS SNS、Supabase Edge Functions + 第三方 API 等
- 需 `profiles.contact_phone` 有效且格式校验
- 若 `contact_channel=sms` 但 `contact_phone` 为空，应回退到邮件
- 成本与限流需在 Phase 2+ 评估

---

### D. AI Capability Layer（AI 操作能力层）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 为什么优先 |
|---|---|---|---|---|
| 对话创建 Match Draft | 立即做 | 用户说一句，系统生成草案 | LLM + structured output / function schema | 直接降低组局成本 |
| 截图导入联系人 | 立即做 | 从短信 / 邮件 / 名单截图识别人 | 图片识别 + parser + review UI | 极实用，落地快 |
| 粘贴文本导入 Invite Circle | 立即做 | 从文本名单导入 | parser + candidate review | 很容易先做 |
| Booking 邮件解析 | 立即做 | club 回信自动解析 | 邮件文本 parser + confidence review | 直接节省 organizer 时间 |
| Booking 邮件草稿生成 | 立即做 | 自动帮写订场邮件 | prompt + structured payload | 非常实用 |
| 参与者通知草稿生成 | 立即做 | 自动起草通知 | LLM draft + confirmation | 连上 booking 主链 |
| 通讯簿导入 | 稍后做 | 从手机联系人导入 | 原生 app contacts API | 适合 app 阶段 |
| 邮箱连接 | 稍后做 | Gmail / Outlook 读取 | OAuth + connector | 有价值但复杂度较高 |
| 语音对话 | 稍后做 | 语音创建 / 语音复盘 | STT / TTS / Realtime | 值得做，但不必先上 |
| AI 审计与确认层 | 立即做 | 所有 AI 行为先确认 | `ai_action_drafts` + logs | 这是安全底座 |

#### 统一技术路线
AI 这层不要做成“一个聊天框”，而要做成：

**LLM 理解层  
→ Structured Output / Function Schema  
→ Draft Object  
→ User Confirm  
→ Execute**

---

### E. Play Memory（共打记忆）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Played-with history | 立即做 | 我和谁打过几次 | 基于 match participants 聚合视图 | 关系沉淀的基础 |
| Match summary / note | 立即做 | 对某场球写小结 | `match_notes` / `match_reflections` | 平台不再只是调度工具 |
| Photos | 立即做（轻量） | 一场球 1–4 张图 | `match_media` | 增强回忆和社交温度 |
| Result record | 立即做（可选简版） | 记分或结果 | `match_results` | 形成 Play Memory |
| 私有标签 | 稍后 | 例如“适合补位”“配合不错” | 私有 remark / tag 层 | 有价值，但要注意边界 |
| Travel / flying play | 稍后 | 异地打球记录 | club / venue + match 拓展 | 是好延展，但不是首要 |

---

### F. Post-Play Reflection（赛后复盘，对话式）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Start Reflection 入口 | 立即做 | 打完球后轻提示 | match end trigger + UI prompt | 让 Play Memory 发生 |
| 文字版赛后复盘 | 立即做 | 先做文字对话 | 多轮对话 + reflection schema | MVP 最合适 |
| 结构化总结卡 | 立即做 | strengths / weaknesses / next focus | structured output | 可存档、可回顾 |
| 心理安抚 | 立即做（轻量） | 打差了时的 gentle reset | 对话策略 | 有明显陪伴价值 |
| 拉伸 / 恢复提醒 | 立即做（轻量） | 打完后的恢复建议 | rule + LLM summary | 体验很好 |
| 语音赛后复盘 | 稍后 | 更自然的赛后对话 | STT + TTS + realtime | 值得做但放第二阶段 |
| 分享给 coach / group | 稍后 | 可选分享摘要 | visibility scope | 为教练系统打基础 |

#### 说明
赛后复盘和对话创建 match draft 用的是同一底层 AI 栈，只是上层话术和结构对象不同。

---

### G. Player Showcase（个人展示）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Headline / short intro | 立即做 | 一句话介绍自己 | profiles 扩字段或独立 section | 弱连接破冰第一步 |
| Favorite players | 立即做 | 喜欢的球星 | showcase item | 很自然的身份表达 |
| Gear cards | 立即做（轻量） | 主拍、备拍、球鞋 | text + optional image | 很适合网球用户 |
| Sports moments | 稍后 | 看过的比赛 / 去过的赛事 | event cards | 有温度，但次于主线 |
| Photos / highlights | 稍后 | 个人打球照片 | media layer | 增强表达性 |
| Visibility scope | 立即做 | private / group / club / public | 内容分层可见性 | 非常重要的边界基础 |

#### 技术建议
首版不要做重装备数据库。先做：
- section + item
- text + image
- visibility scope

---

### H. Player Journey（成长）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 说明 |
|---|---|---|---|---|
| 基础成长简介 | 稍后轻做 | 我的起点 / 目标 | showcase / profile 扩展 | 先轻量表达 |
| Milestones | 稍后 | 第一次比赛、第一次混双等 | milestone table | 有价值，但不是 MVP |
| Training focus | 稍后 | 最近在练什么 | journey note | 可与赛后复盘联动 |
| 年度总结 | 后期 | 自动回顾成长 | analytics + summary | 很有品牌感，但后做 |

#### 结论
Player Journey 很重要，但近期不需要重做。可以先由：
- Showcase
- Reflection
- Played-with history  
这三块代替其早期价值。

---

### I. Venue Operations（俱乐部组织）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Venue Activity 基础对象 | 立即做（简版） | 一场俱乐部活动 | `club_activities` | 试点 mixer 的底座 |
| Mixer / Shuffle | 近期做 | 同 level 随机撮合活动 | activity + draw logic | 很适合试点 |
| Recurring activity | 稍后 | 每周固定活动 | recurrence model | 一旦试点成功很有价值 |
| Volunteer / organizer roles | 稍后 | 谁负责什么 | roles / assignments | 很重要，但第二阶段 |
| Signup / waitlist | 近期做 | 报名和候补 | activity participants + waitlist | 活动要能跑 |
| Activity recap | 稍后 | 活动总结与照片 | activity media / summary | 后续增强 |

#### 结论
Venue Operations 不要一开始铺太大。先做：
- 一个 club
- 一个活动类型
- 一套最小报名与确认流程

---

### J. Service Ecosystem（教练 / 穿线 / 服务角色）

| 子功能点 | 近期是否做 | 说明 | 技术方向 | 基础价值 |
|---|---|---|---|---|
| Coach Profile | 近期做 | 教练展示页 | role profile model | 很自然、需求真实 |
| Lesson request | 近期做 | 约课请求 | request object | 比做支付简单、也够有用 |
| Coach tips feed | 稍后 | 一句话 tips / 小建议 | role posts | 先不做大 feed |
| Stringer Profile | 近期做 | 穿线服务页 | role profile model | 很贴地气 |
| Stringing request | 近期做 | 接拍 / 穿线需求 | request object | 实用性很高 |
| Shop / seller profile | 稍后 | 装备 / 服饰服务 | role profile | 放第二梯队 |
| Full marketplace | 后期 | 订单、库存、支付 | commerce stack | 暂时不要碰太早 |

#### 技术路线
先做 role-based profile：
- user
- player role
- coach role
- stringer role
- organizer role

这比一开始做 marketplace 更对。

---

## 6. 近期 MVP / Phase 1 最值得实现的功能点

### 第一批：必须先做

| 模块 | 功能点 |
|---|---|
| Venue & Venue | venues、venues、courts、club page 基础模板 |
| Play Network | Venue Members、Invite Circle、non-group invite、auto-add after play |
| Match / Booking | match draft、invite、booking request draft、booking record、参与者通知（成局 / 改时间待确认 / 订场确认） |
| AI | 对话创建 match draft、截图导入联系人、booking 邮件解析、通知草稿 |
| Play Memory | played-with history、match note、轻量照片 |
| Reflection | 文字版赛后复盘 + 总结卡 |
| Showcase | headline、intro、favorite player、gear 轻量展示、visibility |

### 第二批：一旦第一批跑通就接着做

| 模块 | 功能点 |
|---|---|
| Venue Operations | mixer / shuffle 试点、signup / waitlist |
| Service Ecosystem | coach profile、lesson request、stringer profile、stringing request |
| AI | 通讯簿导入、邮箱连接、语音版操作 |
| Memory / Journey | milestone、more photos、event records |

---

## 7. 按优先级的路线图表

### Phase 0：定模型，不扩功能面
目标：
- 固定核心产品语言
- 确认数据对象和边界规则
- 不急着全量铺功能

重点确认：
- Venue Members
- Invite Circle
- Groups
- Match Draft
- Booking Record
- Reflection
- Showcase
- Venue Activity
- Role Profile
- AI Draft / Confirm 模式

---

### Phase 1：把主链跑通
目标：
- 一个 club 内的真实组局与定场闭环
- 降低 organizer 录入和沟通成本
- 开始沉淀赛后记录

功能：
- venues / venues / courts
- club page
- Venue Members
- Invite Circle
- non-group invite
- match draft
- booking request draft
- booking record
- 参与者通知（成局、改时间待确认、订场确认；按 contact_channel 发邮件/短信，未设则发注册邮箱）
- AI 对话建局
- AI 截图导入
- booking parser
- reflection 文字版
- showcase 轻量版

---

### Phase 2：加强沉淀与活动
目标：
- 不只是成局，还开始形成关系和活动节奏

功能：
- played-with history
- photos / notes / results
- mixer / shuffle
- signup / waitlist
- auto-add after play
- activity recap

---

### Phase 3：加强连接器与移动能力
目标：
- 更强的导入、更少的人工操作

功能：
- 通讯簿导入
- Gmail / Outlook 连接
- Calendar sync
- 语音对话
- 语音赛后复盘

---

### Phase 4：角色生态和更长线能力
目标：
- 从 player-only 平台扩到 sports role ecosystem

功能：
- coach profile
- lesson request
- stringer profile
- stringing request
- tips feed
- milestones
- journey recap

---

## 8. 按数据库实体拆解表

### 8.1 基础实体（现有或应继续沿用）

| 实体 | 用途 |
|---|---|
| `profiles` | 用户基础资料 |
| `venue_identities` | 用户与 club 的归属关系 |
| `groups` | 稳定圈子 |
| `group_members` | group 成员关系 |
| `matches` | 比赛 / 局 |
| `match_participants` | 比赛参与者 |

### 8.2 近期新增核心实体

| 实体 | 用途 | 优先级 |
|---|---|---:|
| `venues` | 俱乐部基础信息 | 高 |
| `venues` | 场地地点 | 高 |
| `courts` | 具体球场 | 高 |
| `user_invite_circle` | 私有邀请候选池 | 最高 |
| `match_draft` | AI / 用户确认前的比赛草案 | 高 |
| `booking_request_draft` | 订场请求草稿 | 高 |
| `booking_records` | 订场确认记录 | 高 |
| `participant_notification_draft` | 通知草稿 | 高 |
| `match_reflections` | 赛后复盘结构化结果 | 高 |
| `match_reflection_messages` | 赛后复盘对话记录 | 中高 |
| `match_notes` | 比赛简记 | 高 |
| `match_media` | 比赛照片 | 中高 |
| `match_results` | 比赛结果 | 中 |
| `club_activities` | 俱乐部活动 | 中高 |
| `activity_participants` | 活动报名 / 候补 | 中高 |
| `role_profiles` | 教练 / 穿线等角色资料 | 中 |
| `service_requests` | 约课 / 穿线请求 | 中 |
| `ai_action_drafts` | AI 结构化提案 | 高 |
| `ai_action_logs` | AI 动作执行日志 | 高 |
| `notification_events` 或 `notification_queue` | 参与者通知事件 / 发送队列 | 中高 |

### 8.3 建议新增到 profile / settings 的字段

| 字段 | 用途 |
|---|---|
| `show_in_venue_member_discovery` | 是否显示在 Venue Members |
| `allow_non_group_invites` | 是否允许非 group 邀请 |
| `auto_add_played_users_to_invite_circle` | 一起打过后是否自动加入 Invite Circle |
| `headline` | 展示的一句话介绍 |
| `bio_short` | 轻量个人简介 |
| `contact_channel` | 通知偏好：`email` \| `sms`（已有） |
| `contact_email` | 通知用邮箱，NULL 则用 auth 注册邮箱（已有） |
| `contact_phone` | 短信用手机号，`contact_channel=sms` 时使用（已有） |

---

## 9. 按页面信息架构拆解表

### 9.1 顶层页面结构建议

| 页面模块 | 作用 |
|---|---|
| My Game | 个人成长与展示 |
| My People | 找人、Invite Circle、Groups |
| My Play | match、记录、照片、复盘 |
| My Venue | club 页面、活动、报名 |
| Services | coach、stringer、service requests |
| AI / Ask | 对话、导入、解析、创建草案 |

### 9.2 My People

| 页面 | 功能 |
|---|---|
| Venue Members | 搜人、筛选、Save、Invite |
| Invite Circle | 管理私人邀请名单 |
| Groups | 稳定圈子管理 |
| Played With | 和谁打过球的历史关系页 |

### 9.3 My Play

| 页面 | 功能 |
|---|---|
| Match List | 我组织 / 我参与的局 |
| Match Detail | 参与者、booking、照片、notes |
| Reflection | 赛后复盘入口与总结卡 |
| Play History | 一起打过的历史与统计 |

### 9.4 My Game

| 页面 | 功能 |
|---|---|
| Showcase | 一句话介绍、球星、gear、可见性 |
| Journey | milestone / training focus（后续） |
| Highlights | 照片 / moments（后续） |

### 9.5 My Venue

| 页面 | 功能 |
|---|---|
| Venue Page | club 基础资料、成员聚合、活动 |
| Venue Activities | mixer / shuffle / recurring 活动 |
| Activity Detail | 报名、候补、通知、总结 |

### 9.6 Services

| 页面 | 功能 |
|---|---|
| Coach Profiles | 教练展示 |
| Lesson Request | 约课 |
| Stringer Profiles | 穿线服务展示 |
| Stringing Request | 穿线请求 |

### 9.7 AI / Ask

| 页面 / 入口 | 功能 |
|---|---|
| Ask / Speak | 对话式创建 match |
| Import | 截图 / 文本 / 联系人导入 |
| Booking Parser | 邮件 / 截图解析 |
| Reflection Coach | 赛后复盘对话 |

---

## 10. 技术实现总方向

### 10.1 数据层
建立稳定域模型：
- venues / venues / courts
- profiles / club identities
- groups / matches / participants
- invite circle / booking / reflection / activities / roles

### 10.2 AI 层
统一走：

**User input  
→ LLM 理解  
→ Structured Output / Function Schema  
→ Draft Object  
→ Human Confirm  
→ Execute**

### 10.3 前端层
前台逐步收敛为：
- My Game
- My People
- My Play
- My Venue
- Services
- AI / Ask

### 10.4 移动端 / 原生能力
后续如果要支持：
- 通讯簿导入
- 语音
- 系统分享截图 / 邮件进平台

则需要：
- 原生 App
- 或 Share / Import 入口

近期可先用：
- Web + 文件上传 + 文本粘贴 + 邮件转发

---

## 11. 最终建议

### 当前最值得优先推进的 12 个功能点

1. `venues / venues / courts`
2. `club page`
3. `Venue Members`
4. `Invite Circle`
5. `non-group invite`
6. `auto-add after play`
7. `match draft`
8. `booking request draft`
9. `booking record parser`
10. `screenshot / text contact import`
11. `post-play reflection`
12. `showcase 轻量版`

### 这 12 个点做出来之后，平台就具备了：
- club 聚合入口
- 找人和成局主链
- organizer 降本
- 赛后沉淀
- 用户可被理解的展示层

---

## 12. 一句话总结

**playerhoods.com 当前阶段最合理的路线，不是同时铺开所有愿景，而是先把 “club 锚点 + 找人组局 + AI 降操作 + 赛后沉淀 + 轻展示” 这一条主链做扎实。**

这样既能解决真实痛点，也能为后续：
- club operations
- service ecosystem
- player journey
- 更强 AI 能力

打下统一底座。
