
# v1.3 Match Detail — UI-only 状态机对照表（冻结级）

## v1.3 FINAL / FROZEN — Unified Restart Doctrine

**Frozen On:** 2026-02-11 UTC

### Core rule
Restarting participation always uses exactly two channels (regardless of history):

- **User → Request to Join** (`rpc_match_request_join`)
- **Organizer → Invite** (`rpc_match_invite_user`)

No branching on:
- `removed_by`
- prior `join_method`
- prior confirmation state or order

### Scope rule (first-entry only)
- If **mp == NULL** (no prior record): scope is required for **Request to Join**
- If **mp exists** and `status = 'removed'`: scope is **NOT** required for **Request to Join**

### Removed（mp.status == 'removed'）

**v1.3 FINAL / FROZEN：统一重启规则（无 removed_by 分支）**

- **用户侧**：始终显示 **Request to Join** → `rpc_match_request_join(match_id)`
  - **Scope 仅用于第一次进入**：当 `mp == null` 才需要 `inScope = true`
  - 若已存在 removed 记录（`mp.status='removed'`），即使用户已不在 scope，也允许在 App 内发起 rejoin request

- **ORG 侧**：始终显示 **Invite** → `rpc_match_invite_user(match_id, user_id)`（invite 不受 scope 限制）

`rpc_match_reactivate_participant`：**deprecated**（DB 可保留，但 UI 不暴露、不作为主语义）。

