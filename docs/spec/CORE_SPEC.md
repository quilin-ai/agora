# Agora MVP Core Spec (Execution Digest)

> 文档性质：这是 Agora MVP 的"施工真相源摘要版"。
> 作用：给工程 Agent 提供唯一可执行约束摘要。
> 优先级：当本文与原始规格有冲突时，以 `Agora-MVP-最终工程规格-v3.1` 为准；施工顺序以 `Agora-MVP-技术实施补丁-v3.1a` 为准。
> 非目标：本文不是产品说明书，不重复完整 UI 规格，不替代原始 v3.1 文档。

---

## 0. Source of Truth

### 核心真相源
1. `Agora-MVP-最终工程规格-v3.1`
   - 唯一核心协议源
   - 定义数据库 schema、状态机、SSE 事件、Prompt、计费、测试矩阵

2. `Agora-MVP-技术实施补丁-v3.1a`
   - 只定义施工顺序、CLI-first、Core/Renderer 分层、session-starter 接入规则
   - 不改变最终产品定义和协议语义

### Agent 铁律
- 不得自创字段
- 不得自创状态
- 不得改写 Prompt 正文
- 不得改写计费语义
- 不得替换 SSE 为 WebSocket / polling
- 不得省略测试
- 遇到规格缺失，只能报 gap，不得脑补实现
- 业务逻辑只能落在 `src/lib/`
- CLI 和 Web 必须共享同一套 core 实现

---

## 1. Product Boundary

### MVP 只做
- 共识模式（consensus）
- 3 轮讨论
- Secretary 总结
- SSE 流式事件
- CLI-first 引擎闭环
- Web 最小壳接入

### MVP 不做
- WebSocket
- Redis
- 微服务
- Docker/K8s
- 独立 CLI 产品化
- CLI 专属协议 / schema / prompt / 状态机
- JSONL 作为 canonical state
- `[FUTURE]` 标记的能力

---

## 2. Technical Baseline

- Framework: Next.js 16 (App Router)
- Language: TypeScript 5.9 strict mode
- Runtime: Node.js 22
- DB: PostgreSQL (Supabase)
- ORM: Drizzle ORM 0.45
- Auth: NextAuth v5 / Auth.js
- Gateway: OpenRouter
- Streaming: SSE
- Validation: Zod 4
- State: Zustand 5
- Lint: ESLint 10 + typescript-eslint
- Test: Vitest 4
- Package Manager: pnpm 9
- Deploy: Vercel + Supabase

### 不采用
- WebSocket
- Redis
- 独立后端
- 微服务拆分
- Docker/K8s

---

## 3. Core Architecture Rules

### 逻辑分层
- `src/lib/` = Core 层，CLI / Web 共用
- `src/cli/` = CLI renderer
- `src/app/` = Web renderer / route / page

### 分层铁律
1. `src/lib/` 不得 import `src/cli/` 或 `src/app/`
2. `src/cli/` 和 `src/app/` 可以 import `src/lib/`
3. 业务逻辑只能写在 `src/lib/`
4. CLI / Web 不共享 renderer 代码，只共享 core
5. 任何同时被 CLI 和 Web 使用的逻辑必须放到 `src/lib/`

### 推荐目录
```text
src/
├── lib/
│   ├── orchestrator/
│   │   ├── consensus.ts
│   │   ├── session-starter.ts
│   │   ├── stream-hub.ts
│   │   ├── anonymizer.ts
│   │   ├── secretary.ts
│   │   ├── context-manager.ts
│   │   ├── execution-lock.ts
│   │   └── quality-evaluation.ts
│   ├── billing/
│   ├── security/
│   ├── openrouter/
│   ├── prompt/
│   ├── db/
│   ├── types/
│   └── observability/
├── cli/
│   ├── index.ts
│   ├── commands/
│   ├── display.ts
│   └── event-logger.ts
└── app/
```

---

