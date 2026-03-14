# Local Development — Supabase CLI

参考：[Supabase CLI Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)（Windows 平台）

---

## 安装 Supabase CLI

### Windows (Scoop)

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### 其他方式

- **npm 开发依赖：** `npm install supabase --save-dev`
- **npx 运行：** `npx supabase --help`（需 Node.js 20+）

---

## 更新 Supabase CLI

当有新版本发布时，使用与安装相同的方式更新：

### Windows (Scoop)

```powershell
scoop update supabase
```

### npm 开发依赖

```sh
npm update supabase --save-dev
```

### 升级前注意事项

若有本地 Supabase 容器在运行，升级前建议先停止并清理数据卷，以便新迁移在干净状态下应用：

```sh
supabase db diff -f my_schema
supabase db dump --local --data-only > supabase/seed.sql
supabase stop --no-backup
```

`--no-backup` 会删除本地数据，请先保存 schema 与数据变更。

---

## 本地运行

```bash
supabase init   # 创建 supabase 目录
supabase start  # 启动本地服务
```

首次启动会下载 Docker 镜像，耗时较长。

---

## 常用连接信息

| 服务 | 默认 URL |
|------|----------|
| API | http://localhost:54321 |
| DB | postgresql://postgres:postgres@localhost:54322/postgres |
| Studio | http://localhost:54323 |
| Mailpit | http://localhost:54324 |
