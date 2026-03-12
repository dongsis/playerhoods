# Re-entry Admission Audit — 2026-03

## 背景

K 组回归测试（K01/K02/K03）全部失败，错误集中在 re-entry 路径：
- **K01**: `User is already a participant in this match`
- **K02**: `duplicate key value violates unique constraint "uq_match_participants_active_user"`
- **K03**: `User is already a participant in this match`

本报告审查 re-entry 相关逻辑，核对四处口径是否一致。

---

## 1. 四处口径对照

| 位置 | 当前判定条件 | 语义 |
|------|--------------|------|
| **is_user_match_associated** | `status <> 'removed'` | 排除 removed 参与者 |
| **apply_participant_admission 的 re-entry 查找** | `status = 'removed'` | 查找可复活的 removed row |
| **request_join 的“已参与”判定** | `removed_at IS NULL` | 有 active row 则报错 |
| **uq_match_participants_active_user** | `status <> 'removed'` (partial index) | 仅对非 removed 行建唯一约束 |

---

## 2. 根因判断

### 2.1 核心不一致：status vs removed_at

20260305310000 已明确：**removed_at 为 canonical，status 为派生**。

但当前实现仍多处依赖 `status = 'removed'` / `status <> 'removed'`：

| 函数/对象 | 使用 | 问题 |
|-----------|------|------|
| `is_user_match_associated` | `status <> 'removed'` | 若 reconcile 未及时把 status 置为 removed，removed 用户仍被视为 associated |
| `apply_participant_admission` re-entry | `status = 'removed'` | 若 status 未变为 removed，找不到 row，走 Fresh INSERT |
| `can_admit_user_to_match` re-entry 条件 | `mp.status = 'removed'` | 同上 |
| `uq_match_participants_active_user` | `status <> 'removed'` | 与 removed_at 语义一致，但依赖 status 正确 |

### 2.2 失败链路推演

**K01 / K03（"already a participant"）：**

1. `apply_participant_exit` 先 `UPDATE removed_at = now()`，再 `PERFORM reconcile`。
2. 若 reconcile 的 UPDATE 未生效（WHERE 不匹配、时序等），则 `status` 仍为 `confirmed`。
3. `is_user_match_associated` 用 `status <> 'removed'`，此时仍为 true。
4. 抛出 `User is already a participant in this match`。

**K02（duplicate key）：**

1. 同上，`status` 未变为 `removed`。
2. `apply_participant_admission` 用 `status = 'removed'` 查找，找不到。
3. 走 Fresh INSERT。
4. 表中已有 (match_id, user_id) 的 active row（status <> 'removed'），INSERT 触发唯一约束。

### 2.3 为何 reconcile 可能未生效

`match_participant_reconcile_status` 的 Removed 分支：

```sql
WHERE id = p_mp_id
  AND (
    status    <> 'removed'::public.match_participant_status
    OR confirmed_at IS NOT NULL
    OR removed_at   IS NULL
  );
```

正常情况下会匹配。但若存在：

- 触发器或约束在 UPDATE 时修改行
- 并发或事务可见性导致读到旧状态
- 其他迁移覆盖了 reconcile 逻辑

则可能出现 `removed_at` 已设而 `status` 未更新的短暂不一致。一旦依赖 `status`，就会出错。

---

## 3. 涉及的具体 helper / RPC / index

| 类型 | 名称 | 文件 | 当前逻辑 |
|------|------|------|----------|
| Helper | `is_user_match_associated` | 20260305150000 | `status <> 'removed'` |
| Helper | `apply_participant_admission` | 20260324000000 | re-entry 查找 `status = 'removed'` |
| Helper | `match_participant_reconcile_status` | 20260305310000 | 以 `removed_at IS NOT NULL` 为 canonical |
| RPC | `rpc_match_admit_user` | 20260324000000 | 调用 `is_user_match_associated` 后调用 `apply_participant_admission` |
| RPC | `rpc_match_request_join` | 20260324000000 | 用 `removed_at IS NULL` 判定“已参与”，再调用 `apply_participant_admission` |
| Predicate | `can_admit_user_to_match` | 20260313000000 | re-entry 条件 `mp.status = 'removed'` |
| Index | `uq_match_participants_active_user` | 0001_baseline | `WHERE status <> 'removed'` |

