# Contact Player 问题 — 证据收集计划（只读 + 最小修复）

**日期:** 2026-03-10  
**约束:** 不改动核心 helper、主干 RPC、identity_links、guest/user canonical 规则。仅做证据调查与最小风险修复。

---

## A. 证据收集计划

### A1. 数据库证据

| 步骤 | 目标 | 方法 |
|------|------|------|
| 1 | 确认问题 match 中该 contact 的 participant 行数 | 执行 SQL-1（按 match_id + email 查） |
| 2 | 检查是否存在 guest + user 重复行 | 执行 SQL-2（同一 match 下按 email 关联） |
| 3 | 查看各行的 status、removed_at、participant_accepted_at、org_approved_at | SQL-1 已包含 |
| 4 | 检查 identity_links 是否已建立 | 执行 SQL-3 |

### A2. 前端 / API 证据

| 步骤 | 目标 | 方法 |
|------|------|------|
| 5 | 确认 Remove 点击时 RPC 是否被调用 | 打开 DevTools → Network，筛选 `rpc_match_remove_participant` |
| 6 | 记录 RPC 返回的 status、error 内容 | 查看 Response 与 Console |
| 7 | 确认错误是否展示给用户 | 观察 Remove 后是否有红色错误文案 |
| 8 | 确认 server action 抛错时 message 是否传递 | 检查 handleRemoveParticipant 与 ParticipantGroups 的 catch 逻辑 |

### A3. 复现路径确认

| 步骤 | 目标 | 方法 |
|------|------|------|
| 9 | 确认邀请方式 | 记录：AddGuestForm / InviteGuestForm / InviteByEmailForm |
| 10 | 确认 contact 登录/接受路径 | 记录：magic link、email invitation accept、直接登录后访问 match |

---

## B. 需要执行的只读 SQL

**前置条件：** 需已知 `match_id` 和 contact 的 `email`（或 `guest_id`）。若暂不知，可先查最近有 guest 的 match。

### SQL-0：列出最近有 guest participant 的 match（用于定位问题 match）

```sql
-- 在 local DB 执行
SELECT
  mp.match_id,
  m.game_type,
  m.match_date,
  g.display_name,
  g.email,
  mp.id AS participant_id,
  mp.user_id,
  mp.guest_id,
  mp.status,
  mp.join_method,
  mp.participant_accepted_at,
  mp.org_approved_at,
  mp.removed_at,
  mp.created_at
FROM match_participants mp
JOIN guests g ON g.id = mp.guest_id
JOIN matches m ON m.id = mp.match_id
WHERE mp.guest_id IS NOT NULL
ORDER BY mp.created_at DESC
LIMIT 20;
```

### SQL-1：指定 match 下按 email 查 participant 行（含 guest + user）

```sql
-- 替换 'YOUR_MATCH_ID' 和 'contact@example.com'
WITH target_email AS (
  SELECT lower(trim('contact@example.com'::text)) AS e
)
SELECT
  mp.id,
  mp.match_id,
  mp.user_id,
  mp.guest_id,
  mp.status,
  mp.join_method,
  mp.participant_accepted_at,
  mp.org_approved_at,
  mp.removed_at,
  mp.removed_by,
  mp.created_at,
  g.email AS guest_email,
  p.display_name AS user_display_name
FROM match_participants mp
LEFT JOIN guests g ON g.id = mp.guest_id
LEFT JOIN profiles p ON p.id = mp.user_id
WHERE mp.match_id = 'YOUR_MATCH_ID'::uuid
  AND (
    (mp.guest_id IS NOT NULL AND lower(trim(g.email)) = (SELECT e FROM target_email))
    OR (mp.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = mp.user_id AND lower(trim(u.email::text)) = (SELECT e FROM target_email)
    ))
  )
ORDER BY mp.created_at DESC;
```

### SQL-2：同一 match 下 guest 与 user 的 email 关联（查重复行）

