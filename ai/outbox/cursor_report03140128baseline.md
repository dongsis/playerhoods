# Baseline Closure Report - Post Merge

## 1. Overview

本轮已完成 baseline 收口，当前以合并后状态作为唯一 authoritative 依据。

- Baseline effective point: `03522d7`
- Branch: `v2.0`（与 `main` 同 HEAD）
- Remote: `origin/v2.0` 已包含 `03522d7`
- 定位：guest invitation 改造已从功能交付阶段进入治理基线阶段

## 2. Merge / Baseline Status

**Merged; baseline established at commit `03522d7`.**

当前不再使用 “Ready with caveats” 作为主结论。  
该结论仅属于 merge 前评估快照，已移至附录归档。

已核实主链状态：

1. guest accept 不新增 user participant row（主 CTA 已走 guest RPC）
2. guest decline 仅作用当前 guest participant（withdraw 语义）
3. invitation anchor 已落地：`email_invitations.match_participant_id`
4. invitation 页面不再走旧 user accept 主链
5. 注册 CTA 不回写当前 match participant
6. system actor 方案可审计（decline 依赖 `GUEST_INVITATION_SYSTEM_ACTOR_ID`）
7. 0 命中 / ambiguous 场景为显式 fail-fast

## 3. Function Status Consolidation

### ACTIVE

- `rpc_email_invitation_create`
- `rpc_email_invitation_get`
- `rpc_email_invitation_accept_as_guest`
- `rpc_email_invitation_decline_as_guest`
- `apply_participant_exit`
- `match_participant_reconcile_status`

### LEGACY

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`

### RETIRED

- `rpc_email_invitation_update_flow_status`（已进入 drop migration 轨道）

### DROP CANDIDATE

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

说明：A2/A3 仅标记，暂不删除，待依赖与运行证据补齐。

## 4. Batch A Result

### A1 (executed in migration track)

- Function: `rpc_email_invitation_update_flow_status`
- Migration: `supabase/migrations/20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
- Validation: `supabase/validation/20260328000000_drop_batch_a_low_risk_legacy_rpcs_validation.sql`
- Status: 已纳入低风险 Batch A

### A2/A3 (hold)

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

状态：仅标记，不删除。

## 5. Baseline Files

已落地基线文件：

1. `docs/baseline/DB_BASELINE_2026-03-14.md`
2. `docs/baseline/schema_baseline.sql`
3. `docs/baseline/DB_SEMANTICS_BASELINE.md`
4. `docs/baseline/LEGACY_AND_RETIRED_ITEMS.md`

schema 导出方法（已执行）：

- `supabase db dump --schema public --file docs/baseline/schema_baseline.sql`

## 6. Next Actions

1. 归档 staging checklist 实跑结果（含 SQL 输出摘要）
2. 执行 Batch B 的 `pg_depend` 依赖扫描并形成可删决议
3. 在 `docs/01_authority/00_AUTHORITATIVE_INDEX.md` 挂 baseline 引用并声明生效范围

---

## Appendix - Pre-Merge Assessment (Archived)

以下内容为 merge 前评估快照，仅作历史留档，不再作为当前决策依据。

### Archived Snapshot

- Branch: `v1.5-venues-ui`
- Commit: `19a91d5`
- Divergence vs `origin/main`: `behind 1 / ahead 46`
- Decision at that time: `Ready with caveats`
- Context at that time: 尚未统一收口到 `main`
# 1. Overview

本轮已完成 baseline 相关收口任务，目标是把 guest invitation 改造从“功能完成态”推进到“可治理基线态”。

本次输出覆盖：

- merge readiness 结论（并给出当前实际 merge 状态）
- ACTIVE / LEGACY / RETIRED / DROP CANDIDATE 分类
- Batch A 删除候选落地状态
- baseline 文件落地与生成方法
- 后续执行顺序、风险与下一轮建议

当前基准点：

- Branch: `v2.0`（与 `main` 同一 HEAD）
- Commit: `87dca86`
- 远端状态：`origin/main` 已包含 `87dca86`

# 2. Merge Readiness Assessment

## 结论

**Ready to merge（已完成并已合并）**

说明：此前阶段为 “Ready with caveats”；当前关键改造已完成合并并推送，状态已转为可直接作为 baseline 起点。

## 已核实通过项

1. guest accept 不再新增 user participant row（已切到 guest RPC 主链）。  
2. guest decline 仅作用当前 guest participant（decline 走 guest RPC，语义为 withdraw）。  
3. invitation anchor 已落地：`email_invitations.match_participant_id`。  
4. invitation 页面主 CTA 已切到新 guest 路径，不再走旧 user accept 链。  
5. 注册 CTA 为独立注册路径，不回写当前 match participant。  
6. system actor 方案可审计（decline 需 `GUEST_INVITATION_SYSTEM_ACTOR_ID`）。  
7. 0 命中 / ambiguous 已采用显式失败策略（fail-fast）。

