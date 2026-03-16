# Task-001 — 项目初始化 + 工程骨架

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：无
> 目标：建立 Next.js 16 + TypeScript strict + Drizzle ORM 的工程骨架，为后续所有任务提供可编译、可 lint、可测试的基础环境。

---

## 0. Why This Task Exists

所有后续任务都依赖一个能跑起来的工程环境。
没有这个地基，任何 schema、类型、orchestrator 都无处落脚。

本任务的职责是且仅是：
- 把技术栈选型落地为可运行的项目配置
- 建立目录结构
- 让 `pnpm lint`、`pnpm typecheck`、`pnpm test` 能跑通（即使还没有业务代码）

---

## 1. Goal

一个最小可编译、可 lint、可测试的 Next.js 16 + TypeScript strict 项目骨架。

### 任务完成后，应具备的能力
- `pnpm install` 成功
- `pnpm lint` 通过
- `pnpm typecheck` 通过
- `pnpm test` 通过（可以是空测试套件）
- 目录结构符合 CORE_SPEC §3 推荐布局
- Drizzle ORM 配置就绪（不含具体 schema）
- 环境变量模板存在

---

## 2. Scope

### 本任务必须实现

- `package.json` — 项目元信息、scripts、dependencies
- `tsconfig.json` — TypeScript strict mode 配置
- `next.config.ts` — Next.js 16 App Router 基础配置
- `drizzle.config.ts` — Drizzle ORM 连接配置（读环境变量）
- `.env.example` — 环境变量模板
- `eslint.config.mjs` — ESLint 配置
- `.gitignore` — 标准忽略规则
- 目录骨架：
  ```text
  src/
  ├── lib/
  │   ├── db/
  │   ├── types/
  │   ├── orchestrator/
  │   ├── billing/
  │   ├── security/
  │   ├── openrouter/
  │   ├── prompt/
  │   └── observability/
  ├── cli/
  │   └── commands/
  ├── app/
  │   └── layout.tsx  (最小 App Router 入口)
  tests/
  ```
- 测试框架配置（Vitest 推荐）
- pnpm scripts：`lint`、`typecheck`、`test`、`dev`、`build`

### 本任务可以顺带做的极小辅助内容
- `.prettierrc` 或等效格式化配置
- `vitest.config.ts`
- 一个占位测试文件确保 `pnpm test` 可执行

### 本任务明确不做
- 不定义 DB schema（Task-002）
- 不定义业务类型（Task-004）
- 不定义 Zod 校验（Task-005）
- 不实现 CLI 入口（Task-001a）
- 不实现任何业务逻辑
- 不配置 OAuth
- 不配置生产部署
- 不运行 `drizzle-kit push` 或任何数据库操作

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §2 Technical Baseline、§3 Core Architecture Rules

---

## 4. Deliverables

### 必交文件
```text
package.json
tsconfig.json
next.config.ts
drizzle.config.ts
.env.example
.gitignore
eslint.config.mjs
vitest.config.ts
src/app/layout.tsx
src/lib/db/index.ts          # Drizzle client 导出（读 env）
tests/setup.ts               # 测试环境 setup（可为空）
```

### 必交目录（可含 .gitkeep）
```text
src/lib/types/
src/lib/orchestrator/
src/lib/billing/
src/lib/security/
src/lib/openrouter/
src/lib/prompt/
src/lib/observability/
src/cli/commands/
```

---

## 5. Functional Requirements

### 5.1 package.json

必须包含：
- `name`: `agora`
- `private`: `true`
- scripts：`dev`、`build`、`start`、`lint`、`typecheck`、`test`
- dependencies：`next`（15.x）、`react`、`react-dom`、`drizzle-orm`、`@auth/core`、`zod`、`zustand`
- devDependencies：`typescript`、`@types/node`、`@types/react`、`eslint`、`vitest`、`drizzle-kit`、`postgres`（驱动）

### 5.2 tsconfig.json

- `strict: true`
- `target`: ES2022 或更高
- `module`: 与 Next.js 16 兼容
- path alias：`@/` -> `src/`

### 5.3 Drizzle 配置

`drizzle.config.ts`：
- `schema`: 指向 `src/lib/db/schema.ts`（文件可暂不存在）
- `dialect`: `postgresql`
- `dbCredentials` 从 `DATABASE_URL` 环境变量读取

`src/lib/db/index.ts`：
- 导出 Drizzle client 实例
- 连接字符串从 `DATABASE_URL` 读取
- 若环境变量缺失，抛出明确错误

### 5.4 .env.example

必须包含（值为占位符）：
```text
DATABASE_URL=postgresql://user:password@localhost:5432/agora
OPENROUTER_API_KEY=your-openrouter-api-key
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### 5.5 App Router 最小入口

`src/app/layout.tsx`：
- 最小合法的 RootLayout
- 不含任何业务组件

### 5.6 测试框架

- Vitest 配置
- `pnpm test` 可运行
- 至少一个占位测试确保框架工作

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- ESLint 通过
- 所有目录创建完整
- 不引入任何业务逻辑
- 不引入 Redis / WebSocket / Docker 相关依赖

---

## 7. Constraints

### 硬约束
- 不得定义 schema 表
- 不得定义业务类型
- 不得实现业务逻辑
- 不得修改 docs
- 不得触碰已有的 docs 文件
- 依赖版本必须与 CORE_SPEC §2 技术选型一致

### 技术选型约束
- Framework: Next.js 16 (App Router)
- Language: TypeScript 5.9 strict
- Runtime: Node.js 22
- DB driver: postgres (for Drizzle)
- ORM: Drizzle ORM 0.45
- Validation: Zod 4
- State: Zustand 5
- Lint: ESLint 10 + typescript-eslint
- Test: Vitest 4
- Package Manager: pnpm 9

---

## 8. Acceptance Criteria

### 必须全部满足

1. `pnpm install` 成功，无报错
2. `pnpm lint` 通过
3. `pnpm typecheck` 通过
4. `pnpm test` 通过
5. 目录结构符合 CORE_SPEC §3 推荐布局
6. `tsconfig.json` 开启 strict mode
7. `.env.example` 包含所有必要环境变量
8. `drizzle.config.ts` 配置正确
9. `src/lib/db/index.ts` 可导出 Drizzle client
10. `src/app/layout.tsx` 是合法的 Next.js App Router 入口

---

## 9. Suggested Validation Commands

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

## 10. Out of Scope Handoffs

本任务完成后：
- `Task-002` 在 `src/lib/db/schema.ts` 中定义 11 张冻结表
- `Task-004` 在 `src/lib/types/` 中定义核心类型
- `Task-005` 在 `src/lib/types/` 中定义 Zod 校验
- `Task-001a` 在 `src/cli/` 中建立 CLI 骨架

---

## 11. Expected Agent Output Format

完成后必须按以下格式汇报：

### 1. Task understanding
用 3-6 句话复述本任务要做什么、不做什么。

### 2. Changed files
列出所有新增 / 修改文件。

### 3. Implementation summary
说明项目配置、目录结构、关键决策。

### 4. Acceptance result
逐条对应 Acceptance Criteria 检查是否通过。

### 5. Risks / gaps
列出仍未覆盖的风险或任何规格缺口。

### 6. Test result
列出实际执行的 lint / typecheck / test 结果。

---

## 12. Stop Conditions

遇到以下情况必须停止实现并报 gap：
- Next.js 16 与指定依赖存在不兼容
- Drizzle ORM 与 postgres 驱动版本冲突
- 技术选型与 CORE_SPEC §2 存在矛盾