---

## 4. 核心问题回答

### Q1: 是否仍用 status='removed' 做 re-entry 判定，而不是 removed_at？

**是。** `apply_participant_admission` 和 `can_admit_user_to_match` 的 re-entry 分支都用 `status = 'removed'`，未统一到 `removed_at IS NOT NULL`。

### Q2: 为何 is_user_match_associated excludes removed，但 K01/K03 仍报 "already a participant"？

因为 `is_user_match_associated` 用 `status <> 'removed'`。若 reconcile 未把 `status` 置为 `removed`，removed 行仍被视为 associated，从而触发 "already a participant"。

### Q3: 为何 K02 会走到 INSERT 并撞唯一索引，而不是 re-entry UPDATE？

因为 re-entry 查找用 `status = 'removed'`。若 `status` 未更新，找不到 removed row，只能走 Fresh INSERT；而表中已有 active row，INSERT 违反 `uq_match_participants_active_user`。

### Q4: re-entry 的正确统一语义应是什么？

- **语义**：removed row 复活，应 UPDATE 现有 row，不应新建 row。
- **判定**：以 `removed_at IS NOT NULL` 为 canonical，不依赖 `status`。
- **各入口**：admit_user、request_join、nominate 等应统一走同一 re-entry 逻辑。

---

## 5. 最小修复方案

### 5.1 统一使用 removed_at

| 修改点 | 当前 | 建议 |
|--------|------|------|
| `is_user_match_associated` | `mp.status <> 'removed'` | `mp.removed_at IS NULL` |
| `apply_participant_admission` re-entry 查找 | `AND status = 'removed'` | `AND removed_at IS NOT NULL` |
| `can_admit_user_to_match` re-entry 条件 | `mp.status = 'removed'` | `mp.removed_at IS NOT NULL` |

### 5.2 不改动的部分

- **uq_match_participants_active_user**：`status <> 'removed'` 与 `removed_at IS NULL` 在正常 reconcile 下等价；且 partial unique index 不能直接用 `removed_at` 表达，保持现状即可。
- **request_join**：已用 `removed_at IS NULL` 判定“已参与”，无需修改。

### 5.3 预期效果

- `apply_participant_exit` 一旦设置 `removed_at`，用户即被视为 removed。
- `is_user_match_associated` 立即返回 false，不再误报 "already a participant"。
- `apply_participant_admission` 能可靠找到 removed row，走 UPDATE 而非 INSERT，避免唯一约束冲突。

---

## 6. 是否建议新增统一 re-entry helper

**不建议**。现有 `apply_participant_admission` 已集中 re-entry 逻辑，问题在于查找条件用 `status` 而非 `removed_at`。

建议：

1. 在 `apply_participant_admission` 内将 re-entry 查找改为 `removed_at IS NOT NULL`。
2. 在 `is_user_match_associated` 和 `can_admit_user_to_match` 中改为使用 `removed_at IS NULL` / `removed_at IS NOT NULL`。
3. 不新增 helper，保持 re-entry 逻辑下沉在现有 admission helper 中。

---

## 7. 总结

| 项目 | 结论 |
|------|------|
| **根因** | 以 `status` 而非 `removed_at` 作为 removed 判定，与 20260305310000 的 canonical 语义不一致 |
| **影响** | K01/K03 误报 "already a participant"；K02 误走 INSERT 并触发唯一约束 |
| **修复** | 三处改为使用 `removed_at`：`is_user_match_associated`、`apply_participant_admission`、`can_admit_user_to_match` |
| **范围** | 单次 migration，约 3 个函数，改动小、风险可控 |