## 非阻塞但仍建议继续做

1. staging runtime checklist 需要形成“已执行勾选+结果证据”版。  
2. Batch B（中风险候选）仍需 `pg_depend` + staging 观测后再删。  
3. baseline 与权威索引的联动声明可在下一轮补齐。

# 3. Function Status Consolidation

以下为本轮 baseline 版状态矩阵（摘要）：

## ACTIVE

- `rpc_email_invitation_create`
- `rpc_email_invitation_get`
- `rpc_email_invitation_accept_as_guest`
- `rpc_email_invitation_decline_as_guest`
- `apply_participant_exit`
- `match_participant_reconcile_status`

判定依据（静态证据）：

- invitation 页面 action/wrapper 已直接调用 guest RPC。
- guest accept/decline 的 DB 函数定义位于 `20260327000000_*` migration 且权限 hardening 已补充。

运行时置信度：**中高**（主链已切换，仍建议用 staging checklist 固化证据）。

## LEGACY（compat-only）

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`

判定依据：

- 已退出 guest 主 CTA 路径；
- 仍保留以兼容旧 user flow / 历史调用面。

运行时置信度：**中**（静态无主链入口，不排除少量历史路径）。

## RETIRED

- `rpc_email_invitation_update_flow_status`（已在 Batch A drop migration 中处理）
- 早期 manual-confirm 退役函数（以已应用迁移为准，不再作为当前主链设计入口）

运行时置信度：**中**（需环境 migration 应用状态一致）。

## DROP CANDIDATE

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

判定依据：

- 当前 guest 主链不依赖；
- 仍可能存在隐式数据库依赖或未来 UI 兼容需求。

运行时置信度：**中低**（本轮仅标记，不删除）。

# 4. Drop Candidate Batch A

## Batch A（低风险）结果

### A1

- Function: `rpc_email_invitation_update_flow_status`
- Why candidate: 主链迁移后无必要保留
- Src references: 未发现当前主链调用
- DB dependencies: 未发现关键显式依赖（仍建议环境侧 `pg_depend` 复核）
- Risk level: Low
- Rollback note: 可通过补回函数定义 migration 回滚
- Migration: `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
- 结论：**已纳入并可执行**

### A2/A3（仅标记，不删除）

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

结论：**本轮只标记，不删除**（等待依赖与运行时证据补全）。

# 5. Database Baseline Plan

baseline 的定位：

- 是“当前稳定面”的治理起点；
- 不是重写历史 migration；
- 通过“结构快照 + 语义快照 + 状态矩阵”建立后续协作边界。

本轮已经落地 baseline 文件组，覆盖：

1. Overview（范围与边界）  
2. Schema snapshot（SQL）  
3. 关键语义不变量  
4. Legacy/Retired 清理策略与状态

# 6. Proposed Baseline Files

本轮已落地：

1. `docs/baseline/DB_BASELINE_2026-03-14.md`
2. `docs/baseline/schema_baseline.sql`
3. `docs/baseline/DB_SEMANTICS_BASELINE.md`
4. `docs/baseline/LEGACY_AND_RETIRED_ITEMS.md`

# 7. Baseline Generation Method

## 7.1 schema_baseline.sql 导出方法

本轮实际执行命令：

`supabase db dump --schema public --file docs/baseline/schema_baseline.sql`

导出来源：当前已连接的 remote database（CLI 输出为 “Dumping schemas from remote database”）。

## 7.2 内容来源映射

- Repo 事实：`src/app/invitations/[id]/page.tsx`、guest server actions、invitation wrappers
- 迁移事实：`20260327000000_*`、`20260328000000_*`、`20260328010000_*`
- 审计判断：`ai/outbox/Legacy_Retired_Function_Audit_Plan.md` 与 Batch A 文档

## 7.3 baseline 作为新起点的使用方式

1. 新增 migration/RPC 必须保持与 baseline semantics 一致。  
2. 任何函数删除必须先通过引用+依赖+运行时 Gate。  
3. 每次关键语义变更同步更新 baseline 文档（不是只改代码）。  

# 8. Recommended Execution Sequence

建议后续按以下顺序执行：

1. 以 `87dca86` 作为 baseline 生效点。  
2. 在 staging 执行并归档 `Staging_Merge_Gate_Runtime_Checklist` 的勾选结果。  
3. 对 Batch B 候选跑 `pg_depend` + 最小回归验证。  
4. 仅对低风险通过项继续下一个 drop migration。  
5. 将 baseline 引用补挂到权威索引，声明适用范围与更新时间。  
6. 后续所有新增功能以 baseline 为约束进行增量演进。  

