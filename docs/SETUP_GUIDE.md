# PlayerHoods 本地运行操作指南（小白版）

本指南帮助你从零开始，在本地电脑上运行 PlayerHoods 项目。

---

## 前置准备

### 1. 确认已安装 Node.js

打开终端（Windows 用 PowerShell 或 Git Bash），输入：

```bash
node -v
npm -v
```

如果显示版本号（如 `v24.12.0` 和 `11.6.2`），说明已安装。

如果提示"命令不存在"，请先去 [Node.js 官网](https://nodejs.org/) 下载安装 LTS 版本。

### 2. 确认有 Supabase 项目

你需要一个已配置好数据库的 Supabase 项目。如果还没有：
1. 注册 [Supabase](https://supabase.com/)
2. 创建新项目
3. 运行数据库迁移脚本（见《数据库搭建指南》）

---

## 第一步：下载项目文件

1. 从 Claude 对话中下载 `playerhoods.zip` 文件
2. 保存到你电脑的 `下载` 文件夹（或其他你记得的位置）

---

## 第二步：解压文件

### 方法 A：使用文件管理器（推荐新手）

1. 打开 `下载` 文件夹
2. 找到 `playerhoods.zip`
3. 右键点击 → 选择 **"全部解压缩"** 或 **"解压到当前文件夹"**
4. 你会得到一个 `playerhoods` 文件夹

### 方法 B：使用终端

```bash
cd ~/Downloads
unzip playerhoods.zip
```

---

## 第三步：打开终端并进入项目目录

### Windows（Git Bash / MINGW64）

```bash
cd ~/Downloads/playerhoods
```

### Windows（PowerShell）

```powershell
cd $HOME\Downloads\playerhoods
```

### Mac / Linux

```bash
cd ~/Downloads/playerhoods
```

输入 `ls` 或 `dir` 确认你在正确的目录，应该能看到 `package.json` 等文件。

---

## 第四步：安装依赖

在终端中运行：

```bash
npm install
```

等待安装完成（可能需要 1-2 分钟）。

看到类似以下信息说明成功：
```
added 400 packages in 35s
```

> ⚠️ 如果看到 `warn` 或 `deprecated` 警告，不用担心，这不影响运行。

---

## 第五步：配置 Supabase 连接

### 5.1 创建环境变量文件

```bash
cp .env.local.example .env.local
```

如果提示文件不存在，手动创建：

```bash
touch .env.local
```

### 5.2 获取 Supabase 配置信息

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 点击左侧菜单 **Settings** → **API**
4. 找到并复制：
   - **Project URL**（类似 `https://xxxxx.supabase.co`）
   - **anon public** key（很长的一串字符，以 `eyJ` 开头）

### 5.3 编辑环境变量文件

#### 方法 A：使用 nano 编辑器（终端内）

```bash
nano .env.local
```

输入以下内容（替换成你自己的值）：

```
NEXT_PUBLIC_SUPABASE_URL=https://你的项目ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon_key
```

保存并退出：
- 按 `Ctrl + O`，然后按 `Enter` 保存
- 按 `Ctrl + X` 退出

#### 方法 B：使用 VS Code（图形界面）

```bash
code .env.local
```

或者直接在文件管理器中找到 `.env.local` 文件，用记事本打开编辑。

### 5.4 示例配置

```
NEXT_PUBLIC_SUPABASE_URL=https://cmfvfdxdniscijvhsrat.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
```

> ⚠️ 注意：等号两边不要有空格！

---

## 第六步：运行项目

```bash
npm run dev
```

看到以下信息说明启动成功：

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
- Ready in 2.3s
```

---

## 第七步：打开浏览器访问

打开浏览器，访问：

**http://localhost:3000**

你应该能看到 PlayerHoods 的首页！

---

## 常见问题解决

### 问题 1：`command not found: npm`

**原因**：Node.js 未安装或未添加到系统路径

**解决**：
1. 去 [Node.js 官网](https://nodejs.org/) 下载安装 LTS 版本
2. 安装时勾选"Add to PATH"
3. 重启终端后重试

### 问题 2：`Module not found: Can't resolve 'geist/font/sans'`

**原因**：缺少字体包（已在 package.json 中包含，不应出现）

**解决**：
```bash
npm install geist
```

### 问题 3：页面显示 "Invalid API key" 或连接错误

**原因**：Supabase 配置不正确

**解决**：
1. 检查 `.env.local` 文件内容是否正确
2. 确保没有多余的空格或换行
3. 确保 URL 和 Key 是从 Supabase Dashboard 复制的最新值

### 问题 4：端口 3000 被占用

**原因**：其他程序正在使用 3000 端口

**解决**：使用其他端口运行
```bash
npm run dev -- -p 3001
```

然后访问 http://localhost:3001

### 问题 5：nano 编辑器中文件显示只读

**解决**：
```bash
rm .env.local
nano .env.local
```
然后重新输入内容保存。

---

## 停止运行

在终端中按 `Ctrl + C` 停止服务器。

---

## 下次启动

以后每次想运行项目，只需要：

```bash
cd ~/Downloads/playerhoods
npm run dev
```

然后打开 http://localhost:3000

---

## 部署到网上（可选）

如果想让别人也能访问，可以部署到 Vercel：

1. 把代码推送到 GitHub
2. 注册 [Vercel](https://vercel.com/)
3. 导入 GitHub 项目
4. 配置环境变量（同 `.env.local` 的内容）
5. 点击部署

---

## 项目结构说明

```
playerhoods/
├── .env.local              # 环境变量配置（需要自己创建）
├── .env.local.example      # 环境变量示例
├── package.json            # 项目依赖配置
├── README.md               # 项目说明
├── docs/
│   └── BLUEPRINT.md        # 系统蓝图
├── src/                    # 源代码目录
│   ├── app/                # 页面文件
│   │   ├── page.tsx        # 首页
│   │   ├── (auth)/         # 登录注册页面
│   │   └── matches/        # 球局相关页面
│   ├── lib/                # 工具库
│   └── types/              # TypeScript 类型定义
└── ...
```
