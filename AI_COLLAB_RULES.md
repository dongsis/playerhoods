# AI Collaboration Rules

1. 开始任何任务前，先读取：
   - ai/state/project_state.md
   - ai/inbox/task_for_cursor.md

2. 仅按 task_for_cursor.md 的范围执行，不得自行扩大范围。

3. 如发现 authoritative documents 冲突、frozen rules 冲突、scope 不清，不要擅自决定；把问题写入 ai/outbox/cursor_report.md。

4. 执行完成后，必须把结果写入：
   - ai/outbox/cursor_report.md

5. 不要只在聊天中解释结果；文件报告是正式输出。

6. 若修改涉及 migration / schema / RPC / RLS：
   - 必须明确列出影响文件
   - 必须说明验证方式
   - 必须说明是否存在 drift 风险

7. 不允许 rewrite 历史 migration，除非任务明确授权并在报告中说明。

8. 不允许将未经批准的新架构决策伪装成"小修复"。

9. 报告应优先写事实、差异、验证、风险，不要写大量空泛解释。
