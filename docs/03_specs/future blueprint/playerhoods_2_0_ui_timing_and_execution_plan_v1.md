# playerhoods.com 2.0 UI Timing and Execution Plan v1

## 0. 文档定位

本文件用于回答 playerhoods.com 当前阶段的一个关键决策：

> UI 是应该等到 2.0 功能基本完成后再做，还是现在就启动？

结论是：

> 现在就启动 UI，但只启动“结构级 UI / 流程级 UI / 组件级 UI”，暂不进入重视觉 polish。

本文件给出：

- 为什么不能完全等 2.0 做完再动 UI
- 为什么现在也不该全面精修视觉
- 最合适的并行推进策略
- 页面优先级与执行顺序
- 哪些 UI 工作现在做，哪些后置
- playerhoods.com 当前阶段的推荐节奏

---

## 1. 执行结论

对 playerhoods.com 来说，当前最佳策略不是：

- 等 2.0 全做完再做 UI
- 也不是现在就全面 polish 所有界面

而是：

> 功能继续推进 2.0，同时启动一层“结构级 UI 整理”。

也就是说：

- 现在开始做 UI
- 但只做骨架、结构、流程、组件语义统一
- 暂时不做最终视觉封版和像素级打磨

---

## 2. 为什么不能等 2.0 全完成后再做 UI

### 2.1 原生态界面会反过来拖慢 2.0
当前约球成局、修改时间、参与确认等主流程已经比较成型，说明核心产品骨架已经不是纯探索阶段。

接下来 2.0 计划包括：

- 俱乐部范围找人
- 俱乐部 invite circle
- showcase 基础能力

这些都高度依赖 UI 结构。如果继续在原生态界面上硬加功能，会不断遇到：

- 入口挂在哪
- 页面层级不清
- 一个页面承载过多状态
- 新功能一加，旧页面变乱
- 信息密度越来越失控

所以，不整理 UI，功能开发本身会越来越贵。

### 2.2 你现在最需要的是产品结构感
playerhoods.com 正在从“约成一场球的工具”往“带社交层、俱乐部层、展示层的平台”发展。

当你引入：

- club
- invite circle
- showcase

用户会自然开始问：

- match、group、club、profile、showcase 是什么关系
- 我从哪里进入这些对象
- 哪些是私域关系，哪些是俱乐部公共层
- 平台的主导航应该怎么理解

这些问题本质上是 UI 信息架构问题，不只是后端建模问题。

### 2.3 太晚再改 UI，返工更大
如果你等 2.0 全实现后才统一改 UI，很可能会发现：

- 页面边界不合理
- 某些状态不该放当前页面
- 某些对象模型虽然对，但呈现方式不对
- 某些流程应该拆步，而不是塞进一个页面

那时返工不只是改样式，而是要重构产品呈现层，代价更高。

---

## 3. 为什么现在也不应该全面精细打磨 UI

### 3.1 2.0 的产品边界还没有完全冻结
你接下来要做的 2.0 功能里，仍有若干关键边界处于定义中，例如：

- club 层的边界
- invite circle 的定位
- showcase 到底承载什么
- club 与 group / match 的关系
- 哪些动作属于私域关系，哪些属于俱乐部公共层

这些问题若未冻结，现在就大规模做：

- 像素级对齐
- 高保真设计封版
- 动效精修
- 完整 design system 美术统一
- 逐页面深度 polish

很容易导致今天刚打磨完，明天结构又改。

### 3.2 现在最重要的是“稳”和“清晰”，不是“最终美感”
当前阶段 UI 的首要任务是帮助你：

- 稳住产品结构
- 支撑 2.0 新功能落地
- 降低认知负担
- 明确入口与对象关系
- 统一状态表达

而不是立刻追求：

- 极致品牌感
- 视觉细节
- 完整动效系统
- 最终营销级展示效果

---

## 4. 当前最优策略：三层推进法

### 4.1 第一层：现在立刻做
做结构级 UI 整理，不做重视觉 polish。

重点不是“好看”，而是“稳”。

#### 4.1.1 信息架构统一
先明确 playerhoods.com 当前与 2.0 的页面层级建议：

- Home / Dashboard
- Match
- Group / Circle
- Venue
- Profile / Showcase
- Notifications / Inbox

目标是先把对象之间的入口关系理清，而不是先做视觉细节。

#### 4.1.2 核心页面骨架统一
先统一这些页面模式：

- 列表页
- 详情页
- 编辑页
- 选择器 / picker
- invite / nominate flow
- urgent action flow

这样后续 2.0 新能力就能复用，而不是每次重新拼页面。

#### 4.1.3 基础组件和状态表达统一
优先统一这些高复用块：

- primary / secondary CTA
- status chip
- participant row
- club card
- group / circle card
- empty state
- pending / confirmed / urgent / cancelled 的视觉语义
- toast / banner / inline warning

#### 4.1.4 粗颗粒视觉统一
先统一：

- spacing system
- page header pattern
- card pattern
- tab / section pattern
- modal / drawer pattern
- 表单字段间距与层级

这些属于“结构型 UI”，现在做收益高、返工相对小。

### 4.2 第二层：和 2.0 同步推进
在做 club / invite circle / showcase 时，边做边补 UI 框架。

#### 4.2.1 club 范围找人
需要先回答：

- 它是独立 discovery 页？
- 是 club 详情页的一个 tab？
- 是 match 发起流程里的扩展招募模式？

这本身就是 UI 架构设计，不该等功能做完才想。

#### 4.2.2 invite circle
需要明确：