## 4. Actor Context Rule

Core workflow 不得在内部读取当前用户，不得直接依赖 NextAuth、cookie、session。

### 标准类型

```ts
export interface ActorContext {
  userId: string;
  source: 'cli' | 'web' | 'test';
}
```

### 使用方式

* CLI: `{ userId: process.env.CLI_TEST_USER_ID!, source: 'cli' }`
* Web: `{ userId: session.user.id, source: 'web' }`
* Test: `{ userId: 'test-user-id', source: 'test' }`

---

## 5. Discussion Lifecycle

### Discussion 持久状态

* `created`
* `streaming`
* `summarizing`
* `completed`（终态）
* `failed`（终态）
* `aborted`（终态）

### 白名单迁移

* `created -> streaming`
* `created -> aborted`
* `created -> failed`
* `streaming -> streaming`
* `streaming -> summarizing`
* `streaming -> failed`
* `streaming -> aborted`
* `summarizing -> completed`
* `summarizing -> failed`

### 终态保护

* `completed / failed / aborted` 不允许迁移到任何新状态

### CAS 原则

所有状态更新必须基于白名单做 CAS，禁止覆盖终态。

### 字段语义

* `current_round`: 正在执行 / 即将进入的轮次（0/1/2/3）
* `last_completed_round`: 已成功持久化的最后轮次（0/1/2/3/4）
* `4` 表示 summary 完成

---

## 6. Billing Canon

### 术语

* `raw_cost` = 上游 API 原始成本
* `platform_price` = 用户侧结算价格

### 唯一口径

* `estimateRawCost()` 只返回 `raw_cost`
* `raw_cost -> platform_price` 只允许在 `hold()` / `settle()` 内做一次
* DB 中 `*_raw` 存原始成本，`*_platform` 存用户结算价
* 历史账单必须绑定 `billing_snapshot_id`

### 账本语义

* `hold`: 冻结余额，影响余额
* `release`: 释放未消耗额度，影响余额
* `refund`: 异常退款，影响余额
* `settle`: 结算确认，**不影响余额**

### 退款规则

* `failed`: 已消耗部分结算，未消耗退款
* `aborted` 未开始：全额退款
* `aborted` 已开始：按已消耗结算，未消耗退款

> 注：CLI A1 阶段不做 OAuth，也不做真实 hold/settle 路径接入，但不得改变计费语义定义。

---

## 7. Canonical Storage

### Canonical state

以下数据以 DB 持久化为准：

* `conversations`
* `messages`
* `discussion_rounds`
* `discussion_executions`
* `discussion_anonymization_maps`
* `credit_transactions`
* 其他 v3.1 规定表

### JSONL 定位

JSONL 只是 CLI 阶段的 replay / debug artifact，不是 canonical state。
缺失、损坏或不存在，不得影响生产核心流程。

---

## 8. SSE Event Contract

### CLI / Web / Test 共用同一事件协议

允许的事件类型：

* `progress`
* `chunk`
* `model_done`
* `model_error`
* `round_done`
* `anonymize`
* `summary`
* `done`
* `restore`
* `error`
* `interrupt_ack`

### 约束

* 不得新增 CLI 专属事件
* 不得更改字段名
* 不得让 CLI 直接输出不可结构化核心信息代替事件流
* replay / 测试 / Web SSE 必须消费同一 schema

### CLI 渲染建议

* `progress` -> `[Round N/3] 阶段名...`
* `chunk` -> 实时追加文本
* `model_done` -> 完成提示 + token
* `model_error` -> timeout / retry / fallback
* `round_done` -> 轮次完成提示
* `anonymize` -> 匿名互评开始
* `summary` -> 渲染结构化总结
* `done` -> 显示 raw / platform cost
* `restore` -> 恢复提示
* `error` -> 错误提示

---

## 9. Orchestrator Rules

### 唯一主流程

