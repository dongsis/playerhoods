# Project State

## Project
PlayerHoods

## Current Branch
v1.5-venues-ui

## Current Slice / Workstream
[fill here]

## Current Objective
[一句话说明当前阶段目标]

## Authoritative Documents
按优先级从高到低：
1. docs/01_authority/00_AUTHORITATIVE_INDEX.md
2. docs/01_authority/Migration Governance Requirements.md
3. docs/01_authority/Match_Participant_Lifecycle_Canonical.md
4. docs/01_authority/DELEGATE_MODEL_FINAL.md
5. docs/01_authority/PERMISSION_ARCHITECTURE_v1.md
6. docs/02_facts/FACTS_functions.md, FACTS_tables.md, SCHEMA_TRUTH_CHECK_2026-03.md

## Frozen Rules
- 不允许 rewrite 历史 migration
- 仅允许 append-only migration
- enum 语义在 v1 中不可静默变更
- 不允许绕开既定 authoritative contract
- 所有实现必须与当前 canonical lifecycle 一致

## Implementation Constraints
- 使用 Next.js 14, React 18, Supabase, TypeScript
- 数据库为 Supabase (local / remote 按环境)
- 当前测试方式为 Playwright test, scripts/test_v1_3_admission.mjs
- 当前 deploy / validation 方式为 supabase/validation/*.sql

## Known Decisions
- [decision 1]
- [decision 2]
- [decision 3]

## Known Drift / Risks
- [risk 1]
- [risk 2]

## Open Questions Requiring Human Approval
- [question 1]
- [question 2]

## Current Files / Areas In Scope
- [path 1]
- [path 2]

## Out of Scope
- [path or domain 1]
- [path or domain 2]

## Latest Approved Direction
[这里放最近一次你明确批准的方向摘要]
