PlayerHoods · 每日启动工作流程（极简版 · Page 1）

目标：
5–10 分钟进入稳定开发状态，
不迷路、不返工、不纠结“今天该干什么”。

一、启动前（1 分钟 · 心智对齐）

在动手前，默念三句：

今天 只做一个切片

目标是 能跑 + 可提交

不追求完美，只追求 向前

如果今天状态差：
👉 允许只做 一个最小动作。

二、打开项目（1 分钟）

1️⃣ 用 VS Code 打开 playerhoods/ 项目根目录
确认能看到：
package.json
src/
.gitignore

目录不对 → 立刻停下修正。

2️⃣ 打开两个文件（强烈推荐）：
BLUEPRINT.md
RUN_DAILY.md

三、同步代码（1 分钟）
git checkout main
git pull

规则：
每天第一件事一定是 git pull
哪怕昨天就在这台电脑写。

四、启动开发环境（2 分钟）
npm run dev
确认终端显示：
Local: http://localhost:3000
浏览器打开：
http://localhost:3000

打不开时的唯一检查顺序：
dev server 还在不在跑
端口是否变化（3001 / 3002）

五、进入当天工作（核心）
5️⃣ 用一句话定义今天的切片
今天的切片是：__________
示例：
分享链接分发（只读）
报名 → 确认流程补完整
清理 matches 页面结构（不加功能）
写不出来 → 先别写代码。

6️⃣ 切片边界（30 秒）
在开始前确认三点：
✅ 做什么
❌ 不做什么
🧪 如验证完成
没有“验证方式”的切片，不开始写。

六、编码节奏（全天通用）
推荐节奏：
写一点
刷新页面验证
再写一点
避免：
一次写太多
不跑页面就继续写

### Dev Server 使用规则

- 默认：`npm run dev` 一直运行
- 仅在以下情况 Ctrl + C：
  - 修改 env / config / middleware 初始化
  - dev server 卡死或无响应
  - Claude 明确要求重启


七、结束前的固定收尾（3 分钟）
🔚 7️⃣ 确认还能跑
页面能打开
黄金路径没断

🔚 8️⃣ 提交到 GitHub（哪怕很小）
git add .
git commit -m "describe what you did today"
git push

示例：
feat: add basic share link
fix: keep dev user on refresh
chore: clean up matches page
规则：
不要等“完美”再 commit。

🔚 9️⃣ 给明天留一句入口提示（强烈推荐）
写一句：
“下次从 ______ 开始。”

示例：
下次补分享页文案
下次验证 organizer 权限
下次只整理 UI，不加功能

八、唯一要记住的一句话（写在文档底部）

每天推进一个可运行的小增量，
比一次性想清楚所有事情更重要。