- 它更像 group 的轻量层，还是一个新的社交对象？
- 它和 existing contacts / roster / group 怎么连接？
- 它在 club 之内还是跨 club 都可用？

这些决定将直接影响 UI 导航和页面形态。

#### 4.2.3 showcase
showcase 很容易越做越散，所以必须先做信息分层，例如：

- 基本资料
- sports identity
- availability / style
- club affiliation
- match history / social proof

### 4.3 第三层：等 2.0 主体稳定后再做
等 2.0 的主要对象和页面边界稳定后，再进入真正的 polish：

- 视觉语言统一
- 动效
- 空状态插画
- 品牌强化
- onboarding 细节
- 微文案优化
- 高保真 UI 打磨

---

## 5. 明确建议：现在就启动 UI，但只启动三类工作

### 5.1 A. 结构级 UI
先做页面框架、导航、信息层级、对象入口关系。

### 5.2 B. 流程级 UI
重点整理这些已接近稳定的核心流程：

- match 成局主流程
- 修改时间
- nominate / confirm
- reconfirm
- substitute / 临时补位

### 5.3 C. 可复用组件级 UI
把未来 club / invite circle / showcase 能复用的基础块先做出来。

---

## 6. 当前暂时不要重投入的三类 UI 工作

### 6.1 A. 高精细视觉 polish
先不要把页面做到“设计稿封版”程度。

### 6.2 B. 大面积样式微调
不要现在大量时间花在：

- 圆角细节
- 阴影细节
- 微小对齐
- 色值微调
- 动效曲线

### 6.3 C. 最终品牌视觉封版
因为 2.0 还会影响页面边界和信息结构。

---

## 7. 推荐的双轨节奏

### 7.1 轨道 1：产品能力推进
继续做 2.0 的核心能力：

- club 范围找人
- invite circle
- showcase 基础能力
- notification MVP

### 7.2 轨道 2：UI 架构整理
同步做：

- 页面树梳理
- 核心页面 wireframe
- 组件语义统一
- 状态展示统一
- navigation / CTA 规范

### 7.3 双轨并行的收益
这样做的好处是：

- 不耽误 2.0 功能
- 不会让 UI 过早返工
- 不会让产品继续在原生态界面里失控生长
- 后续 polish 会更有依据

---

## 8. 页面优先级建议

### P0：立刻整理的页面
这些页面直接关系现有主流程，应先进入结构级 UI 整理。

1. Match 详情页
2. Match 编辑页
3. Participant / Nomination / Reconfirm 相关 flow
4. 临时补位 / 缺人 flow
5. Header / nav / global actions

### P1：2.0 推进时同步设计的页面
这些与 2.0 直接相关，应边定义边做 wireframe。

1. Venue 主页 / 详情页
2. Venue 范围找人页
3. Invite circle 列表与详情
4. Showcase 基础页
5. Notifications / Inbox

### P2：后续再 polish 的页面
这些可以等结构更稳定后再深度打磨。

1. Profile polish
2. onboarding 视觉优化
3. 空状态美化
4. 品牌型 landing / marketing 页
5. 动效系统

---

## 9. 推荐的页面层级草图

当前建议先往这个方向收拢：

### 9.1 一级导航建议
- Home
- Matches
- Venues
- Circles
- Inbox
- Profile

### 9.2 对象层关系建议
- Match：事件与参与编排中心
- Venue：更大范围的组织 / 发现层
- Circle：私域信任层 / 轻社交组织层
- Showcase：个人展示层
- Inbox：通知与动作回流层

### 9.3 一个核心原则
不要让单个页面同时承担：

- object management
- discovery
- urgent coordination
- profile presentation

这些需要分层，否则页面迟早过载。

---

## 10. 当前最值得先做的 UI 交付物

### 10.1 页面树（Site Map / Screen Map）
建议先把 playerhoods.com 的页面树整理出来，明确：

- 页面入口
- 页面层级
- 对象关系
- 核心 CTA

### 10.2 核心流程 wireframe
优先做这些 wireframe：

- create / edit match
- nominate / confirm / reconfirm
- substitute urgent
- club discovery / find players
- invite circle entry
- showcase basic profile

### 10.3 组件语义表
建议单独整理一份组件语义表，定义：

- Button hierarchy
- status chips
- cards
- list rows
- tabs
- drawers / modals
- alerts / banners

### 10.4 状态表达规范
尤其要统一：

- pending
- confirmed
- declined
- urgent
- needs action
- cancelled
- full / open spot

这些对 playerhoods.com 的可理解性非常关键。

---

## 11. 推荐实施顺序

### Step 1
先画页面树与对象关系图。

### Step 2
整理 P0 页面 wireframe。

### Step 3
把现有核心流程统一到一套组件语义上。

### Step 4
做 club / invite circle / showcase 的结构草图。

### Step 5
边做 2.0 功能边补 UI 框架。

### Step 6
2.0 核心模型稳定后，再进入高保真 polish。

---

## 12. 对当前阶段的最终判断

你现在不是“还完全不确定产品是什么”的阶段了，也不是“功能都彻底冻结”的阶段。

所以最合适的位置是：

> 用结构级 UI 来稳定产品骨架，用并行方式支持 2.0 功能扩展，暂缓最终视觉定稿。

换句话说：

- 现在就该做 UI
- 但做的是架构化 UI
- 不是最终精修 UI

---

## 13. 最终一句话结论

**不是等 2.0 完了再做 UI，也不是现在就全面精修 UI。**

而是：

> 现在立刻启动“UI 架构化 + 流程化 + 组件化”，等 2.0 主体稳定后再做高精度打磨。

这对 playerhoods.com 当前阶段最稳，也最省返工。
