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


常见问题

3. Next.js Chunk / Module Not Found 错误

典型症状

Cannot find module './682.js'
ChunkLoadError: Loading chunk app/... failed
页面空白或 localhost refused to connect

根因
.next 缓存与源码不一致
路由文件被移动/删除
热更新残留旧 chunk

标准修复流程（必须按顺序）

1) 先停掉开发服务器

在运行 npm run dev 的那个终端里按 Ctrl + C 停掉。

2) 用 PowerShell 正确删除 .next（含缓存）

在项目根目录（你这里是 C:\Users\dongs\Documents\playerhoods）执行：
Remove-Item -Recurse -Force .next

如果提示找不到或删不干净，再补一条（有时是缓存子目录残留）：
Remove-Item -Recurse -Force .next\cache -ErrorAction SilentlyContinue

说明：PowerShell 里正确的“rm -rf”等价写法就是 Remove-Item -Recurse -Force。

3) 彻底重装依赖（建议做）

这种 ./16.js 缺失，很多时候是 node_modules/lockfile 与构建产物不匹配导致。直接重装最省时间。

npm 用户（看你像是 npm）：

Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm cache clean --force
npm install


如果你用的是 pnpm/yarn，把对应的 lockfile（pnpm-lock.yaml / yarn.lock）也一起删掉再重装。

4) 重新启动 dev
npm run dev


⚠️ 不要在 Chunk 报错时反复刷新浏览器

4. 页面存在，但 localhost:3000 访问失败

典型症状

终端显示 Compiled successfully

浏览器显示 ERR_CONNECTION_REFUSED

根因

Dev server 实际未监听 3000

上一次进程异常退出

排查

netstat -ano | findstr :3000


解决

Ctrl + C
npm run dev


确认看到：

Local: http://localhost:3000

5. Supabase 环境变量缺失

典型症状

Your project's URL and Key are required to create a Supabase client

middleware.ts 报错

根因

.env.local 不存在或变量名错误

GitHub 拉代码后忘记补环境变量

解决办法

从 Supabase Dashboard → Settings → API

创建 .env.local：

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...


重启 dev server

6. 注册成功，但数据库报错（Trigger / 表结构不一致）

典型症状

注册页面显示：Database error saving new user

Logs 显示：

column "email" of relation "user_settings" does not exist


根因

trigger 中 INSERT 使用了已删除或不存在的字段

表结构调整后未同步 trigger

解决办法

以“表结构为准”修 trigger

不要为 trigger 表随意加字段

示例（正确做法）

INSERT INTO public.user_settings (user_id)
VALUES (NEW.id)
ON CONFLICT (user_id) DO NOTHING;

9. Git 仓库状态异常

典型症状

git status 报错

push 失败 / repo 不干净

根因

解压覆盖 .git

在错误目录初始化仓库

修复原则

一个项目只允许一个 .git

不在嵌套目录 init

正确流程

git init
git remote add origin https://github.com/xxx/playerhoods.git
git add .
git commit -m "initial clean state"
git push -u origin main

### 关于Constitution
一、最低成本方案（你现在就该用的）
✅ 做法：固定三段式输入法
第 1 段（只在新对话第一条用一次）

完整粘贴《Claude Group Constitution》全文

你已经有了，我给你的那份就是为此写的。

这是“宪法加载”，只做一次。

第 2 段（你每次喂切片前的固定一句话）

在每个切片任务前，加这一句即可：

“Please strictly follow the Group Constitution defined above.”

这句话非常关键，比你想象的有效得多。

第 3 段（具体任务）

然后再给 Claude 具体任务，比如：

“Now implement Slice 1: groups and group_members tables with constraints and RLS.”

✅ 为什么这已经“足够稳定”

Claude 对已给出的系统级规则有很强的遵守倾向

只要你不在后续指令中自相矛盾

它会自动：

拒绝引入好友 / feed / chat

按 Group 边界思考

在 SQL / TS / UI 中保持一致

👉 90% 的偏移在这里就能避免。

二、提高遵守率的“强化技巧”（但仍然简单）

如果你想进一步降低跑偏概率，用下面两个技巧即可。

技巧 1：给 Claude 一个“自检指令”（非常有效）

在切片任务后面，加一句：

“Before answering, check your design against the Group Constitution and revise if any violation exists.”

这会触发 Claude 的自我一致性校验，非常有用。

