# Task-005 — Zod 校验 Schema

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 目标：为所有冻结的核心类型创建 Zod 运行时校验 schema，确保数据在系统边界处被严格验证。

---

## 0. Why This Task Exists

TypeScript 类型只在编译期存在。
系统边界处的数据（API 请求、LLM 输出、SSE 事件 payload、Secretary JSON）必须有运行时校验。
Zod 是 CORE_SPEC §2 指定的唯一校验库。

---

## 1. Goal

在 `src/lib/types/` 中为所有冻结类型创建对应的 Zod schema。

### 任务完成后，应具备的能力
- 所有 API 输入可通过 Zod parse 校验
- Secretary 输出可通过 Zod parse 校验
- SSE 事件可通过 Zod parse 校验
- Zod schema 与 TypeScript 类型保持一致（推荐使用 `z.infer`）

---

## 2. Scope

### 本任务必须实现

- `src/lib/types/schemas/actor.schema.ts`
- `src/lib/types/schemas/discussion.schema.ts`
- `src/lib/types/schemas/events.schema.ts`
- `src/lib/types/schemas/billing.schema.ts`
- `src/lib/types/schemas/api.schema.ts`
- `src/lib/types/schemas/secretary.schema.ts`
- `src/lib/types/schemas/index.ts` — 统一导出

### 本任务可以顺带做
- 单元测试验证 schema 的 parse / reject 行为

### 本任务明确不做
- 不实现业务逻辑
- 不实现 API route handler
- 不修改已有 TypeScript 类型定义
- 不修改 DB schema
- 不触碰 `src/cli/` 或 `src/app/`

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §4-§8, §11-§12
- `src/lib/types/` 中 Task-004 定义的所有类型

---

## 4. Deliverables

### 必交文件
```text
src/lib/types/schemas/actor.schema.ts
src/lib/types/schemas/discussion.schema.ts
src/lib/types/schemas/events.schema.ts
src/lib/types/schemas/billing.schema.ts
src/lib/types/schemas/api.schema.ts
src/lib/types/schemas/secretary.schema.ts
src/lib/types/schemas/index.ts
```

### 可选文件
```text
tests/unit/types/schemas.test.ts
```

---

## 5. Functional Requirements

### 5.1 基本原则

- 每个 Zod schema 必须与 Task-004 对应的 TypeScript 类型在结构上完全一致
- 推荐使用 `z.infer<typeof schema>` 反向推导类型，或显式校验两者兼容
- 枚举值必须与 CORE_SPEC 冻结定义严格一致

### 5.2 ActorContext schema

```ts
export const actorContextSchema = z.object({
  userId: z.string().min(1),
  source: z.enum(['cli', 'web', 'test']),
});
```

### 5.3 Discussion 相关 schema

- `discussionStatusSchema` — 6 个冻结状态值
- `roundTypeSchema` — `independent | review | rebuttal`
- `roundNumberSchema` — `z.union([z.literal(1), z.literal(2), z.literal(3)])`

### 5.4 SSE 事件 schema

- 每种事件有独立 schema
- 总的 `sseEventSchema` 是 discriminated union（`z.discriminatedUnion('type', [...])`)
- 事件类型必须覆盖且仅覆盖 11 种

### 5.5 Secretary 输出 schema

```ts
export const secretaryRawOutputSchema = z.object({
  consensus: z.string(),
  disagreements: z.array(z.string()),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
  open_questions: z.array(z.string()),
  decision_boundary: z.string().optional(),
  evidence_refs: z.array(z.string()),
});
```

这是最关键的运行时校验之一：Secretary LLM 输出必须通过此 schema 才能被接受。

### 5.6 API 请求 schema

```ts
export const createDiscussionRequestSchema = z.object({
  topic: z.string().min(1),
  model_ids: z.array(z.string()).min(2),
  conversation_id: z.string().uuid().optional(),
});
```

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- Zod schema 与 TypeScript 类型保持一致
- 所有 schema 使用 `.strict()` 或等效方式拒绝多余字段（在系统边界处）
- 统一从 `src/lib/types/schemas/index.ts` 导出

---

## 7. Constraints

### 硬约束
- 不得自创校验规则中不存在于类型定义中的字段
- 不得放宽冻结的枚举值范围
- 不得在 schema 中引入业务逻辑（如数据库查询）
- 不得修改 Task-004 的类型定义
- 不得修改 docs

---

## 8. Acceptance Criteria

### 必须全部满足

1. 所有冻结类型都有对应的 Zod schema
2. SSE 事件 schema 覆盖 11 种事件
3. Secretary 输出 schema 字段与 CORE_SPEC §11 一致
4. `z.infer` 推导的类型与 Task-004 类型兼容
5. 非法输入被正确 reject（测试验证）
6. `pnpm typecheck` 通过
7. `pnpm lint` 通过
8. `pnpm test` 通过

---

## 9. Out of Scope Handoffs

本任务完成后：
- `Task-008` 在 orchestrator 中使用这些 schema 校验 LLM 输出
- `Task-001a` 在 event-logger 中使用事件 schema 校验写入数据

---

## 10. Expected Agent Output Format

### 1. Task understanding
### 2. Changed files
### 3. Implementation summary
### 4. Acceptance result
### 5. Risks / gaps
### 6. Test result

---

## 11. Stop Conditions

- 某个类型的 Zod 表达无法与 TypeScript 类型对齐
- 需要自创字段才能让 schema 自洽
- 发现 Task-004 类型定义与 CORE_SPEC 存在矛盾
