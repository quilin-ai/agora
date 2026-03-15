# Task-008 — Orchestrator 核心编排引擎

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001, Task-002, Task-004, Task-005
> 目标：实现 `runConsensusDiscussion()` 主编排流程，驱动 3 轮讨论 + Secretary 总结的完整引擎。

---

## 0. Why This Task Exists

Orchestrator 是 Agora 的心脏。
它驱动一场 council discussion 从 `created` 走到 `completed`：

1. 启动 → Round 1 独立回答
2. 匿名化 → Round 2 互评
3. 上下文压缩 → Round 3 反驳
4. Secretary 总结 → 完成

没有 orchestrator，CLI 和 Web 都只是空壳。

---

## 1. Goal

在 `src/lib/orchestrator/` 中实现 MVP 唯一主执行路径 `runConsensusDiscussion()`。

### 任务完成后，应具备的能力
- 给定 discussionId 和模型列表，可完整走完 3 轮 + summary
- 状态机按白名单 CAS 迁移
- 每轮通过 OpenRouter 调用参与模型
- Round 2 前执行匿名化
- Round 2/3 间执行上下文压缩
- Secretary 产出结构化 JSON 总结
- 全程通过 `onEvent` 回调发射 SSE 事件
- 错误时正确进入 `failed` 并收尾

---

## 2. Scope

### 本任务必须实现

核心文件：
- `src/lib/orchestrator/consensus.ts` — 主编排流程 `runConsensusDiscussion()`
- `src/lib/orchestrator/stream-hub.ts` — 事件分发中心
- `src/lib/orchestrator/anonymizer.ts` — 匿名化逻辑
- `src/lib/orchestrator/secretary.ts` — Secretary 总结调用 + JSON 解析
- `src/lib/orchestrator/context-manager.ts` — 上下文压缩
- `src/lib/orchestrator/execution-lock.ts` — 执行锁（CAS 获取 / 释放）
- `src/lib/openrouter/client.ts` — OpenRouter API 调用封装

辅助文件：
- `src/lib/orchestrator/state-machine.ts` — 状态迁移白名单 + CAS 更新

### 本任务明确不做
- 不实现 session-starter（Task-002a）
- 不实现 CLI 渲染（Task-001a 已做骨架）
- 不实现 Web route
- 不实现真实计费 hold/settle（但预留回调接口）
- 不实现 quality-evaluation（可在后续补充）
- 不修改 DB schema
- 不新增 SSE 事件类型

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §5 Discussion Lifecycle
- `docs/spec/CORE_SPEC.md` §8 SSE Event Contract
- `docs/spec/CORE_SPEC.md` §9 Orchestrator Rules
- `docs/spec/CORE_SPEC.md` §10 Session Starter Rule（了解接口契约）
- `docs/spec/CORE_SPEC.md` §11 Prompt Contract

---

## 4. Deliverables

### 必交文件
```text
src/lib/orchestrator/consensus.ts
src/lib/orchestrator/stream-hub.ts
src/lib/orchestrator/anonymizer.ts
src/lib/orchestrator/secretary.ts
src/lib/orchestrator/context-manager.ts
src/lib/orchestrator/execution-lock.ts
src/lib/orchestrator/state-machine.ts
src/lib/openrouter/client.ts
```

### 可选文件
```text
src/lib/openrouter/types.ts
src/lib/orchestrator/types.ts
tests/unit/orchestrator/state-machine.test.ts
tests/unit/orchestrator/anonymizer.test.ts
tests/unit/orchestrator/secretary.test.ts
```

---

## 5. Functional Requirements

### 5.1 runConsensusDiscussion()

主函数签名（建议）：

```ts
export async function runConsensusDiscussion(params: {
  discussionId: string;
  actor: ActorContext;
  onEvent: (event: SSEEvent) => void;
}): Promise<void>;
```

执行流程（CORE_SPEC §9）：

1. CAS 迁移 `created -> streaming`，发射 `progress` 事件
2. **Round 1（independent）**：并行调用参与模型，流式接收 chunk，发射 `chunk` / `model_done` / `model_error` 事件
3. 发射 `round_done`
4. **匿名化**：生成匿名标签映射，持久化到 `discussion_anonymization_maps`，发射 `anonymize` 事件
5. **Round 2（review）**：将匿名化后的 Round 1 内容作为上下文，并行调用模型互评
6. 发射 `round_done`
7. **上下文压缩**：对累积内容做压缩（如果超长）
8. **Round 3（rebuttal）**：基于互评结果进行反驳修正
9. 发射 `round_done`
10. CAS 迁移 `streaming -> summarizing`
11. **Secretary 总结**：调用指定模型生成结构化 JSON 总结
12. Zod 校验 Secretary 输出
13. 持久化 summary 到 `discussions.summary`
14. 发射 `summary` 事件
15. CAS 迁移 `summarizing -> completed`
16. 发射 `done` 事件

