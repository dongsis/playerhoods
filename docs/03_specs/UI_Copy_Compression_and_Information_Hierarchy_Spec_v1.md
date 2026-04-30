# UI 文案压缩与信息层级规范 v1

**Status:** active UI copy rule  
**Effective date:** 2026-04-13  
**Scope:** Hoods、match admission、Create / Add People 相关页面的默认文案密度、信息层级与交互提示规则  
**Authority note:** 本文档约束前端默认显示的说明文案、提示层级和信息暴露方式。若旧页面文案或历史实现与本文档冲突，以本文档为准。

---

## 1. 总体原则

当前 `create` / `add people` 页面的问题，不是功能太少，而是默认展开的信息太多：

- 每个区块都在解释规则
- 说明文字抢走了主操作的视觉重心
- 页面不够简洁，不利于快速选人

本轮统一采用 **Progressive Disclosure**：

- 默认只显示完成当前操作所必需的信息
- 解释性文字收进 `?` info icon、popover 或 tooltip
- 只有真正影响当前结果的提示，才允许常驻页面

最终目标是：**页面先让人做事，再让人理解规则。**

---

## 2. 信息分层

所有页面文案统一分为 4 层。

### 2.1 Layer 1：默认常驻信息

用户一进入页面就必须看到的信息。

包括：

- 区块标题
- 当前已选结果
- 当前为空时的空状态
- 错误、限制、不可执行原因
- 主要按钮

这类信息必须直接显示，不能藏。

### 2.2 Layer 2：轻量辅助文案

默认可以显示，但必须非常短。

包括：

- 一句副标题
- 一句状态摘要
- 一句空状态说明

要求：

- 最多一行
- 不写机制细节
- 不写长句教学文案

### 2.3 Layer 3：解释性规则文案

这类说明不要常驻页面，统一放进：

- `?` info icon 点击后的 popover
- hover tooltip
- 首次使用的一次性引导

包括：

- `Invite People` 的含义
- `Invite Groups` 的加入机制
- `Visible to Groups` 与 request 的关系
- 为什么 group invite 不会立刻把所有人加进 roster
- `contact / group / saved` 的概念说明

### 2.4 Layer 4：高级详情

这类信息放进：

- detail drawer
- preview card
- `View details`

包括：

- group 来源
- linked 详情
- contact 原始信息
- 更完整的 profile / context
- 历史操作说明

---

## 3. 必须常驻显示的文案

以下内容必须在页面默认可见。

### 3.1 区块标题

例如：

- `Invite People`
- `Invite Groups`
- `Visible to Groups`

标题不能藏。

### 3.2 当前选择结果

例如：

- `3 people selected`
- `1 group invited`
- `No groups selected`

用户必须随时知道当前做了什么。

### 3.3 空状态

例如：

- `No people selected`
- `No groups available`
- `No contacts available`

空状态必须直接显示，不能藏。

### 3.4 错误、限制、不可执行原因

例如：

- `This contact needs email or phone before it can be invited`
- `No remaining spots`
- `You can only invite registered members through groups`

这类信息绝不能藏进 tooltip 或说明弹层。

---

## 4. 必须收起的文案

以下内容原则上不应常驻页面。

### 4.1 长段落机制说明

例如：

- `Invites will be sent to these players after the match is created`
- `These players can see the match and request to join`
- `Saved Players stay private...`
- `Confirmation still requires both participant acceptance and host confirmation`

这些都属于机制解释，不属于当前操作结果。

### 4.2 教学型说明

例如：

- `Click a player to add or remove...`
- `Use the secondary Info action...`

这种说明不要默认常驻。

### 4.3 数据来源枚举长句

例如：

- `Frequent Players (0), Contact Players (0), Saved Players (0), Club Members (3)`

这类信息可以作为轻量统计或 filter 信息存在，但不要写成长段说明。

---

## 5. 解释性交互规则

### 5.1 以 `?` info icon 为主，hover 为辅

不要只依赖 hover，因为：

- 移动端没有 hover
- 触控设备体验不稳定
- hover 不能作为唯一信息入口

### 5.2 推荐模式

每个需要解释的模块标题右侧放一个 `?` info icon。

点击后打开一个小 popover，里面写清楚该模块规则。桌面端可以支持 hover 预览，但点击必须可用。

### 5.3 Info popover 要求

- 内容简短
- 一次只讲一个模块
- 不写太多例外
- 不超过 3 到 4 行正文

示例：

`Invite Groups`

> Invite all eligible registered members of a shared group. Members are not added immediately. They join only if they accept.

`Visible to Groups`

> These groups can see the match and request to join. Visibility does not directly invite members.

---

## 6. Create / Add People 页面详细压缩规则

### 6.1 A. Invite People

页面上必须保留：

- 区块标题 `Invite People`
- `?` info icon
- 搜索框
- 名字按钮列表
- 当前已选人数或空状态

结果文案示例：

- `No people selected`
- `3 people selected`

页面上不要常驻：

- `Click a player to add or remove...`
- `Use the secondary Info action...`
- `From saved, trusted contact players...`
- 各种流程解释段落

建议 popover 文案：

> Invite specific people to this match. This includes saved players and eligible contact players. Select one or more names to invite.

### 6.2 B. Invite Groups

页面上必须保留：

- 区块标题 `Invite Groups`
- `?`
- group name buttons
- 当前已选 groups summary

结果文案示例：

- `No groups invited`
- `2 groups invited`

页面上不要默认常驻：

- `Invite all eligible registered members...`
- `They are not added now...`
- 其他长解释段

建议 popover 文案：

> Invite all eligible registered members of selected shared groups. This does not add everyone immediately. A member joins only after accepting.

### 6.3 C. Visible to Groups

页面上必须保留：

