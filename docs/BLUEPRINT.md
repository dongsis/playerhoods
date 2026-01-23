# 约球 · 产品逻辑与规则蓝图
## System Blueprint（MVP v1 + v1.x + Future）

状态：
- MVP v1：规则冻结（Implementation Ready）
- v1.x：优先级冻结（规划已定，未实现）
- v2+：方向冻结（不做实现承诺）

---

## 0. 产品定位

目标  
把一场单次球局从  
发起 → 分发 → 协商 → 确认 → 通知  
说清楚、做得轻。

核心原则（不可破坏）
- 协商优先（Negotiation-first）
- 低自动化（System assists, does not decide）
- 单一责任人（Organizer owns outcome）
- 保留人味儿（Notes over rules）

---

## 1. 核心对象（Core Entities）

- Event（球局）  
  单次事件，系统的原子单位

- Organizer  
  球局的唯一组织者，最终责任人

- Participant  
  报名 / 参与球局的用户

- Invite Set（邀请集合，原 Circle）  
  Organizer 私有维护的“可邀请对象集合”，  
  仅用于外部分发控制，不构成社交结构

---

## 2. Event 状态模型（冻结）

Draft  
草稿，未发布

Tentative  
协商中（时间 / 条件未最终确定）

Time Confirmed  
时间已确定，进入人员二次确认阶段

Final  
时间与人员稳定

Cancel Match  
终止动作（保留记录）

规则
- Organizer 可随时 Revert to Tentative
- 系统不锁死状态，仅同步变化

---
关于「确认是否即意味着成局」

Organizer 在确认单个参与者时，并不代表球局已经成局。
只有当已确认人数达到成局所需的最小人数时，系统才认为该球局正式成局。
在此之前，所有确认行为均视为 Organizer 的内部筛选过程。

关于「确认参与者时的通知策略」

Organizer 在逐个确认参与者时，系统不向参与者发送任何确认通知。
仅在球局正式成局的时刻，系统才一次性向所有已确认参与者发送成局确认通知。
球局尚未成局前的进度（例如还缺几人）仅在页面中展示，不通过通知打扰参与者。

## 3. 时间模型（冻结）

Fixed Time  
发布即确定

Time Options（TBD）  
1–4 个候选时间

规则
- 1 个时间 = Window（无选择）
- ≥2 个时间 = Participant 选择可行项
- Participant 在选择或确认时间时可填写可选 Note
- 系统不自动决策
- Organizer 手动确认

---

## 4. 场地模型（冻结）

必备
- Facility / Club
- Court Count

Court Detail 状态（必选）
- Specific
- TBD
- Not Required

可以未定，但不能不说明

---

## 5. 报名与参与者状态（冻结）

报名 → Pending  
Organizer 确认 → Confirmed  
时间确认后 → AwaitingConfirmation  
退出 → Declined  
Organizer 移除 → Removed  

对外仅展示中性文案（如 Match full）

---

## 6. 分发机制（三分法，冻结）

A｜发布球局邀请（Organizer Publishing）
- Invite Set / Friends / Invite Link
- 目的：找人、开放报名

B｜球局通知（Match Notification）
- 系统触发
- 节点：Publish / Confirm time / Revert / Cancel
- 渠道：In-app + Email

C｜协助邀请（Assisted Invitation）
- 已受邀者转发同一球局
- 不改变 Organizer 权限
- 载体：Invite Link

Invite Link 是载体，不是分发类型

---

## 7. Invite Set（冻结定义）

本质  
Organizer 私有的邀请分组工具

规则
- 私有、单一 Owner
- 对被邀请者完全不可见
- 不具备参与、权限或社交语义
- 仅用于分发 A

---

## 8. 通知规则（冻结）

- 仅关键节点发送
- 渠道：In-app + Email
- 非关键变化不群发

---

## 9. Note（人味儿机制，冻结）

- Organizer：Confirm / Revert / Cancel 时可填
- Participant：时间选择 / 确认时可填
- 自由文本，不参与逻辑

---

## 10. 退出与 Sub（轻提示）

- 已确认者可退出
- 系统提示找 Sub（不强制）
- Organizer 兜底确认

---

## 11. 明确不做（v1）

- Recurring / Series
- 自动补位 / 抽签
- 社交 Feed / 推荐
- 复杂偏好与裁决系统

---

## 12. Future Roadmap（规划）

### v1.x（优先级最高）
- Recurring Series（周例局）
- Invite Set 治理增强
- 报名不足 → Organizer 调整 Court 数量
- Club Affinity（建议式）
- Location-based Court Discovery（基础）

### v2+
- 教练 / 群课模式
- 用户运动资产记录
- 装备管理与匿名经验
- 认可（Endorsement）
- 市场与推广支持（无广告）

---

> 所有未来功能必须遵循 v1 原则：
> 协商优先 / 低自动化 / 单一责任人 / 不做裁决系统