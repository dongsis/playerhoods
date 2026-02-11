# playerhoods.com — AI Collaboration Guide (Authoritative)

## [v1.3] Admission & Removal Semantics Update
This document is governed by **Match Admission Semantics v1.3**:
- **Request** is group-based (scope groups only), not individual-based.
- **Invite / Nominate** target individuals and are not restricted by scope.
- **Removed** is inactive but reversible; re-entry occurs by **reactivating the same participant record**.
- If removed by **ORG**, re-entry requires **ORG reactivation** before user can accept.
- Removed users within scope may see a rejoin / waiting entry.
See: `docs/governance/Execution_State_Addendum_v1.3.md`


## Purpose
This project is developed with long-term AI-assisted collaboration.
AI must not rely on memory, assumptions, or prior conversations.

All implementations MUST strictly comply with the frozen documents in this repository.

---

## Mandatory Rule (Read First)

> Any implementation MUST strictly comply with **playerhoods.com v1.2 Frozen Docs**,
> especially **Match Invitation & Registration Spec v1.2**.

If any instruction or suggestion conflicts with the frozen documents,
**the documents always win**.

---

## How to Start an AI-Assisted Session

Always begin a new AI conversation with the following:

```
All code, migrations, and logic must strictly comply with
playerhoods.com v1.2 Frozen Docs,
especially:

- Match Invitation & Registration Spec v1.2
- Status & Semantics v1.2

```
Context: See docs/db/db_state.md for current database state including schema, RLS policies, and enums.

Then provide the relevant markdown file(s) or the full `/docs` folder.

---

## Authoritative Documents

- constitution/Group Constitution.md
- models/Relationship Model.md
- models/Communication Model.md
- specs/GroupContract_v1.3.md
- specs/MatchContract_v1.3.md
- specs/Match Invitation & Registration Spec v1.3.md ⭐
- blueprint/System Blueprint v1.2.md
- blueprint/Status & Semantics v1.2.md
- governance/Execution State & Technical Appendix_v1.2.md
- PROMPT_TEMPLATE.md

---

## Explicit v1.2 Freezes (Do NOT Violate)

- No Invite Group / bulk invitation
- No new match.status values (e.g. formed)
- Participant ≠ organizer (capabilities via flags only)
- Register visibility ≠ match visibility
- 

If uncertain, ASK before implementing.


## Migration 上线流程（含文件生成）
0) 生成新的 migration 文件（必须用 CLI）
✅ 标准方式（唯一推荐）
supabase migration new <slug>
CLI 会自动生成：规则：文件名 = timestamp_slug.sql

1) 编写 migration（本地）
只允许：tables / enums / views / functions / triggers / RLS
必须满足：幂等（create or replace / drop if exists）

2) 本地提交前自检
git status：确认：只新增了一个 migration 文件；没有误改旧 migration；没有把 .env / 凭证提交进 git

3) 推送到远端数据库（apply）
supabase db push

预期结果：
Applied migration <timestamp>
或 Database is up to date

4) 验证（分两类）
A) 结构 / view / trigger
可用 SQL Editor，不涉及 auth.uid()
B) RLS / RPC / 权限
必须用真实 authenticated context
Node 脚本
前端：curl + access_token
禁止在 SQL Editor 里伪造身份

5) 写入 Execution State（冻结记录）
记录：migration 文件名
对应 slice
是否已验证
已知限制（如 SQL Editor 不适合验证 RPC）

常见异常 & 处理（含文件生成相关）
A) migration 文件名不规范
现象：手写 003_xxx.sql，timestamp 不一致
处理：重新用 supabase migration new
不要“修补”旧 migration 名字

B) 在 SQL Editor 手动跑过，但 migration 再 push 报错
现象：migration history does not match local files
原因：数据库已变，但 migration 历史未记录
处理（唯一正确方式）：
supabase migration repair --status applied <timestamp>
supabase db push

C) 想“再 push 一次”是否安全？
结论：只要 migration 是幂等的：create or replace，drop if exists，重复 push 是安全的

D) 不要做的事（再次强调）
❌ 手写 migration 文件名
❌ 用 SQL Editor 验证 authenticated RPC
❌ 为了让 SQL Editor 能跑而改 RLS / RPC
❌ 跳过 migration 只在 Editor 里改结构