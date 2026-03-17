# Task-001 — 项目初始化

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：无
> 真相源：`技术文档.md` 第二十二章
> 目标：建立与 `技术文档.md` 一致、并采用当前最新稳定版本基线的基础工程，保证后续 Task 可以在正确目录、正确技术栈和正确脚本之上施工。

---

## 1. Goal

完成基础项目初始化，使以下能力可用：

- `npm install` / `pnpm install` 正常
- `npm run dev` / `pnpm dev` 可启动
- Drizzle 可连接 Supabase / PostgreSQL
- 目录结构符合 `v3.2` 的 core / cli / app 分层
- 基础脚本、lint、typecheck、test 可执行

---

## 2. Scope

必须完成：

- 项目脚手架初始化
- TypeScript strict mode
- 最新稳定版本基线（当前：Node 24 LTS / pnpm 10 / Next.js 16）
- `src/lib/`、`src/cli/`、`src/app/` 基础目录
- Drizzle 与数据库连接基础
- 基础脚本：`dev/build/lint/typecheck/test`

本任务不做：

- 不做业务逻辑
- 不做 schema
- 不做 orchestrator
- 不做 CLI 命令功能

---

## 3. Deliverables

```text
package.json
tsconfig.json
eslint config
src/lib/
src/cli/
src/app/
src/lib/db/index.ts
```

---

## 4. Acceptance Criteria

1. 安装依赖无报错
2. 开发服务器可启动
3. Drizzle 可连接数据库
4. 目录结构符合 `v3.2`
5. `pnpm lint` / `pnpm typecheck` / `pnpm test` 可执行

---

## 5. Stop Conditions

- 技术栈版本与 `技术文档.md` 当前最新稳定版本基线冲突
- 无法建立基础数据库连接