技巧 2：当你发现它第一次跑偏时，不要解释，直接“引用宪法”

❌ 不要这样：

“你这样不对，我们之前说过不要做好友系统……”

✅ 而是这样：

“This violates the Group Constitution, section X. Please revise.”

Claude 对这种“规则引用式纠错”的服从度远高于解释式纠错。

三、长期最稳方案（你项目推进到中后期时）

当你和 Claude 的协作变复杂（多个切片、多轮实现），我建议你：

🔒 固定一个「Constitution 模板文件」

例如你在项目里有：

/docs/claude/GroupConstitution.md


然后你在 Claude 对话里统一这样说：

“Use GroupConstitution.md as the governing rules for all Group-related logic.”

这样 Claude 会把它当作**“外部不可变约束”**，而不是对话里的随意说明。

四、一个你一定要避免的反模式（很重要）
❌ 不要指望 Claude “记住你的风格”

不要这样做：

不断在不同对话里解释

期望它“理解你的哲学”

用自然语言反复讨论价值观

👉 模型不是人，它靠的是约束，不是共识。

五、最小可执行 Checklist（你可以照着贴在旁边）

每次用 Claude 做 Group 相关事情前，检查三件事：

 Constitution 已在本对话加载

 切片任务前有一句 “Please follow the Group Constitution”

 如果发现偏移，用“违反第 X 条”方式纠正，而不是解释

只要做到这三点，Claude 跑偏的概率会降到非常低。

### 关于枚举赋值
未来如何避免“我让你改的”和 Claude 最终结果不一致
这是流程问题。给你一个最低成本的治理方法，三条就能解决 90%：
规则 1：把“可变项”列成一页 Spec，Claude 必须引用
你现在不一致的根源，其实是：
join_policy 值集合没有“单一真源”


解决：
建一个 docs/specs/group_v1.md，里面只写三件事：


枚举值（join_policy / visibility / status / join_method）


约束（direct 上限、organized 必须 keeper/name）


RLS 目标（谁能读/写/改/删）


然后你每次喂 Claude 都说：
“All enums and constraints must match docs/specs/group_v1.md. Do not invent new enum values.”

规则 2：Claude 只能输出 “patch migration”，不能输出 “create everything”
你让它生成整份 migration，它就会“顺手发明”更多策略和值。
你要固定提示词：
“Generate a patch migration that only alters existing schema. Use DROP IF EXISTS / CREATE IF NOT EXISTS.”

规则 3：任何新增枚举值必须先过“枚举变更门禁”
比如 Claude 想加 auto_join_via_link，必须先输出：
为什么需要


哪些地方要改（DB/RLS/UI）


v1 是否接受


否则禁止进入 SQL。
六、以后如何避免同类问题（非常具体）
✅ 规则 1：所有切片必须“声明依赖的枚举表”
以后你给 Claude 的切片开头，固定加一句：
“This slice must strictly follow the enums defined in docs/specs/group_contract_v1.md.
 Do not introduce new enum values.”

✅ 规则 2：任何新增枚举值 = 新切片，而不是顺手加
如果未来你真的需要：
member_invite_auto_join


auto_join_via_link


正确流程是：
新切片：Enum Extension Slice


### 喂切片前夕Claude Project Prompt — playerhoods.com (Final)
You are working on the playerhoods.com codebase.

This project has constitutional and governance constraints that MUST NOT be violated.

Authoritative documents:
- docs/constitution/Group Constitution.md
- docs/Group Governance – Technical Appendix.md

These documents define non-negotiable rules. Do not reinterpret, simplify, or bypass them.

Core invariants:
1) Group is the only people boundary.
2) Any governance-related schema, view, RLS, or migration change must comply with the Technical Appendix.

Database rules (critical):
- Views are public APIs: NO table.* usage.
- All views MUST use explicit column lists.
- Existing view column order MUST be preserved.
- New columns MUST be appended only.
- Migration order is fixed: ALTER TABLE → VIEW → RLS → VERIFICATION.

Migrations:
- Any change affecting Governance or Contract objects MUST use the - docs/supabase/migrations/Governance Migration Template.sql.
- Include post-migration verification (column order checks).
- If a rule is violated, rewrite the migration until fully compliant.

If there is ambiguity:
- Do not guess.
- Ask for clarification or reference the authoritative documents.

Failure to comply with these rules is not acceptable.
