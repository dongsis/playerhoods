# Task For Cursor

## Objective
本轮完成以下两大目标：

1. 完成合并 `main` 前后的收口工作，并给出 merge readiness 结论
2. 在合并完成后，建立一套新的 **database baseline / 新起点**

本轮重点不是继续扩展功能，而是：
- 收口当前 guest invitation 改造
- 整理 active / legacy / retired 状态
- 固化当前数据库结构与语义
- 形成新的 authoritative baseline

## Background
当前系统已经完成 guest / Contact Player 当前 match 响应主链改造的关键基础：

- `email_invitations.match_participant_id` 锚点已落地
- guest accept / decline 已从旧 user accept 主链分流
- decline actor 已有 system actor 方案
- 当前重点从“新增功能”转向：
  - 函数清理
  - merge main
  - baseline 固化

同时，系统中可能仍存在：
- 已退出主链但暂未删除的 legacy RPC / functions
- 已有 drop migration 但需确认环境落地状态的旧函数
- 需要从当前 main-ready 状态导出的一套数据库 baseline 文档与快照

## Authority
必须遵守以下规则：

### 1. baseline 的定义
baseline 是新的“认知与治理起点”，用于表达：
- 当前数据库结构
- 当前关键业务语义
- 当前 active / legacy / retired 体系
- 当前 authoritative 规则

### 2. baseline 不等于重写历史 migration
- 不重写历史 migration
- 不强行 squash 全部历史
- 以当前状态导出 schema snapshot / semantics snapshot / governance snapshot

### 3. merge 前要先完成收口判断
- merge main 前必须先说明当前是否已达到 merge readiness
- 若存在阻塞项，必须列清楚
- 不得含糊给出“差不多可 merge”

### 4. legacy / retired 清理原则
- 不凭感觉删除
- 先分类：ACTIVE / LEGACY / RETIRED / DROP CANDIDATE
- 删除前要经过引用与依赖验证
- 本轮若删除函数，只能删除低风险且验证充分者

## Scope In
本轮允许处理：

1. merge readiness 审核
2. active / legacy / retired function 状态整理
3. 第一批低风险 drop candidates 确认
4. main merge 前后需要保留的治理文档整理
5. 导出当前数据库 baseline
6. 输出 baseline 文档与文件清单
7. 给出后续从 baseline 出发的工作建议

## Scope Out
本轮禁止处理：

- 新增大功能
- 重写 guest invitation 主链
- 重写底层 helper / reconcile
- 重写历史 migration
- 全量 canonicalization
- 历史数据大规模修复
- 大范围 UI 新设计

## Required Work

### A. Merge Readiness Review
请先明确判断当前是否可 merge main，并输出结论：

1. 当前 guest invitation 主链改造，哪些部分已经完成
2. 哪些部分仍未完成，但不阻塞 merge
3. 哪些问题若存在，会阻塞 merge
4. 给出明确结论：
   - Ready to merge
   - Ready with caveats
   - Not ready

至少检查以下内容：

- guest accept 不再新增 user participant row
- guest decline 只作用于当前 guest participant
- invitation anchor 已落地
- 旧 guest 主 CTA 不再走旧 user accept 主链
- 注册 CTA 不回写当前 match participant
- system actor 方案可审计
- 0 命中 / ambiguous 场景有明确失败策略

### B. Legacy / Retired Function Consolidation
请基于当前仓库状态，整理函数状态清单，并形成可用于 baseline 的版本。

要求至少包含四类：

1. ACTIVE
   - 当前主链仍在使用
2. LEGACY
   - 已退出主链，但短期兼容保留
3. RETIRED
   - 已完成退役，不应再被调用
4. DROP CANDIDATE
   - 候选删除，待验证后下线

请对每个候选项至少说明：

- function name
- current status
- static evidence
- runtime confidence
- why this status
- whether safe to drop now

### C. Drop Candidate Batch A
请产出第一批可执行删除候选（Batch A）。

要求：

