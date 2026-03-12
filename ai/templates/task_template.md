# Task For Cursor

## Objective
本轮只完成以下目标：
- [goal 1]
- [goal 2]

## Background
当前背景：
- [brief context]
- [why this round exists]

## Authority
必须遵守以下权威文件与规则：
1. ai/state/project_state.md
2. [spec file]
3. [governance file]
4. [other authoritative source]

如有冲突，按以上顺序处理，并在报告中明确指出。

## Scope In
本轮允许改动：
- [file/path 1]
- [file/path 2]
- [migration/rpc/ui/etc.]

## Scope Out
本轮禁止改动：
- [file/path 1]
- [historical migrations]
- [domain not in scope]

## Required Work
1. [task 1]
2. [task 2]
3. [task 3]

## Constraints
- 不允许改写历史 migration
- 不允许改变既定 canonical semantics
- 不允许未经批准扩展 scope
- 如发现 spec 冲突，停止扩展实现，只记录问题
- 如需新增 helper / function，必须保持命名与分层清晰

## Deliverables
必须完成并写入：
1. 代码/文件修改
2. `ai/outbox/cursor_report.md`
3. 如适用，更新 `ai/outbox/technical_snapshot.md`

## Validation Required
至少完成以下验证：
- [validation 1]
- [validation 2]
- [validation 3]

## Output Format
执行完成后，必须按 `ai/templates/cursor_report_template.md` 的格式写报告。
不要只在聊天里解释，必须落文件。

## Escalate Instead Of Guessing
若遇到以下情况，不要擅自拍板，写入报告：
- authoritative docs 冲突
- 需要改变 frozen rule
- 需要扩大 scope
- 验证结果与预期不一致
