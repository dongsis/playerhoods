# playerhoods.com 五大支柱与实施步骤总纲 v1

> 围绕 player 的成长、连接、记忆、组织与服务生态的产品蓝图

**工作基线：** 延续当前的 **Club Members / Invite Circle / Groups** 简化关系模型；**Invite Circle 为单向私有名单，不通知对方。**

---

## 1. 执行摘要

playerhoods.com 的长期价值，不应被定义为“一个约球工具”，而应被定义为“一个围绕 player 运动生活展开的系统”。它以组局为入口，但逐步承接成长、连接、记忆、组织与服务五类价值。

---

## 2. 产品意义：从“凑局工具”到“player operating system”

从用户视角看，这个平台至少承接五类现实需求：

- 我如何持续成长，并记录自己的里程碑、风格与变化。
- 我如何找到合适的人一起打球，而不是总困在原有小圈子里。
- 我如何把一起打过的球，沉淀成长期可用的关系与记忆。
- 我如何让 club 的活动组织更加规律、分工更清楚、manager 与 volunteer 更轻松。
- 我如何在一个本地生态里找到教练、穿线、装备与相关服务。

因此，产品设计不能只围绕单次组局，而要围绕“一个 player 的运动生活”展开。

---

## 3. 五大支柱总览

1. **Player Journey & Player Showcase**
2. **Play Network**
3. **Play Memory**
4. **Club Operations**
5. **Service Ecosystem**

---

## 4. 支柱一：Player Journey & Player Showcase

核心不是“个人资料”，而是“我是谁、我如何成长、我愿意展示什么”。

- **成长记录：** 起点、里程碑、阶段总结、目标、近期练习主题。
- **Player Showcase：** favorite player、gear、赛事足迹、照片、one-line intro。
- **可见性分层：** `private / groups / club / public`。
- **和约球主链路的关系：** 在 Club Members、Invite、Match、Group 场景里帮助别人理解你。

---

## 5. 支柱二：Play Network

这是平台的入口引擎，但目标不是“今天凑够人”，而是建立可持续的打球网络。

- **Club Members：** 同 club 的发现池，用于找人、筛人，不等于关系。
- **Invite Circle：** 我的单向、私有、无通知邀请候选池。
- **Groups：** 稳定圈子，承担长期组织，而不承担轻关系起点。
- **Match / Invite：** 真正触达发生在具体邀请时，而不是 Save 时。
- **自动沉淀：** 一起打过球的人赛后自动进入 Invite Circle。

---

## 6. 支柱三：Play Memory

平台不应让每次球局打完即散，而应形成“我和谁一起打过、留下了什么”的记忆层。

- **共打历史：** 与谁打过、打过几次、在哪些场景。
- **Match 记录：** 时间、地点、人员、结果、照片、公开或私有 notes。
- **合拍与关系沉淀：** 适合补位、节奏合拍、未来愿意再约等。

---

## 7. 支柱四：Club Operations

这是平台从个人工具走向 club 基础设施的关键一层。

- **活动模板：** mixer、shuffle、mixed doubles、level-based recurring event。
- **报名与确认：** 候补、补位、自动提醒。
- **分工：** organizer、volunteer、签到、协调、拍照、赛后总结。
- **活动复盘：** 参与率、缺人情况、重复参与者、下次建议。

---

## 8. 支柱五：Service Ecosystem

不是“做商城”，而是“让和运动生活相关的角色在平台内拥有位置与入口”。

- **Coach：** 展示风格、发 tips、约课、管理学生关系。
- **Stringer：** 发布服务时间、接收穿线请求、发布新线和建议。
- **Gear / Apparel Seller：** 发布试打、上新、club-specific promotion。
- **Role-based feed：** 教练 tips、服务更新、club 活动更新。

---

## 9. 统一信息架构

- **User** 是根对象；一个 user 可拥有多个角色：Player、Coach、Stringer、Organizer 等。
- **Player Profile** 承载基础身份；**Player Showcase** 承载可展示的表达内容。
- **Club Members** 承载“同 club 发现”逻辑；**Invite Circle** 承载“我的私人邀请池”；**Groups** 承载“长期圈子”。
- **Match** 是具体成局容器；**Play Memory** 则让 match 在赛后继续留下痕迹。
- **Club Activities** 是面向 club 的 recurring organizer layer；**Service Ecosystem** 是围绕 player 的角色网络层。

---

## 10. 可见性与权限原则

- **Private：** 仅自己可见；适合私人 note、个人反思、某些关系判断。
- **Groups only：** 仅同 group 可见；适合较熟圈层中的内容。
- **Club only：** 同 club 可见；适合 club discovery 和 club 内社交。
- **Public：** 公开可见；适合用户愿意展示的公开身份与内容。

**设计原则：** 不同圈层看到的不是同一份 profile 的等比缩小版，而是“同一个人，在不同边界下展示不同层次的内容”。

---

## 11. 与当前 schema 的衔接

当前 schema 已经具备相当多的基础骨架，可复用部分包括：

- `profiles / profile_display`：基础个人身份信息。
- `club_identities`：同 club 身份与发现池的基础。
- `groups / group_members`：稳定圈子模型。
- `matches / match_participants / match_participant_actions`：组局与参与者生命周期。
- `notifications`：通知骨架。
- `user_personal_remarks`：私有备注机制，可为后续关系管理提供参考。
- `user_sports`：用户运动偏好基础。

