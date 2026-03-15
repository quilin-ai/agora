# Task-002a — Session Starter 统一启动路径

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002, Task-008
> 来源：v3.1a 任务组补丁
> 目标：实现 `startOrAttachDiscussion()` 统一启动入口，确保 CLI 和 Web 通过同一路径进入 orchestrator。

---

## 0. Why This Task Exists

CORE_SPEC §10 明确规定：

> CLI 和 Web 都不得直接调用 `runConsensusDiscussion()`。

原因：
- 需要执行锁防止重复启动
- 需要区分 owner / observer 角色
- 需要处理已终态的 discussion
- 需要统一的错误收尾（handleFatalError）
- CLI 和 Web 必须走同一条路，不能各写一套

---

## 1. Goal

在 `src/lib/orchestrator/session-starter.ts` 中实现统一启动路径。

### 任务完成后，应具备的能力
- CLI 和 Web 通过同一个函数启动或附着到 discussion
- 重复调用同一 discussionId 不会重复启动
- 已终态的 discussion 正确处理（restore 事件）
- 致命错误有统一收尾路径

---

## 2. Scope

### 本任务必须实现

- `src/lib/orchestrator/session-starter.ts`

### 本任务明确不做
- 不修改 `runConsensusDiscussion()`（Task-008 已实现）
- 不实现 CLI 渲染
- 不实现 Web route
- 不实现 OAuth
- 不修改 DB schema
- 不新增事件类型

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §10 Session Starter Rule
- `docs/spec/CORE_SPEC.md` §5 Discussion Lifecycle（终态判断）
- `src/lib/orchestrator/consensus.ts`（Task-008 实现）
- `src/lib/orchestrator/execution-lock.ts`（Task-008 实现）

---

## 4. Deliverables

### 必交文件
```text
src/lib/orchestrator/session-starter.ts
```

### 可选文件
```text
tests/unit/orchestrator/session-starter.test.ts
```

---

## 5. Functional Requirements

### 5.1 startOrAttachDiscussion()

签名（CORE_SPEC §10 冻结）：

```ts
export async function startOrAttachDiscussion(params: {
  actor: ActorContext;
  discussionId: string;
  onEvent: (event: SSEEvent) => void;
}): Promise<void>;
```

### 5.2 执行逻辑

```text
1. 查询 discussion 当前状态
2. if 终态（completed / failed / aborted）:
     → 发射 restore 事件（含已有数据）
     → return
3. 尝试获取执行锁
4. if 获取成功 → role = owner:
     → 调用 runConsensusDiscussion()
     → catch 致命异常 → handleFatalError()
     → finally 释放执行锁
5. if 获取失败 → role = observer:
     → 发射 restore 事件
     → 可附着到现有事件流（如果 stream-hub 支持）
     → 或直接从 DB 读取当前状态并发射 restore
```

### 5.3 角色语义（CORE_SPEC §10）

- **owner**: 当前连接成功拿到执行锁，负责启动 orchestrator
- **observer**: 未拿到锁 / 已在执行 / 已终态，只做 restore / 观察

### 5.4 handleFatalError()

当 owner 遭遇不可恢复的异常时：

1. CAS 迁移 discussion 到 `failed`
2. 写入 `failed_at` / `error_code` / `error_message`
3. 释放执行锁
4. 发射 `error` 事件
5. 记录 `discussion_executions` 终态

### 5.5 重复调用保护

- 同一 discussionId 被多次调用 `startOrAttachDiscussion()`
- 第一个拿到锁的成为 owner
- 后续调用自动降级为 observer
- 不报错，不崩溃

### 5.6 restore 事件

当 observer 或已终态时，发射 `restore` 事件：
- 包含 discussion 当前状态
- 包含已完成的轮次数据
- 包含 summary（如果已完成）

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- 不依赖 NextAuth / cookie
- 通过 ActorContext 传递身份
- 锁操作必须是原子的（CAS）

---

## 7. Constraints

### 硬约束
- CLI 和 Web 共用此唯一入口（不得绕过）
- 不得直接调用 `runConsensusDiscussion()`（只能通过此函数间接调用）
- 不得新增 SSE 事件类型
- 不得新增状态
- 不得修改 orchestrator 主流程

---

## 8. Acceptance Criteria

### 必须全部满足

1. `startOrAttachDiscussion()` 签名与 CORE_SPEC §10 一致
2. owner 成功启动 orchestrator
3. observer 正确收到 restore 事件
4. 已终态 discussion 不会被重新启动
5. 重复调用不崩溃、不重复执行
6. handleFatalError 正确迁移到 `failed` 并收尾
7. 执行锁正确获取和释放
8. `pnpm typecheck` 通过
9. `pnpm lint` 通过
10. `pnpm test` 通过

---

## 9. Out of Scope Handoffs

本任务完成后：
- CLI 的 `council run` 命令通过此入口启动 discussion
- Web 的 `GET /api/discussions/:id/stream` 通过此入口启动或附着
- `Task-A1-E2E` 验证端到端闭环

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

- 执行锁逻辑与 Task-008 实现不兼容
- restore 事件 payload 结构在 CORE_SPEC 中定义不完整
- 需要新增事件或状态
- stream-hub 不支持 observer 附着（记录 gap，不自创机制）
