# Task-004 — 核心 TypeScript 类型定义

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002
> 目标：定义所有冻结的 TypeScript 业务类型，为 orchestrator、billing、SSE 事件提供类型安全基础。

---

## 0. Why This Task Exists

Agora 的 TypeScript strict mode 要求所有核心数据结构有精确的类型定义。
schema 定义了存储层，但业务层需要独立的类型体系：
- SSE 事件有自己的类型
- API 请求 / 响应有自己的类型
- Secretary 输出有自己的 schema
- ActorContext 是跨层传递的身份抽象

这些类型是冻结资产，不得自创。

---

## 1. Goal

在 `src/lib/types/` 中定义所有 v3.1 冻结的 TypeScript 类型。

### 任务完成后，应具备的能力
- 所有冻结类型可被 `src/lib/` 和 `src/cli/` import
- SSE 事件类型完整覆盖 11 种事件
- ActorContext 类型可用
- Secretary 输出类型精确定义
- API 请求 / 响应类型就绪

---

## 2. Scope

### 本任务必须实现

- `src/lib/types/actor.ts` — ActorContext
- `src/lib/types/discussion.ts` — Discussion 生命周期相关类型
- `src/lib/types/events.ts` — SSE 事件类型（11 种）
- `src/lib/types/billing.ts` — 计费相关类型
- `src/lib/types/api.ts` — CreateDiscussionRequest / Response
- `src/lib/types/secretary.ts` — DiscussionSummaryFinal / SecretaryRawOutput
- `src/lib/types/index.ts` — 统一导出

### 本任务明确不做
- 不定义 Zod 校验（Task-005）
- 不实现业务逻辑
- 不实现 CLI 或 Web 相关类型
- 不修改 DB schema
- 不触碰 `src/cli/` 或 `src/app/`

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §4 Actor Context Rule
- `docs/spec/CORE_SPEC.md` §5 Discussion Lifecycle
- `docs/spec/CORE_SPEC.md` §6 Billing Canon
- `docs/spec/CORE_SPEC.md` §8 SSE Event Contract
- `docs/spec/CORE_SPEC.md` §11 Prompt Contract（Secretary 输出）
- `docs/spec/CORE_SPEC.md` §12 DB Freeze Scope

---

## 4. Deliverables

### 必交文件
```text
src/lib/types/actor.ts
src/lib/types/discussion.ts
src/lib/types/events.ts
src/lib/types/billing.ts
src/lib/types/api.ts
src/lib/types/secretary.ts
src/lib/types/index.ts
```

### 可选文件
```text
src/lib/types/common.ts       # 通用工具类型
tests/unit/types/events.test.ts
```

---

## 5. Functional Requirements

### 5.1 ActorContext（CORE_SPEC §4）

```ts
export interface ActorContext {
  userId: string;
  source: 'cli' | 'web' | 'test';
}
```

### 5.2 Discussion 类型（CORE_SPEC §5）

```ts
export type DiscussionStatus =
  | 'created'
  | 'streaming'
  | 'summarizing'
  | 'completed'
  | 'failed'
  | 'aborted';

export type TerminalStatus = 'completed' | 'failed' | 'aborted';

export type RoundType = 'independent' | 'review' | 'rebuttal';

export type RoundNumber = 1 | 2 | 3;
```

状态迁移白名单类型（供 CAS 使用）：

```ts
export type DiscussionTransition =
  | { from: 'created'; to: 'streaming' }
  | { from: 'created'; to: 'aborted' }
  | { from: 'created'; to: 'failed' }
  | { from: 'streaming'; to: 'streaming' }
  | { from: 'streaming'; to: 'summarizing' }
  | { from: 'streaming'; to: 'failed' }
  | { from: 'streaming'; to: 'aborted' }
  | { from: 'summarizing'; to: 'completed' }
  | { from: 'summarizing'; to: 'failed' };
```

### 5.3 SSE 事件类型（CORE_SPEC §8）

