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