1. 只包含低风险项
2. 数量控制在 1–3 个或一小组强相关函数
3. 每项写明：
   - why candidate
   - src references
   - DB dependencies
   - risk level
   - rollback note
   - planned migration name
4. 若当前不适合立即 drop，请明确写“本轮只标记，不删除”

### D. Database Baseline Establishment
请建立新的 database baseline，至少产出以下内容建议与文件清单：

#### 1. Baseline Overview 文档
建议文件名：
- `docs/baseline/DB_BASELINE_<date>.md`

应说明：
- baseline 日期
- 对应 branch / commit
- baseline 建立原因
- 当前 authoritative docs
- baseline 覆盖范围
- baseline 不包含什么

#### 2. Schema Baseline 快照
建议文件名：
- `docs/baseline/schema_baseline.sql`

应对应当前数据库完整结构快照，至少说明导出方式与来源。

#### 3. DB Semantics Baseline
建议文件名：
- `docs/baseline/DB_SEMANTICS_BASELINE.md`

应记录当前关键语义，例如：
- unified confirmation invariant
- guest current-match response invariant
- invitation anchoring invariant
- decline = withdraw
- registration does not rewrite current match participant
- future user-first rule
- frozen helper / reconcile boundary

#### 4. Legacy / Retired Items Baseline
建议文件名：
- `docs/baseline/LEGACY_AND_RETIRED_ITEMS.md`

应记录：
- active / legacy / retired / drop-candidate 状态
- 当前已退出主链的关键函数
- 后续清理策略

### E. Baseline Generation Method
请明确说明 baseline 应如何生成，而不是只给文件名。

至少说明：

1. `schema_baseline.sql` 的导出命令或方法
2. baseline 文档中哪些内容来自：
   - repo 事实
   - 当前迁移状态
   - 当前审计判断
3. baseline 建立后，后续开发应如何使用它作为“新起点”

### F. Recommended Sequence
请给出建议执行顺序，至少包括：

1. 是否先 merge main 再导 baseline，还是先导 baseline 再 merge
2. 如何保证 baseline 对应的就是稳定面
3. legacy cleanup 与 baseline 的先后关系
4. 后续从 baseline 出发如何继续新增 migration / RPC / docs

## Constraints
- 不要把 baseline 做成“重写全部历史”的工程
- 不要把 baseline 等同于删光旧 migration
- 不要在未验证的情况下大批量 drop 函数
- baseline 文档必须服务于未来协作，不要只是罗列文件
- merge readiness 结论必须明确，不接受模糊措辞

## Deliverables
请输出到 `ai/outbox/cursor_report.md`：

1. Merge readiness 结论
2. Active / Legacy / Retired / Drop Candidate 分类结果
3. Batch A 删除候选建议
4. Database baseline 建立方案
5. Baseline 文件清单
6. Schema baseline 导出方法
7. Recommended sequence
8. Known risks / blockers
9. 建议下一轮任务

并更新 `ai/outbox/technical_snapshot.md`，补充：

- 当前 branch 与 merge 目标
- 当前 migration 状态
- 当前活跃 RPC / 关键 invitation 链
- 计划纳入 baseline 的文件 / docs
- 候选 drop items 摘要

## Output Format
请按以下结构输出 markdown：

1. Overview
2. Merge Readiness Assessment
3. Function Status Consolidation
4. Drop Candidate Batch A
5. Database Baseline Plan
6. Proposed Baseline Files
7. Baseline Generation Method
8. Recommended Execution Sequence
9. Risks / Blockers
10. Next Suggested Task

## Escalate Instead Of Guessing
若遇到以下情况，请不要自行拍板，必须在报告中明确指出：

- main 分支状态与当前功能分支差异不清
- 远端 migration 落地状态不清
- 某些函数静态无引用但数据库中仍有隐式依赖
- schema baseline 导出方式在当前项目中不唯一
- baseline 应覆盖哪些 docs 存在权威冲突

请把这些列为“需确认项”，不要自行假设。