```sql
-- 替换 'YOUR_MATCH_ID'
SELECT
  mp_guest.id AS guest_mp_id,
  mp_user.id AS user_mp_id,
  g.email AS guest_email,
  u.email AS user_email,
  mp_guest.status AS guest_status,
  mp_user.status AS user_status,
  mp_guest.removed_at AS guest_removed_at,
  mp_user.removed_at AS user_removed_at
FROM match_participants mp_guest
JOIN guests g ON g.id = mp_guest.guest_id
JOIN match_participants mp_user ON mp_user.match_id = mp_guest.match_id AND mp_user.user_id IS NOT NULL
JOIN auth.users u ON u.id = mp_user.user_id
WHERE mp_guest.match_id = 'YOUR_MATCH_ID'::uuid
  AND mp_guest.guest_id IS NOT NULL
  AND lower(trim(g.email)) = lower(trim(u.email::text))
  AND mp_guest.removed_at IS NULL
  AND mp_user.removed_at IS NULL;
```

### SQL-3：该 contact 的 identity_links

```sql
-- 替换 'contact@example.com'
SELECT
  il.id,
  il.linked_type,
  il.linked_id,
  il.user_id,
  il.verified_email,
  il.created_at
FROM identity_links il
WHERE il.verified_email = lower(trim('contact@example.com'::text))
ORDER BY il.created_at DESC;
```

### SQL-4：简化版 — 按 match_id 查所有 participant（含 guest email）

```sql
-- 替换 'YOUR_MATCH_ID'
SELECT
  mp.id,
  mp.user_id,
  mp.guest_id,
  mp.status,
  mp.join_method,
  mp.participant_accepted_at,
  mp.org_approved_at,
  mp.removed_at,
  COALESCE(g.email, (SELECT email FROM auth.users WHERE id = mp.user_id)) AS email
FROM match_participants mp
LEFT JOIN guests g ON g.id = mp.guest_id
WHERE mp.match_id = 'YOUR_MATCH_ID'::uuid
ORDER BY mp.created_at;
```

---

## C. 最小风险修复项

### C1. 强化 Remove 错误展示（前端）

**现状：** `ParticipantGroups` 中 `catch` 使用 `(err as { message?: string })?.message ?? 'Action failed'`。Server action 抛错时，Next.js 可能返回 `Error` 或 `{ message?: string }`，`message` 有时可能未正确传递。

**建议修改：** 仅改错误提取逻辑，不碰 RPC 或业务逻辑。

```ts
// ParticipantGroups.tsx
} catch (err: unknown) {
  const msg = err instanceof Error
    ? err.message
    : (err as { message?: string })?.message ?? 'Action failed'
  setError(msg)
}
```

**风险：** 极低，仅影响错误文案展示。

### C2. Server action 显式返回错误（可选）

**现状：** `handleRemoveParticipant` 直接 `await removeParticipant`，抛错时由 Next.js 序列化后传到 client。

**建议：** 在 server action 内 try/catch，将 `error.message` 通过 `ActionError` 或 `redirect` 传递。需评估 Next.js server action 的推荐做法。

**风险：** 低，但涉及 server action 的 error handling 模式，可暂缓。

### C3. API 层保留完整 error 信息（可选）

**现状：** `removeParticipant` 中 `if (error) throw error`。Supabase 的 `error` 对象通常可直接 throw，client 会收到。

**建议：** 确保 throw 的是包含 `message` 的 Error。若 Supabase 返回非标准结构，可 `throw new Error(error.message ?? 'Remove failed')`。

**风险：** 低，但可能改变错误类型，可暂缓。

---

## D. 高风险改动项（仅列出，不实施）

| 项目 | 说明 | 风险 |
|------|------|------|
| 修改 `rpc_match_accept_email_invitation` | 在已有 guest 时改为更新而非新建 user participant | 可能影响 email invitation 语义、重复行逻辑 |
| 修改 `apply_participant_exit` | 任何行为变更 | 影响 remove/withdraw 全链路 |
| 修改 `apply_participant_admission` | 任何行为变更 | 影响 admit/request/nominate |
| 修改 `match_participant_reconcile_status` | 任何行为变更 | 影响 status 推导 |
| 修改 `identity_links` 规则 | 影响 guest↔user 关联 | 影响可见性、匹配逻辑 |
| 修改 guest/user canonical 规则 | 影响行约束、唯一性 | 影响数据一致性 |
| 合并/删除重复 participant 行 | 需 migration + 业务规则 | 可能破坏历史数据 |

---

## E. 执行顺序建议

1. 执行 SQL-0 或 SQL-4，定位问题 match 和 contact 的 participant 行。
2. 执行 SQL-1、SQL-2、SQL-3，收集证据。
3. 在浏览器中复现 Remove，记录 Network 和 Console。
4. 若确认错误未正确展示，实施 C1（最小风险修复）。
