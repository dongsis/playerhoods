# Contact Player 问题 — 分层修复方案

**日期:** 2026-03-11  
**证据确认:** (A) 同一 match 中同一人存在 user + guest 两条 participant 行；(B) guest 行存在 status=confirmed 但 participant_accepted_at=NULL 的状态不一致。

**约束:** 不改动 `rpc_match_accept_email_invitation`、`apply_participant_*`、`match_participant_reconcile_status`、identity_links、guest/user canonical 规则。Level 3 仅列出，不实施。

---

## 禁止改动的文件/函数

| 类别 | 文件/函数 |
|------|-----------|
| 核心 helper | `apply_participant_admission`, `apply_participant_acceptance`, `apply_participant_exit` |
| 状态推导 | `match_participant_reconcile_status` |
| 主干 RPC | `rpc_match_accept_email_invitation`, `rpc_match_remove_participant`, `rpc_match_nominate_guest` |
| 身份规则 | `identity_links` 表及所有相关 RLS/逻辑 |
| 行约束 | `match_participants` 的 guest/user canonical 约束 |

---

## Level 1：低风险（可实施）

### L1.1 Remove 错误显式展示

**目标:** 确保 Remove 失败时，用户能看到具体错误信息。

**改动文件:** `src/app/matches/[matchId]/ParticipantGroups.tsx`

**改动内容:**
- 两处 `catch`（`onRemoveParticipant` 分支与 `act` 分支）统一错误提取逻辑：
  ```ts
  const msg = err instanceof Error
    ? err.message
    : (err as { message?: string })?.message ?? 'Action failed'
  setError(msg)
  ```

**不改动:** `removeParticipant`、`handleRemoveParticipant`、任何 RPC

---

### L1.2 页面/调试可见性：重复行标识

**目标:** 当同一人存在多条 participant 行时，在 UI 上明确标识，便于确认 Remove 的是哪一行。

**改动文件:**
1. `src/lib/api/matches.ts` — `getMatchDetailData`
2. `src/app/matches/[matchId]/ParticipantGroups.tsx` — 展示层

**改动内容:**

1. **getMatchDetailData**  
   - 在 `enriched` 计算后，增加重复检测逻辑：  
     - 按 `effectiveUserId`（user_id 或 identity_links 的 linked user_id）分组；  
     - 若某 identity 对应 ≥2 个 participant，则这些 participant 标记为 `isDuplicate: true`，并记录 `duplicateIdentityKey`（如 effectiveUserId）用于同组关联。  
   - 扩展 `MatchParticipantEnriched` 类型，增加可选字段：`isDuplicate?: boolean`, `duplicateIdentityKey?: string`。  
   - **注意：** 当前 `participantLinkedToUser` 仅包含 `user_id = auth.uid()` 的 identity_links（RLS 限制），organizer 无法直接看到 contact 的 guest→user 链接。若需完整重复检测，可新增 RPC `rpc_match_guest_participant_linked_users(p_match_id)` 返回 `(participant_id, linked_user_id)`，SECURITY DEFINER，供 organizer 使用。否则仅能基于现有数据做部分检测。

2. **ParticipantGroups**  
   - 在 participant 行旁显示行类型与 id（仅 organizer 或 dev 模式）：  
     - 如 `(user · id: xxx)` 或 `(guest · id: xxx)`；  
     - 若 `isDuplicate`，增加视觉提示，如 `[duplicate]` 或小图标。

**不改动:** RPC、reconcile、participant 写入逻辑

---

### L1.3 确认 Remove 的是哪一行

**目标:** 点击 Remove 时，明确传参和展示的是哪一条 participant 的 id。

**改动文件:** `src/app/matches/[matchId]/ParticipantGroups.tsx`

**改动内容:**
- Remove 按钮的 `onClick` 中，确保 `onRemoveParticipant(p.id)` 或 `removeParticipant(supabase, p.id)` 使用当前行的 `p.id`（已满足）。  
- 配合 L1.2，在行上显示 `p.id` 的短格式（如前 8 位），便于与 Network 请求中的 `p_match_participant_id` 对照。