### 5.2 State Machine

- 严格遵守 CORE_SPEC §5 白名单迁移
- 所有迁移使用 CAS（compare-and-swap）：`UPDATE ... WHERE status = :expected`
- 终态不可迁移
- 迁移失败必须抛出明确错误

```ts
export function validateTransition(from: DiscussionStatus, to: DiscussionStatus): boolean;

export async function casTransition(params: {
  discussionId: string;
  from: DiscussionStatus;
  to: DiscussionStatus;
  updates?: Partial<DiscussionRecord>;
}): Promise<boolean>;
```

### 5.3 Stream Hub

事件分发中心，orchestrator 内部通过 stream-hub 发射事件：

```ts
export function createStreamHub(onEvent: (event: SSEEvent) => void): StreamHub;
```

StreamHub 提供类型安全的事件发射方法，确保只发射 11 种冻结事件。

### 5.4 Anonymizer

- 为每个模型分配匿名标签（"Model A", "Model B", ...）
- 随机打乱映射关系
- 持久化到 `discussion_anonymization_maps` 表
- 在 Round 2 prompt 中用匿名标签替换真实模型名

### 5.5 Secretary

- 调用指定模型（可与参与模型不同）
- Prompt 使用 `secretary / summary` 角色模板
- 输出必须是 JSON
- 必须通过 `secretaryRawOutputSchema` Zod 校验
- 校验失败：最多重试 1 次，仍失败则进入 `failed`

### 5.6 Context Manager

- 在 Round 2 → Round 3 之间压缩上下文
- 如果内容未超长，跳过压缩
- 压缩不得丢失关键论点

### 5.7 Execution Lock

- `acquireLock(discussionId, lockHolder)` — CAS 获取
- `releaseLock(discussionId, lockHolder)` — 释放
- 防止同一 discussion 被重复启动

### 5.8 OpenRouter Client

- 封装 OpenRouter API 调用
- 支持流式（streaming）响应
- 读取 `OPENROUTER_API_KEY` 环境变量
- 处理 timeout / rate limit / 错误响应

### 5.9 容错（CORE_SPEC §9）

- 单模型 timeout / 失败不崩溃整局
- 必须有最小参与模型数门槛（建议 >= 2）
- 模型失败时发射 `model_error` 事件
- 如果存活模型 < 门槛，整局进入 `failed`

### 5.10 错误收尾

任何未恢复的异常必须：
1. CAS 迁移到 `failed`
2. 写入 `failed_at` / `error_code` / `error_message`
3. 释放执行锁
4. 发射 `error` 事件

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- 所有 DB 操作在 `src/lib/` 内
- 不依赖 NextAuth / cookie / session
- 通过 ActorContext 传递身份
- 所有事件通过 onEvent 回调，不直接写 stdout

---

## 7. Constraints

### 硬约束
- `runConsensusDiscussion()` 是唯一主流程（CORE_SPEC §9）
- 不得自创 SSE 事件类型
- 不得自创状态
- 不得跳过匿名化
- 不得跳过 Secretary 校验
- 不得在 orchestrator 中直接读取 NextAuth session
- Prompt 正文来自 `prompt_templates` 表或冻结定义

---

## 8. Acceptance Criteria

### 必须全部满足

1. `runConsensusDiscussion()` 可从 `created` 走到 `completed`
2. 3 轮讨论按 `independent → review → rebuttal` 顺序执行
3. Round 2 前执行匿名化
4. Secretary 输出通过 Zod 校验
5. 状态迁移严格遵守白名单
6. CAS 防止终态被覆盖
7. 执行锁可获取和释放
8. 单模型失败不崩溃整局
9. 异常时正确进入 `failed` 并收尾
10. 全程发射正确的 SSE 事件
11. `pnpm typecheck` 通过
12. `pnpm lint` 通过
13. `pnpm test` 通过（状态机 + anonymizer + secretary 单测）

---

## 9. Suggested Validation Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## 10. Out of Scope Handoffs

本任务完成后：
- `Task-002a` 包装 session-starter 作为统一入口
- `Task-001a` 的 CLI 可通过 session-starter 调用 orchestrator
- `Task-009` ~ `Task-012` 补充具体子模块细节

---

## 11. Expected Agent Output Format

### 1. Task understanding
### 2. Changed files
### 3. Implementation summary
### 4. Acceptance result
### 5. Risks / gaps
### 6. Test result

---

## 12. Stop Conditions

- OpenRouter API 规格不明确
- Prompt 模板正文缺失（v3.1 冻结包未提供）
- 需要新增事件类型或状态才能实现某个流程
- Secretary 输出 schema 与实际 LLM 行为严重不兼容
- 需要修改 DB schema 才能完成持久化

禁止假装问题不存在。
Orchestrator 是心脏，心脏不能带着 TODO 跳动。
