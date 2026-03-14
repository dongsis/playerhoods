# Legacy / Retired Function Audit Plan

## Overview

本计划基于当前代码仓静态扫描形成，目标是把函数分成 4 类：

1. 主链函数（当前生产主路径）
2. 将退出主链函数（已被新链路替代）
3. 仍保留给 user flow 的函数
4. 疑似可删除函数（需验证后下线）

扫描口径：

- 扫描 `supabase/migrations/*.sql` 的 `public.* function` 定义（当前定义约 122）
- 扫描 `src` 内 `supabase.rpc(...)` 调用（当前调用 58）
- 交叉核对 invitation 新旧路径改造结果

---

## 1) 主链函数（Current Mainline）

以下函数仍在应用主链中（按领域归组）：

### A. Invitation / Guest Response

- `rpc_email_invitation_create`
- `rpc_email_invitation_get`
- `rpc_email_invitation_accept_as_guest`
- `rpc_email_invitation_decline_as_guest`

### B. Match Participant Core

- `rpc_match_create`
- `rpc_match_request_join`
- `rpc_match_admit_user`
- `rpc_match_nominate_user`
- `rpc_match_nominate_guest`
- `rpc_match_accept_invite`
- `rpc_match_org_approve_participant`
- `rpc_match_delegate_confirm_participant`
- `rpc_match_user_withdraw`
- `rpc_match_remove_participant`
- `rpc_match_admission_targets`
- `rpc_match_participant_display_names`
- `rpc_match_participant_emails_for_notification`

### C. Identity / Profile / Club / Group / Discovery

- `rpc_profile_init`
- `rpc_profile_update`
- `rpc_profile_set_avatar_url`
- `rpc_profile_set_display_name`
- `rpc_profile_set_primary_club`
- `rpc_club_identity_set_preferences`
- `rpc_club_create`
- `rpc_club_update`
- `rpc_club_join`
- `rpc_club_handle_set`
- `rpc_club_handle_check`
- `rpc_club_members_discovery`
- `rpc_admin_user_search`
- `rpc_club_admin_grant`
- `rpc_club_admin_revoke`
- `rpc_group_create`
- `rpc_group_update`
- `rpc_group_invite_user`
- `rpc_group_accept_invite`
- `rpc_group_reject_invite`
- `rpc_group_leave`
- `rpc_group_set_display_name`
- `rpc_invite_circle_list`
- `rpc_invite_circle_save_user`
- `rpc_invite_circle_remove_user`
- `rpc_roster_guest_list`
- `rpc_roster_guest_create`
- `rpc_contact_player_resolution`

### D. Sports + Infra

- `rpc_sports_list`
- `rpc_user_sports_set`
- `rpc_guest_sports_set`
- `rpc_get_queued_deliveries`
- `rpc_update_delivery_result`
- `rpc_reconcile_identity_guest_participants`
- `is_caller_in_match_scope`
- `is_club_admin`

---

## 2) 将退出主链（Exiting Mainline）

以下函数在“guest 邮件响应新主链”下应退出主链：

1. `rpc_email_invitation_accept`
2. `rpc_email_invitation_decline`
3. `rpc_match_accept_email_invitation`

退出原因：

- 这条链路绑定 user session / magic link，并会导向 user participant 写入语义；与“当前 match 响应保持在既有 guest participant”目标冲突。

当前状态建议：

- 标记为 **compat-only**（短期保留）
- 页面层与 server action 不再调用
- 完成一轮观测窗口后进入退役流程

---

## 3) 仍保留给 User Flow（Retain for User Flow）

以下函数即使不属于 guest 响应改造，也应继续保留：

1. 所有 match admission / request / confirm / withdraw / remove 主链函数（见第 1.B）
2. group / club / profile / discovery / sports 主链函数（见第 1.C + 1.D）
3. 后台投递与通知基础函数：`rpc_get_queued_deliveries`, `rpc_update_delivery_result`
4. identity 轻量 reconcile：`rpc_reconcile_identity_guest_participants`

说明：

- “保留”不等于不重构；只表示当前仍在实际 user flow 中有直接调用或关键依赖。

---

## 4) 疑似可删除（Suspected Deletable Functions）

按当前静态扫描，以下函数“无 src 直接调用 + 无明显主链依赖”，可列入删除候选池：

1. `rpc_email_invitation_update_flow_status`
   - 风险：若后续还有邮件追踪（opened/landed）埋点会用到，先确认事件链是否已废弃。

2. `rpc_reconcile_identity_after_magic_link`
   - 风险：旧 invitation accept 链内部可能仍调用；只有在旧链下线后才能删。

3. `rpc_roster_guest_contact_links`
   - 风险：可能被未来 roster UI 使用，需先确认产品侧是否仍需要“guest->user contact link 显示”。

补充（已进入退役轨道）：

- `rpc_match_manual_confirm`
- `rpc_match_manual_confirm_user`
- `rpc_match_add_guest_org`
- `rpc_match_add_guest_participant`
- `rpc_match_invite_guest_from_roster`

其中 manual_confirm 系列已有专门 drop migration（`20260322000002_drop_manual_confirm_rpcs.sql`），但是否在目标环境落地要以 migration state 为准。

---

## 5) 删除前验证（Validation Gates Before Drop）

每个候选函数删除前必须通过以下验证：

### Gate 1: 代码引用为 0

- `src` 无 `supabase.rpc('fn_name')`
- SQL/migration 无 `public.fn_name(...)` 动态调用
- 测试脚本无依赖

### Gate 2: 数据库依赖为 0

在目标数据库执行依赖扫描（`pg_depend`, `pg_proc`, `pg_trigger`），确认没有函数/触发器依赖。

### Gate 3: 运行观测窗口

- 至少一个完整发布周期（建议 7-14 天）
- 无错误日志命中 `function ... does not exist` 或旧链路关键字

### Gate 4: 回归用例通过

至少覆盖：

- invitation guest accept / decline
- match user flow（request/admit/accept/withdraw/remove）
- group/club/profile 基础路径

### Gate 5: 下线顺序

1. 页面/服务端先断引用
2. 保留函数 1 个窗口（compat）
3. 添加 drop migration
4. 在 staging 验证
5. 再进 production

---

## 6) 建议执行节奏

1. 先冻结“将退出主链”名单（第 2 节）
2. 先做 Gate 1/2 自动化扫描脚本
3. 产出第一版“Drop Candidate Batch A”（建议先 1-2 个低风险函数）
4. 每批次只删少量函数，滚动验证
5. 每批次更新 audit 文档与迁移清单

---

## 7) 当前需确认项

1. 旧 invitation accept/decline 是否还允许任何入口调用（例如兼容链接）
2. `rpc_email_invitation_update_flow_status` 是否仍承担邮件漏斗统计职责
3. `rpc_roster_guest_contact_links` 是否已进入实际 UI 计划
4. 远端数据库 migration 落地状态是否与本地一致（防止“本地可删、远端仍在用”）