# 9. Risks / Blockers

当前无 merge 阻塞项，但仍有治理风险：

1. 远端不同环境 migration 应用进度可能不一致。  
2. 静态“无引用”不等于“无 DB 隐式依赖”。  
3. system actor 配置若在某环境缺失，会导致 decline fail-fast。  
4. baseline 已建立，但若不维护会很快失真。  

需确认项（不拍板假设）：

1. 各 staging/prod 环境是否已应用同一 migration 集。  
2. Batch B 候选在目标环境 `pg_depend` 扫描结果是否一致。  

# 10. Next Suggested Task

下一轮建议直接执行：

1. 生成并提交一份 **staging merge-gate checklist 实跑结果**（含 SQL 输出摘要）。  
2. 执行 Batch B 依赖扫描并产出“可删/暂缓”决议。  
3. 更新 `docs/01_authority/00_AUTHORITATIVE_INDEX.md`，声明 baseline 生效日期与治理范围。  
# 1. Overview

本轮聚焦收口与基线化，不继续扩功能。目标是给出：

- merge main 前的明确 readiness 结论
- active/legacy/retired/drop-candidate 的函数状态收敛
- Batch A 删除候选的可执行建议
- 新 database baseline 建立方案（不重写历史 migration）

当前事实基础（本地仓）：

- 分支：`v1.5-venues-ui`
- 当前提交：`19a91d5`
- 与 `origin/main` 分叉：`behind 1 / ahead 46`
- guest invitation 改造关键文件与 migration 已存在于工作区，尚未统一收口到 main

# 2. Merge Readiness Assessment

## 结论

**Ready with caveats**（可合并，但带明确前置说明与后续验证项）。

## 已完成（支持 merge）

1. guest accept 新链已建立，且不再走旧 user accept 主链。  
2. guest decline 新链已建立，语义按 withdraw 落地。  
3. invitation anchor（`email_invitations.match_participant_id`）已落地。  
4. invitation 页面主 CTA 已切到 guest server path。  
5. 注册 CTA 为独立路径，不在当前 match participant 写链上。  
6. system actor 路径已实现，且权限收敛后不再对 `PUBLIC` 暴露。  
7. 0 命中 / ambiguous 的 fail-fast 策略已显式实现。

## 未完成但不阻塞 merge

1. 运行时 staging E2E 证据尚未沉淀到统一 checklist 结果表。  
2. legacy 函数批量清理仍在批次推进中（已完成 Batch A 第一项）。  
3. baseline 文档集尚未生成到 `docs/baseline/*`（当前为方案与清单）。

## 若存在将阻塞 merge 的问题

1. 远端 DB 未应用关键 migration（anchor / guest RPC / 权限 hardening）。  
2. `GUEST_INVITATION_SYSTEM_ACTOR_ID` 未配置且 decline 生产路径需启用。  
3. main 分支最新变更与当前 guest 改造存在冲突且未re-test。  
4. 关键 fail-fast 场景（0-hit / ambiguous）在真实数据中触发率高且无运营处理策略。

# 3. Function Status Consolidation

以下为 baseline 可用的函数状态收敛（精简版，详细证据见审计文档）：

## ACTIVE

- Invitation 主链：
  - `rpc_email_invitation_create`
  - `rpc_email_invitation_get`
  - `rpc_email_invitation_accept_as_guest`
  - `rpc_email_invitation_decline_as_guest`
- Match 主链：`rpc_match_request_join`, `rpc_match_admit_user`, `rpc_match_accept_invite`, `rpc_match_user_withdraw`, `rpc_match_remove_participant` 等
- Infra：`rpc_get_queued_deliveries`, `rpc_update_delivery_result`

## LEGACY（compat-only）

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`

原因：已退出 guest 主链，但短期兼容保留，避免未观测就硬切。

## RETIRED

- 已有专门退役迁移轨道的 manual_confirm 系列（以环境落地状态为准）：
  - `rpc_match_manual_confirm`
  - `rpc_match_manual_confirm_user`

## DROP CANDIDATE

- `rpc_email_invitation_update_flow_status`（低风险，Batch A 已执行删除迁移）
- `rpc_reconcile_identity_after_magic_link`（中风险，依赖旧链，暂缓）
- `rpc_roster_guest_contact_links`（中风险，潜在 UI 未来依赖，暂缓）

# 4. Drop Candidate Batch A

## 本轮建议与状态

### Candidate A1

- Function: `rpc_email_invitation_update_flow_status`
- Why candidate: `src` 无直接调用、无当前主链依赖
- Src references: 0（静态）
- DB dependencies: 未发现主链显式依赖；仍建议在目标库跑 `pg_depend` 复核
- Risk level: Low
- Rollback note: 可通过 restore migration 恢复函数定义
- Planned migration: `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
- Status: **已创建并纳入本批**

