# Legacy / Retired Function Audit — Batch A

## Scope

基于当前扫描结果，给出首批函数治理建议（Batch A）：

- `Can Remove Now`（可进入删除实施）
- `Hold / Observe`（暂缓，先观测）
- `Keep`（当前必须保留）

本批次优先低风险、可回滚、可验证。

---

## Batch A Decision Matrix

## A) Can Remove Now (Low Risk)

### 1) `rpc_email_invitation_update_flow_status`

- 当前 `src` 未发现 `supabase.rpc('rpc_email_invitation_update_flow_status')` 调用。
- 未发现其它主链 SQL 函数依赖调用。
- 功能主要是 invitation funnel 状态（opened/verified/landed）记录，当前主链 accept/decline不依赖此函数正确性。

**删除前最后确认**

- 产品是否仍需要 invitation 邮件漏斗统计。
- 数据看板/BI 是否直接依赖该字段更新。

**建议动作**

- 若确认不需要漏斗：纳入 Batch A drop migration。
- 若还需要漏斗：降级为 `Hold`。

---

## B) Hold / Observe (Medium Risk)

### 2) `rpc_reconcile_identity_after_magic_link`

- 仍被旧链 `rpc_email_invitation_accept` 内部调用。
- 虽然页面已接到 guest 新路径，但代码库里仍保留旧函数定义和兼容入口。

**结论**：暂缓删除，先完成“旧 invitation user 链彻底下线”再删。

**转入 Can Remove 的条件**

1. `rpc_email_invitation_accept` / `rpc_email_invitation_decline` 从业务入口完全断开。
2. 观测窗口内无旧链调用日志。
3. 不再需要“magic link 接受后自动 identity link reconcile”。

---

### 3) `rpc_roster_guest_contact_links`

- `src` 没有直接调用，但数据库类型文件仍有签名，且文档表述该函数用于 roster UI 关联展示。
- 存在“未来 UI 可能启用”风险。

**结论**：暂缓删除，先做产品/前端确认。

**转入 Can Remove 的条件**

1. 产品确认“guest->registered user 的 roster 链接显示”不做。
2. 前端确认无近期开关/feature flag 依赖。
3. 观测窗口内调用为 0。

---

## C) Keep (Current Required)

以下属于当前必须保留：

1. 新 guest 主链：
   - `rpc_email_invitation_create`
   - `rpc_email_invitation_get`
   - `rpc_email_invitation_accept_as_guest`
   - `rpc_email_invitation_decline_as_guest`

2. 主链 match/user flow（request/admit/accept/approve/withdraw/remove 等）。

3. 旧链兼容函数（短期）：
   - `rpc_email_invitation_accept`
   - `rpc_email_invitation_decline`
   - `rpc_match_accept_email_invitation`

> 注：这三者“应退出主链”，但当前建议仍短期保留为 compat-only，先完成观测后再退役。

---

## Validation Checklist Before Drop

每个拟删函数执行统一 5-step gate：

1. **Code Gate**
   - `src` 无 `supabase.rpc('fn_name')` 直接调用
   - 无 server action / API route 间接调用

2. **DB Dependency Gate**
   - `pg_depend` / `pg_proc` / `pg_trigger` 无引用
   - 无其它函数体 `public.fn_name(...)` 调用

3. **Telemetry Gate**
   - staging + prod 观测 7-14 天调用量为 0

4. **Regression Gate**
   - invitation guest accept/decline
   - match user flow
   - roster/group/profile 关键路径

5. **Migration Gate**
   - 先 staging 执行 drop migration
   - 通过后再 production

---

## Proposed Batch A Migration Draft

建议新增：`supabase/migrations/20260328000000_drop_batch_a_low_risk_legacy_rpcs.sql`

仅包含（条件通过时）：

- `DROP FUNCTION IF EXISTS public.rpc_email_invitation_update_flow_status(uuid, text);`

> `rpc_reconcile_identity_after_magic_link` 与 `rpc_roster_guest_contact_links` 不进入本批 migration。

执行状态：已创建上述 migration，当前仅包含该单一 drop 语句。

配套验证清单：`supabase/validation/20260328000000_drop_batch_a_low_risk_legacy_rpcs_validation.sql`

---

## Follow-up (Batch B Candidates)

当 compat 窗口通过后，Batch B 可评估：

- `rpc_email_invitation_accept`
- `rpc_email_invitation_decline`
- `rpc_match_accept_email_invitation`
- `rpc_reconcile_identity_after_magic_link`

并同步清理：

- 未使用的旧前端组件/调用包装（如旧 invitation action 组件与 wrappers）。
