# PlayerHoods

约球神器 - 轻松组织网球局

## 技术栈

- **框架**: Next.js 14 (App Router)
- **样式**: Tailwind CSS
- **后端**: Supabase (Auth + PostgreSQL + RLS)
- **部署**: Vercel

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 为 `.env.local`：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 Supabase 配置：

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

获取这些值：
1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 Settings → API
4. 复制 `Project URL` 和 `anon public` key

### 3. 运行开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

## 项目结构

```
src/
├── app/                    # Next.js App Router 页面
│   ├── (auth)/            # 认证相关页面
│   │   ├── login/         # 登录
│   │   └── signup/        # 注册
│   ├── matches/           # 球局相关页面
│   │   ├── create/        # 创建球局
│   │   └── [id]/          # 球局详情
│   ├── globals.css        # 全局样式
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 首页
├── components/            # 可复用组件
├── lib/                   # 工具库
│   ├── supabase/          # Supabase 客户端配置
│   └── utils.ts           # 工具函数
├── types/                 # TypeScript 类型定义
└── middleware.ts          # Next.js 中间件
```

## 功能模块

### MVP 已实现

- [x] 用户认证（登录/注册）
- [x] 创建球局
- [x] 球局列表
- [x] 球局详情
- [x] 报名/退出
- [x] 组织者审批（确认/移除）
- [x] 取消球局

### 待实现

- [ ] 候补自动排序
- [ ] 编辑球局
- [ ] 通知系统
- [ ] 用户设置页面
- [ ] 性别统计展示

## 部署

### 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 配置环境变量
4. 部署

## License

MIT