必须定义 11 种事件的 discriminated union：

```ts
export type SSEEventType =
  | 'progress'
  | 'chunk'
  | 'model_done'
  | 'model_error'
  | 'round_done'
  | 'anonymize'
  | 'summary'
  | 'done'
  | 'restore'
  | 'error'
  | 'interrupt_ack';

export type SSEEvent =
  | ProgressEvent
  | ChunkEvent
  | ModelDoneEvent
  | ModelErrorEvent
  | RoundDoneEvent
  | AnonymizeEvent
  | SummaryEvent
  | DoneEvent
  | RestoreEvent
  | ErrorEvent
  | InterruptAckEvent;
```

每种事件必须有 `type` 字段作为 discriminant，以及对应的 `data` payload。

### 5.4 Billing 类型（CORE_SPEC §6）

```ts
export type CreditTransactionType = 'hold' | 'release' | 'refund' | 'settle';

export interface BillingCost {
  raw_cost: number;
  platform_price: number;
}
```

### 5.5 Secretary 输出类型（CORE_SPEC §11）

```ts
export interface SecretaryRawOutput {
  consensus: string;
  disagreements: string[];
  recommendation: string;
  confidence: number;
  open_questions: string[];
  decision_boundary?: string;
  evidence_refs: string[];
}

export interface DiscussionSummaryFinal {
  raw_output: SecretaryRawOutput;
  generated_at: string;
  secretary_model: string;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
```

### 5.6 API 类型（CORE_SPEC §12）

```ts
export interface CreateDiscussionRequest {
  topic: string;
  model_ids: string[];
  conversation_id?: string;
}

export interface CreateDiscussionResponse {
  discussion_id: string;
  conversation_id: string;
  status: DiscussionStatus;
}
```

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- 所有类型使用 `interface` 或 `type`，不使用 `class`
- 所有类型纯粹是类型声明，不包含运行时逻辑
- SSE 事件类型必须是 discriminated union（以 `type` 字段区分）
- 统一从 `src/lib/types/index.ts` 导出

---

## 7. Constraints

### 硬约束
- 不得自创类型字段（CORE_SPEC §12）
- 不得新增 SSE 事件类型（CORE_SPEC §8 允许的 11 种）
- 不得新增状态枚举值
- 不得包含运行时代码
- 不得修改 DB schema
- 不得修改 docs

### Gap 处理
- 如果某个事件的 data payload 在 CORE_SPEC 中定义不完整，用最小合理字段集并标注 `// GAP: payload 结构待确认`
- 如果某个类型在 v3.1 中有更详细定义但 CORE_SPEC 摘要中省略了，以最小定义为准并标注 gap

---

## 8. Acceptance Criteria

### 必须全部满足

1. ActorContext 类型与 CORE_SPEC §4 逐字段一致
2. DiscussionStatus 包含且仅包含 6 个值
3. SSE 事件类型覆盖且仅覆盖 11 种事件
4. SSEEvent 是正确的 discriminated union
5. SecretaryRawOutput 字段与 CORE_SPEC §11 一致
6. DiscussionSummaryFinal 类型完整
7. CreateDiscussionRequest / Response 类型完整
8. BillingCost 区分 raw_cost 和 platform_price
9. `pnpm typecheck` 通过
10. `pnpm lint` 通过
11. 不含运行时代码
12. 不含自创字段

---

## 9. Out of Scope Handoffs

本任务完成后：
- `Task-005` 为这些类型创建 Zod 校验 schema
- `Task-008` 在 orchestrator 中消费这些类型
- `Task-001a` 在 CLI event-logger 中引用 SSEEventType

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

遇到以下情况必须停止实现并报 gap：
- 某个 SSE 事件的 payload 结构完全不可推断
- Secretary 输出 schema 与 CORE_SPEC 存在矛盾
- 需要引入运行时代码才能表达某个类型
- 需要自创字段才能让类型系统自洽