---

## 12. 建议新增的数据对象（按优先级）

### P0：Play Network 核心
- `user_invite_circle`
- `profiles.show_in_club_member_discovery`
- `profiles.allow_non_group_invites`
- `profiles.auto_add_played_users_to_invite_circle`

### P1：Journey / Showcase / Memory
- `user_showcase_sections`
- `user_showcase_items`
- `match_memories` 或等价赛后记录结构
- `played_with_summary`（可由物化视图或聚合视图实现）

### P2：Club Operations
- `club_activity_templates`
- `club_activity_runs`
- `club_activity_roles`
- `club_activity_assignments`
- `club_activity_recaps`

### P3：Service Ecosystem
- `user_roles`
- `coach_profiles`
- `stringer_profiles`
- `service_updates`
- `service_requests`

---

## 13. 实施步骤总图

- **Phase 0：** 概念冻结与数据设计
- **Phase 1：** Play Network Core
- **Phase 2：** Journey + Showcase + Memory
- **Phase 3：** Club Operations
- **Phase 4：** Service Ecosystem

---

## 14. 分阶段实施说明

### Phase 0：概念冻结与数据设计

- [ ] 冻结五大支柱与前台三对象，不再引入新的关系名词。
- [ ] 确认 Invite Circle 为单向私有名单，不通知对方。
- [ ] 确认赛后自动加入 Invite Circle 的判定规则。
- [ ] 列出 schema 变更与最小 RPC/API 面。
- [ ] 统一可见性规则：`private / groups / club / public`。

### Phase 1：Play Network Core（必须先完成）

- [ ] 完成 Club Members 搜索与筛选。
- [ ] 完成 Invite Circle：Save / Remove / List / Invite。
- [ ] 补齐 `allow_non_group_invites` 与 discoverability 设置。
- [ ] 让 Match invite 可以直接从 Club Members / Invite Circle 发起，而不是只能依赖 Group。
- [ ] 验证 end-to-end：发现 → 保存 → 邀请 → 接受 → 成局。

### Phase 2：Journey + Showcase + Memory（平台开始变厚）

- [ ] 为 `profiles` 增加 `headline`、`bio_short` 等最小展示字段。
- [ ] 新增 Player Showcase 模块，至少支持 favorite player、gear、intro、visibility。
- [ ] 新增赛后 summary / photos / result 记录。
- [ ] 新增 played-with history；赛后自动加入 Invite Circle。
- [ ] 在 profile / club member card / invite card 中接入展示摘要。

### Phase 3：Club Operations（从个人工具走向 club 组织层）

- [ ] 支持 recurring 活动模板。
- [ ] 支持 mixer / shuffle / mixed doubles 等活动类型。
- [ ] 支持志愿者与 organizer 的轻分工。
- [ ] 支持活动 recap 与简单统计。
- [ ] 验证对 manager / volunteer 的工作量是否真实下降。

### Phase 4：Service Ecosystem（角色接入）

- [ ] 先开放 Coach profile 与 Coach tips。
- [ ] 再开放 Stringer service profile 与 service request。
- [ ] 控制 feed 规模，避免成为广告墙。
- [ ] 逐步引入本地 gear / apparel seller；先做目录和更新，不急于做重电商。
- [ ] 建立 user 多角色模型。

---

## 15. 优先级判断：什么必须先做，什么暂缓

### 必须先做
- Play Network Core
- Invite Circle
- Club Members 搜索与筛选
- non-group invite 权限控制
- Match 直邀能力

### 第二批做
- Player Showcase 最小版
- played-with history
- 赛后 summary / photo / result
- 自动加入 Invite Circle

### 第三批做
- Club 活动模板与 recurring 组织
- mixer / shuffle
- organizer / volunteer 分工

### 更后面再做
- Coach / Stringer / Seller 角色扩展
- role-based feed
- 更复杂的 marketplace / commerce

---

## 16. 成功判断指标（建议）

- 从 Club Members 到实际成局的转化率。
- 每个活跃用户 Invite Circle 中的有效联系人数量。
- 赛后自动沉淀后，重复共打的比例。
- 从一次性 Match 到稳定 Group 的转化率。
- club 活动组织所需的人力与沟通次数是否下降。
- Coach / Stringer 等角色内容或服务是否真实被使用，而不是沦为陈列页。

---

## 17. 最终建议

从战略上看，playerhoods.com 应坚持“以 player 为中心”的产品世界观：

- 用 **Play Network** 作为最先跑通的入口层。
- 用 **Player Journey & Showcase** 和 **Play Memory** 形成平台厚度。
- 用 **Club Operations** 提升 club 真实运营效率。
- 用 **Service Ecosystem** 扩展为本地运动角色生态，但按节奏推进。

换句话说，playerhoods.com 不是从“约球工具”横向加功能，而是从“player 的运动生活”纵向长出五大支柱。

---

## 附录 A：已明确的关键决策

- Invite Circle 是单向、私有、无通知的名单。
- 真正触达发生在 Invite，而不是 Save。
- 同 club 用户默认可接收 non-group invite，但可以关闭。
- 一起 confirmed 且赛后完成语义成立的用户，可自动进入彼此的 Invite Circle。
- Group 仍然是强关系容器，不承担轻关系起点。
- Player Showcase 属于表达层，不等同于基础 profile。
- Service Ecosystem 先做角色接入，不先做泛 marketplace。