`src/lib/orchestrator/consensus.ts` 中的 `runConsensusDiscussion()` 是 MVP 唯一主执行路径。

### 主流程职责

1. `created -> streaming`
2. Round 1 独立回答
3. Round 2 匿名互评
4. 上下文压缩与保真验证
5. Round 3 反驳修正
6. `streaming -> summarizing`
7. Secretary 总结
8. `summarizing -> completed`
9. 失败时进入 `failed` 并收尾

### 容错原则

* 支持模型 timeout / skip
* 必须遵守最小参与模型数门槛
* 必须遵守 TTFT / 轮次超时 / 降级语义
* 不允许因为单模型失败就让整局无脑崩塌

---

## 10. Session Starter Rule

### 统一启动路径

CLI 和 Web 都不得直接调用 `runConsensusDiscussion()`。
统一入口为：

```ts
startOrAttachDiscussion(params: {
  actor: ActorContext;
  discussionId: string;
  onEvent: (event: SSEEvent) => void;
})
```

### 角色语义

* `owner`: 当前连接成功拿到执行锁，负责启动 orchestrator
* `observer`: 未拿到锁 / 已在执行 / 已终态，只做 restore / 观察

### handleFatalError 职责

* CAS 迁移 discussion 到 `failed`
* 写入 `failed_at / error_code / error_message`
* 释放执行锁
* 执行账务收尾
* 记录 `discussion_executions` 终态

---

## 11. Prompt Contract

### Prompt 是冻结资产

* Prompt 正文来自 v3.1 冻结包
* 不得擅自改写措辞
* 不得新增"更聪明一点"的临时 prompt
* Prompt seed 必须逐字一致写入 `prompt_templates`

### 关键角色

* participant / independent
* participant / review
* participant / rebuttal
* secretary / summary

### Secretary 输出约束

Secretary 必须输出结构化 JSON，遵守固定 schema：

* `consensus`
* `disagreements`
* `recommendation`
* `confidence`
* `open_questions`
* `decision_boundary?`
* `evidence_refs`

禁止额外 markdown 或说明文字。

---

## 12. DB Freeze Scope

以下为冻结范围，工程实现不得自行扩张语义：

* 11 张表 schema
* conversation / message / round / execution / billing 类型集合
* `DiscussionSummaryFinal`
* `SecretaryRawOutput` 及 schema 命名体系
* `CreateDiscussionRequest / Response`
* SSE 类型定义

如果实现中发现必须新增字段、枚举、索引、状态、事件：

1. 停止实现
2. 记录 gap
3. 等人工确认

---

## 13. Testing Contract

### 测试不是装饰品

必须实现并跑通 v3.1 / v3.1a 要求的测试矩阵：

* Unit
* Integration
* E2E
* Chaos / consistency

### 当前阶段最低要求

* A1 通过阶段性 Go/No-Go
* A2 通过 CLI 全面测试
* Web 阶段通过 SSE 恢复与最小页面联调

禁止在核心路径保留 TODO 代替测试。

---

## 14. Phase Constraint Summary

### A1

* 目标：最小引擎闭环
* 不做：认证、完整计费接入、完整 Web 页面

### A2

* 目标：工程化加固
* 补齐：chat / upgrade / replay / export / followup / 测试

### B

* 目标：Web 最小壳
* 重点：route + SSE 接入 + 详情页最小可用

### C

* 目标：产品化完善
* 补全：Landing / Explore / Billing / Admin / 国际化 / 剩余 E2E

---

## 15. Agent Output Rules

每个任务执行后，Agent 必须输出：

1. 任务理解
2. 修改文件列表
3. 实现摘要
4. 验收结果
5. 风险点 / gap
6. 测试结果

### 禁止输出

* "我顺手一起把别的也优化了"
* "这里我觉得更合理所以改了协议"
* "这个字段原文没写，但我补了一个"
* "测试先跳过，后面再补"

工程不是许愿池。
