# Participant Controls Manual Test Template

本模板用于补足 SQL 回归无法覆盖的页面行为，重点针对 Match 页面 participant rows 的菜单化交互。

## 准备

- 本地应用: `http://127.0.0.1:3000`
- 本地 Supabase Studio: `http://127.0.0.1:55323`
- 测试账号:
  - `oldchai@test.local` / `Test123!`
  - `u3@test.local` / `Test123!`
  - `real@test.local` / `Test123!`
  - `outsider@test.local` / `Test123!`

## 建议测试场景

- 场景 A: pending user row，尚未 player confirm
- 场景 B: pending user row，已经 delegate confirm，但未 org approve
- 场景 C: confirmed user row，由当前用户做过 delegate confirm
- 场景 D: pending guest/contact player row
- 场景 E: confirmed guest/contact player row，由当前用户做过 delegate confirm
- 场景 F: self row（pending / confirmed 各一）

## 1. Pending Row 状态表达

- [ ] pending row 第二行直接显示 blocker 文案，而不是只显示 `Pending`
- [ ] blocker 为以下三种之一：
  - `Waiting for player confirmation`
  - `Waiting for organizer approval`
  - `Waiting for organizer approval and player confirmation`
- [ ] 第三行显示两枚文字标签：
  - `Player pending/confirmed`
  - `Organizer pending/approved`

## 2. `...` 菜单可见性

- [ ] pending row 右侧存在 `...`
- [ ] confirmed row 右侧也存在 `...`
- [ ] removed row 不出现不该有的活跃操作菜单
- [ ] 点击 `...` 后显示 `View details`
- [ ] 点击菜单外任意空白区域，菜单会关闭

## 3. Confirm On Their Behalf

- [ ] `Confirm on their behalf` 只出现在 `...` 菜单中，不是一级主按钮
- [ ] 无 delegate confirm 权限时，该菜单项不显示
- [ ] 点击后弹出确认框：
  - 标题: `Confirm on their behalf?`
  - 说明: `Use this only if you already confirmed with them outside the app. This records the participant-side confirmation.`
- [ ] 确认后，row 状态更新为 player confirmed

## 4. Remove Participant

- [ ] pending row 上，只有 delegate confirmer 本人能看到 `Remove participant`
- [ ] organizer 如果不是 delegate confirmer，不应因为 organizer 身份自动看到 pending remove
- [ ] confirmed row 上，当前产品规则允许的 remove 入口只出现在 `...` 菜单中
- [ ] 点击 `Remove participant` 后出现确认框

## 5. No Retired Delegate-Revoke UI

- [ ] 不再出现 `Revoke delegated confirmation` 入口
- [ ] user row 与 guest/contact player row 都不应暴露 retired delegate-revoke 文案
- [ ] 当前 UI 只保留 self-service 与 Match Proxy canonical 动作

## 6. Self Actions

- [ ] 顶部不再出现高曝光的全局 `Leave Match`
- [ ] 自己的 pending / confirmed row 的 `...` 菜单中显示：
  - `Withdraw request` 或
  - `Decline participation` 或
  - `Leave match`
- [ ] 这些 self actions 不应出现在他人 row 上

## 7. Guest / Contact Player Parity

- [ ] guest/contact player 的 pending row 也能看到 blocker 文案
- [ ] guest/contact player 的 delegated confirm 走同样的 `...` 菜单入口
- [ ] guest/contact player 的 revoke delegated confirm 与 user participant 行为一致

## 8. 记录建议

每次执行本模板时，建议补记：

- 测试日期
- 使用账号
- 对应 match 名称或 match id
- 实际结果 / 偏差点
- 是否需要补 SQL 回归或服务端 guard