- 标题 `Visible to Groups`
- `?`
- group selection buttons
- 当前结果摘要

结果文案示例：

- `No groups selected`
- `1 group can see this match`

页面上不要长期显示：

- `These players can see the match and request to join`
- 其他机制说明整段文字

建议 popover 文案：

> These groups can see this match. Members are not directly invited. They may request to join if they are interested.

### 6.4 D. 右侧 Summary / 结果区

这个区域只显示结果，不重复解释机制。

保留：

- `Selected People`
- `Invited Groups`
- `Visible Groups`

每块只显示两类信息：

1. 当前已选项  
2. 空状态

示例：

- `Leo`
- `Linda`
- `fire`
- `women doubles`
- `No people selected`
- `No groups invited`
- `No visibility groups selected`

不要显示：

- `Invites will be sent after creation`
- `These players can see...`
- 其他机制说明大段话

原因：这些解释已经由 `?` 承担，不应再次挤占结果区。

---

## 7. Contact 相关文案压缩规则

前提：`contact` 不再单独做成一个大块特殊后台，因此文案也必须同步简化。

### 7.1 不要使用的大标题

不要把下面这类文案做成独立大 section：

- `Direct Invite Contact Player`
- `Create a new Contact Player`

### 7.2 推荐入口

将“创建 contact 并邀请”收进 `Invite People` 区块底部的轻入口：

- `Create new contact & invite`

点击后再打开小型 inline form 或 modal。

### 7.3 页面上保留什么

只保留字段标签和必要限制：

- `Name`
- `Email`
- `Phone`
- `Notes`
- `Email or phone required`

不要保留：

- 为什么需要 email / phone 的长解释
- contact 机制全量说明

如需解释，放进旁边的 `?`。

---

## 8. 人名选择区简化规则

默认只显示极简信息，并支持多选。

### 8.1 页面上不要出现

- 每个候选人一堆标签
- `你可以点 Info 查看详情` 之类的常驻说明
- 大段来源解释

### 8.2 页面上保留

- 名字按钮
- 头像
- 简单 selected state
- 可选的 `Info` 或头像点击入口

### 8.3 详情说明放哪里

点击头像或 `Info` 后，在 preview / drawer 中再显示：

- `Contact / Saved / From Group`
- group 名称
- club
- gender
- level
- 其他 context

---

## 9. Filter / Source 文案压缩规则

如果页面需要显示：

- `Contacts`
- `Saved`
- `From Groups`
- `Club Members`

不要再为每个来源配长句说明。

推荐做法：

- 直接显示为 filter chips
- 如需解释，hover 一句或统一放进页面级 `?`

禁止做法：

- 每个 filter 下再写一段机制解释

---

## 10. 通知与状态提示压缩规则

### 10.1 页面内提示优先做成 info strip

例如：

- `2 new people entered your Tennis Hood`
- `1 contact is now linked`

不要展开成多个说明段落。

### 10.2 说明性状态不要占大面积

例如：

- `This group is visible to...`
- `These players may request...`

这类内容不应占据单独大盒子，只在需要时点开查看。

---

## 11. 文案长度硬规则

为防止默认文案继续膨胀，统一使用以下长度限制。

### 11.1 区块级文案限制

- 标题：最多 3 个词
- 副文案：最多 1 行，约 12 个词；无必要可省略
- popover 正文：最多 3 句，约 40 个词
- 空状态：最多 1 句
- 错误 / 限制提示：最多 1 句，直接说后果

### 11.2 风格限制

- 用结果导向，不用解释导向
- 多用短句，少用教学句
- 解释放到 `?`，正文只留动作

示例：

好：

- `No people selected`
- `2 groups invited`
- `Email or phone required`
- `Invite specific people`

不好：

- `These invites will be sent after...`
- `Use this section to...`
- `This means that...`
- `Here you may choose to...`

---

## 12. Summary Boxes 规则

Summary boxes 只展示结果，不展示机制解释。

应保留：

- `Selected People`
- `Invited Groups`
- `Visible Groups`

应展示：

- selected counts
- selected chips / names
- empty states

不应展示：

- invite / request 流程说明
- 重复性的解释文案
- 与主操作无关的教学句

---

## 13. 可直接提供给 Codex 的实现要求

以下内容可直接复制给 Codex 或实现代理：

```text
Copy Density Rules

Reduce default on-page explanatory copy across Hoods and match admission UIs.

Core rule

Default page content should prioritize:

actions
selected results
empty states
errors / hard constraints

Concept explanations should not be rendered as persistent paragraphs.

Use progressive disclosure

Move most mechanism explanations into:

clickable ? info icons
popovers
optional hover tooltips

Do not rely on hover alone. Clickable info popovers must work on non-hover devices.

Keep visible by default

Keep these visible:

section titles
selected counts / selected chips
empty states
validation / error / restriction messages
primary action buttons

Hide by default

Move these out of the main layout:

long mechanism explanations
teaching copy (“click here to...”)
duplicated explanatory text in summary boxes
repeated descriptions of invite/request flows

Copy length limits

section titles: short, max 3 words
optional subtitle: max 1 line
popover body: max 3 short sentences
empty state: max 1 sentence
restriction/error text: max 1 sentence

Summary boxes

Summary boxes should show results only:

Selected People
Invited Groups
Visible Groups

They should not contain mechanism explanations.

Info popovers

Each of the following may have a ? icon:

Invite People
Invite Groups
Visible to Groups

Popover content should explain only that module, briefly.
```

---

## 14. 最终效果目标

改完之后，页面应满足以下状态：

- 区块标题清楚
- 候选人 / 群按钮清楚
- 当前已选结果清楚
- 错误 / 限制清楚
- 页面不再被长段说明压住

换句话说：

**页面先让人做事，再让人理解规则。**