### Candidate A2/A3（仅标记，不删除）

- `rpc_reconcile_identity_after_magic_link`
- `rpc_roster_guest_contact_links`

原因：运行时/隐式依赖置信度不足，本轮不删。

# 5. Database Baseline Plan

baseline 定位为“新治理起点”，不是重写历史。

包含三层：

1. **Schema baseline**：当前结构快照（SQL）
2. **Semantics baseline**：关键业务不变量与边界
3. **Governance baseline**：active/legacy/retired/drop 策略与清理节奏

原则：

- 保留历史 migration 链
- 用“当前快照 + 当前规则 + 当前状态分类”描述新起点
- 后续新增改动继续通过新 migration 叠加

# 6. Proposed Baseline Files

建议建立：

1. `docs/baseline/DB_BASELINE_2026-03-14.md`
2. `docs/baseline/schema_baseline.sql`
3. `docs/baseline/DB_SEMANTICS_BASELINE.md`
4. `docs/baseline/LEGACY_AND_RETIRED_ITEMS.md`
5. （可选）`docs/baseline/BASELINE_GENERATION_METHOD.md`

建议内容映射：

- `DB_BASELINE_*`：时间、分支、commit、范围、权威文档入口
- `schema_baseline.sql`：数据库结构快照
- `DB_SEMANTICS_BASELINE.md`：统一确认语义、guest 响应语义、anchor 语义、decline=withdraw、注册不回写当前 match
- `LEGACY_AND_RETIRED_ITEMS.md`：函数状态矩阵与批次清理策略

# 7. Baseline Generation Method

## 7.1 schema_baseline.sql 导出方法

优先使用与环境一致的 supabase dump：

- 结构快照：
  - `supabase db dump --schema public --file docs/baseline/schema_baseline.sql`

若需要与远端一致，先指向目标 project/DB，再 dump。

## 7.2 baseline 文档信息来源

- Repo 事实：`src` 调用链、当前 migration 文件、当前页面接线
- 迁移状态：`supabase/migrations/*` + 目标环境已应用情况
- 审计判断：`ai/outbox/Legacy_Retired_Function_Audit_Plan.md` 与 Batch A 文档

## 7.3 baseline 作为“新起点”的使用方式

- 新增改动必须以 baseline 语义为边界检查
- 任何函数退役必须先过 Gate（引用/依赖/观测/回归）
- 新 migration 与语义更新同步更新 baseline 文档

# 8. Recommended Execution Sequence

1. **先完成 merge readiness 收口**（当前结论：Ready with caveats）。
2. **先将当前功能分支与 `origin/main` 对齐并解决冲突**（当前 behind 1）。
3. **在 staging 应用关键 migration 并跑 validation**：
   - anchor + guest RPC
   - permission hardening
   - Batch A drop
4. **确认运行证据后 merge main**。
5. **在 merge 后立即导出 baseline 文件集**（确保基线对应稳定面）。
6. **按 Batch 策略推进 legacy cleanup**（每批次少量删除 + 可回滚）。
7. **后续所有新增 migration/RPC/docs 以 baseline 为约束起点**。

# 9. Risks / Blockers

## 当前主要风险

1. 远端 migration 实际落地状态未在本轮完全核验（可能与本地不一致）。
2. 某些函数静态无 `src` 引用，但可能存在 DB 隐式依赖（需 `pg_depend` 复核）。
3. baseline 导出在“本地 DB vs 远端 DB”之间存在来源选择风险。
4. 权威文档可能存在冲突（旧 specs 与新 baseline 并存阶段）。

## 需确认项（Escalation）

1. merge 目标 main 的最终基准点（是否先 rebase 到最新 origin/main）。
2. 远端是否已应用以下 migration：
   - `20260327000000_guest_invitation_anchor_and_guest_response_paths.sql`
   - `20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`
   - `20260328010000_guest_invitation_rpc_permissions_hardening.sql`
3. `schema_baseline.sql` 采用本地导出还是远端导出作为 authoritative。
4. baseline 文档的权威入口是否统一挂到 `docs/01_authority/00_AUTHORITATIVE_INDEX.md`。

# 10. Next Suggested Task

建议下一轮任务（可直接执行）：

1. 在 staging 跑完整 merge gate runtime checklist 并产出结果文档。  
2. 完成 `docs/baseline/*` 四个基线文件的首版落地。  
3. 执行 `pg_depend` 级依赖扫描，确认 Batch B 候选是否可转入删除。  
4. main 合并后更新 authoritative index，声明 baseline 生效日期与适用范围。