**不改动:** RPC 参数、server action 签名

---

## Level 2：中风险（可实施）

### L2.1 修复/重算无效 guest participant 状态

**目标:** 将 `status=confirmed` 且 `participant_accepted_at IS NULL` 的 guest 行，通过调用既有 reconcile 修正为 `pending`。

**原则:** 不修改 `match_participant_reconcile_status`，仅调用它。

**改动文件:** 新建 migration

**路径:** `supabase/migrations/YYYYMMDDHHMMSS_repair_stale_guest_confirmed_status.sql`

**改动内容:**
```sql
-- 对 status=confirmed 且 participant_accepted_at IS NULL 的 guest 行，重新执行 reconcile
DO $$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.match_participants
    WHERE guest_id IS NOT NULL
      AND status = 'confirmed'
      AND participant_accepted_at IS NULL
      AND removed_at IS NULL
  LOOP
    PERFORM public.match_participant_reconcile_status(r.id);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Repaired % stale guest participant(s)', v_count;
END $$;
```

**不改动:** `match_participant_reconcile_status` 实现、任何 RPC 逻辑

---

### L2.2 定义 stale confirmed guest 的修正规则

**目标:** 将修正规则文档化，供后续维护和排查使用。

**改动文件:** 新建文档

**路径:** `docs/fixes/Stale_Guest_Confirmed_Repair_Rule.md`

**改动内容:**
- 定义无效状态：`guest_id IS NOT NULL AND status = 'confirmed' AND participant_accepted_at IS NULL`。  
- 修正方式：对符合条件行调用 `match_participant_reconcile_status(id)`，由 reconcile 根据 `participant_accepted_at` 与 `org_approved_at` 重新推导 status。  
- 说明：不直接写 `status`，不修改 reconcile 逻辑。

**不改动:** 任何代码或 schema

---

## Level 3：高风险（仅列出，不实施）

### L3.1 Contact Player 注册/登录后的 canonical participant 策略

**待决策:**
- 当 Contact 通过 magic link / email accept 注册或登录时，同一 match 中应保留几条 participant 行？  
- 若保留一条：应复用 guest 行，还是新建 user 行并废弃 guest 行？

**涉及范围:** `rpc_match_accept_email_invitation`、`rpc_reconcile_identity_*`、可能的 migration 与 RPC 新增。

**不实施:** 本阶段仅记录决策点，不做实现。

---

### L3.2 重复行的合并/清理策略

**待决策:**
- 对已存在的 guest + user 重复行，是否做一次性或定期清理？  
- 若清理：保留哪一行、如何迁移 activity、如何更新 identity_links？

**涉及范围:** migration、可能的 admin RPC、数据迁移脚本。

**不实施:** 本阶段仅记录，不做实现。

---

## 实施顺序建议

| 阶段 | 项目 | 依赖 |
|------|------|------|
| 1 | L1.1 错误展示 | 无 |
| 2 | L1.2 重复行可见性 | 无 |
| 3 | L1.3 确认 Remove 目标行 | 可与 L1.2 一并做 |
| 4 | L2.2 文档规则 | 无 |
| 5 | L2.1 修复 migration | 建议在 L2.2 之后，便于理解与回滚 |

---

## 文件改动汇总

| Level | 文件 | 操作 |
|-------|------|------|
| L1.1 | `ParticipantGroups.tsx` | 修改 catch 错误提取 |
| L1.2 | `matches.ts` (getMatchDetailData) | 增加重复检测、扩展类型 |
| L1.2 | `ParticipantGroups.tsx` | 展示 duplicate 标识、行类型/id |
| L1.2（可选） | 新建 migration + RPC | `rpc_match_guest_participant_linked_users`，用于完整重复检测 |
| L1.3 | `ParticipantGroups.tsx` | 展示 participant id 短格式（与 L1.2 合并） |
| L2.1 | 新建 migration | 调用 reconcile 修复 stale guest |
| L2.2 | 新建 `Stale_Guest_Confirmed_Repair_Rule.md` | 文档 |
