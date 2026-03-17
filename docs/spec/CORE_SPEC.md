# Agora MVP Core Spec Digest

> 文档性质：[`技术文档.md`](../../技术文档.md) 的执行摘要版。
> 作用：给工程实现提供最小但可执行的约束提炼。
> 优先级：当本文与原始规格冲突时，以 `技术文档.md` 为准。
> 非目标：本文不是替代规格全文的第二真相源，只做施工摘要。

---

## 0. Source Of Truth

唯一工程规格源：

- `技术文档.md`

工程铁律：

- 不得自创字段
- 不得自创状态
- 不得改写 Prompt 正文
- 不得改写计费语义
- 不得替换 SSE 为 WebSocket / polling
- 不得省略测试矩阵
- 遇到规格缺失只能报 gap
- `src/lib/` 不得 import `src/cli/` 或 `src/app/`
- CLI / Web 必须共享同一套 core

---

## 1. Product Boundary

MVP 只做：

- 共识模式（consensus）
- 3 轮讨论
- Secretary 总结
- SSE 11 个事件
- CLI-first 引擎闭环
- Web 最小壳接入

MVP 不做：

- WebSocket
- Redis
- 微服务
- Docker / K8s
- CLI 专属协议 / schema / 状态机 / prompt
- JSONL 作为 canonical state
- `[FUTURE]` 标记能力

---

## 2. Architecture Rules

逻辑分层：

- `src/lib/` = Core 层
- `src/cli/` = CLI renderer
- `src/app/` = Web renderer

分层铁律：

1. 业务逻辑只能写在 `src/lib/`
2. `src/lib/` 不得读取 NextAuth、cookie、session
3. CLI / Web 只消费 core，不得各写一套 orchestration
4. `onEvent(event)` 是 core 的唯一输出通道
5. CLI stdout 只是事件流渲染，不是独立协议

推荐核心目录：

```text
src/lib/
├── orchestrator/
│   ├── consensus.ts
│   ├── session-starter.ts
│   ├── stream-hub.ts
│   ├── anonymizer.ts
│   ├── secretary.ts
│   ├── context-manager.ts
│   ├── execution-lock.ts
│   └── quality-evaluation.ts
├── billing/
├── security/
├── openrouter/
├── prompt/
├── db/
├── types/
└── observability/
```

JSONL 边界：

- 路径：`.agora/sessions/{discussionId}.events.jsonl`
- 仅用于 replay / debug artifact
- 缺失、损坏、不存在均不得影响生产核心流程

---

## 3. Technical Baseline

最终 MVP 技术栈：

- Next.js 15 (App Router)
- TypeScript strict mode
- PostgreSQL (Supabase)
- Drizzle ORM
- NextAuth v5 / Auth.js
- OpenRouter
- SSE
- Zod
- Zustand
- next-intl

Phase A 最小技术栈：

- commander
- chalk
- tsx
- vitest
- PostgreSQL / Drizzle / OpenRouter / Zod
- Phase A 不引入 Next.js / React / Tailwind / shadcn / NextAuth

---

## 4. Billing Canon

术语：

- `raw_cost` = 上游 API 原始成本
- `platform_price` = 用户侧结算价格

铁律：

1. `estimateRawCost()` 只返回 `raw_cost`
2. `raw_cost -> platform_price` 只允许在 `hold()` / `settle()` 内做一次
3. 历史账单必须绑定 `billing_snapshot_id`

账本语义：

- `hold`：冻结余额，影响余额
- `release`：释放未消耗额度，影响余额
- `refund`：异常退款，影响余额
- `settle`：结算确认，不影响余额

---

## 5. State Machine

Discussion 持久状态：

- `created`
- `streaming`
- `summarizing`
- `completed`
- `failed`
- `aborted`

白名单迁移：

- `created -> streaming`
- `created -> aborted`
- `created -> failed`
- `streaming -> streaming`
- `streaming -> summarizing`
- `streaming -> failed`
- `streaming -> aborted`
- `summarizing -> completed`
- `summarizing -> failed`

字段语义：

- `current_round`: 0 / 1 / 2 / 3
- `last_completed_round`: 0 / 1 / 2 / 3 / 4
- `4` 表示 summary 已完成

执行锁：

- 首次有效连接通过 `session-starter` 尝试获取
- 锁获取 = CAS 更新 `conversations.execution_lock_token`，前置条件是 `status='created'`
- 只有成功持锁并真正启动 orchestration 才创建 `discussion_executions` attempt
- 未拿到锁的连接进入 observer / restore 语义
- 恢复连接 / polling / 锁获取失败均不创建新的 execution attempt

---

## 6. Canonical Storage

以 DB 持久化为准：

- `users`
- `conversations`
- `messages`
- `discussion_rounds`
- `discussion_executions`
- `discussion_anonymization_maps`
- `prompt_templates`
- `credit_transactions`
- `billing_snapshots`
- `byok_keys`
- `events`

关键约束：

- 讨论主状态落在 `conversations`
- `conversations.summary` 类型必须是 `DiscussionSummaryFinal`
- `discussion_rounds.compressed_state` 类型必须是 `CompressedRoundState`
- `credit_transactions.conversation_id` 指向 `conversations.id`

---

## 7. Summary Contract

命名铁律：

- `SecretaryRawOutput` = TypeScript interface
- `SecretaryRawOutputSchema` = zod schema
- `DiscussionSummaryFinal` = 最终消费类型

已废弃旧名：

- `SummarySchema`
- `SecretaryRawSchema`

处理管线：

```text
callSecretary()
→ JSON.parse()
→ SecretaryRawOutputSchema.parse()
→ validateSemantics()
→ 系统补 disclaimer + is_degraded
→ DiscussionSummaryFinal
```

`DiscussionSummaryFinal` 必须用于：

- `conversations.summary`
- SSE `summary`
- SSE `restore.summary`
- `GET /api/discussions/:id`

---

## 8. Shared Types

`ActorContext`：

```ts
export interface ActorContext {
  userId: string;
  source: 'cli' | 'web' | 'test';
}
```

冻结类型必须覆盖：

- `SecretaryRawOutput`
- `DiscussionSummaryFinal`
- `ConsensusPoint`
- `DisagreementPoint`
- `CompressedRoundState`
- `ModelFailureRecord`
- 所有 SSE 事件 payload
- `CreateDiscussionRequest`
- `CreateDiscussionResponse`

---

## 9. SSE Event Contract

允许的事件类型：

- `progress`
- `chunk`
- `model_done`
- `model_error`
- `round_done`
- `anonymize`
- `summary`
- `done`
- `restore`
- `error`
- `interrupt_ack`

高层字段要求：

- `progress`：至少含 `round / total_rounds / phase / seq`
- `chunk`：至少含 `logical_model_id / actual_model_id / round / content / done / seq`
- `model_done`：至少含 `logical_model_id / actual_model_id / round / tokens / seq`
- `model_error`：至少含 `logical_model_id / actual_model_id / round / error_type / action / degraded_to / message / seq`
- `round_done`：至少含 `completed_models / skipped_models / failed_models / total_models / seq`
- `anonymize`：至少含 `round / labels / seq`
- `summary`：`DiscussionSummaryFinal + seq`
- `done`：至少含 `total_raw_cost / total_platform_price / seq`
- `restore`：至少含 `resume_mode / can_stream / current_status / current_round / last_completed_round / completed_round_messages / summary`
- `error`：至少含 `code / message`
- `interrupt_ack`：至少含 `status / message / seq`

禁止：

- CLI 私有事件
- 字段名漂移
- 以非结构化终端输出替代事件协议

---

## 10. API Contract

关键 API：

- `POST /api/discussions`
- `GET /api/discussions/:id/stream`
- `GET /api/discussions/:id`
- `POST /api/discussions/:id/interrupt`
- `POST /api/discussions/:id/followup`

核心约束：

- `GET /stream` 必须通过 `session-starter`
- Web route 不得内联重写执行锁和 orchestrator 启动
- 前端状态只能来自 SSE 事件流或 DB 状态

`CreateDiscussionRequest`：

- `topic`
- `models?`
- `mode?`
- `max_rounds?`
- `idempotency_key`

`CreateDiscussionResponse`：

- `id`
- `status`
- `estimated_raw_cost`
- `held_platform_amount`
- `stream_url`

---

## 11. Core Services

### `session-starter.ts`

职责：

- 判断 owner / observer
- 获取执行锁
- 启动 orchestrator
- 统一 CLI / Web 启动路径

### `consensus.ts`

职责：

- 唯一主执行路径
- 状态 CAS 迁移
- 3 轮执行
- `canContinue()`
- Secretary 前后状态切换

### `stream-hub.ts`

职责：

- timeout / TTFT 超时
- `MIN_MODELS_PER_ROUND`
- retry → degraded → skipped
- token / raw cost 统计

### `secretary.ts`

职责：

- `SecretaryRawOutputSchema`
- 语义校验
- strict retry
- degraded fallback

### `context-manager.ts`

职责：

- 产出 `CompressedRoundState`
- 保真验证
- 持久化 `compressed_state`

### `anonymizer.ts`

职责：

- 身份剥离
- signature style 削弱
- 映射持久化到 `discussion_anonymization_maps`

### `security/`

职责：

- 注入 pattern 检测
- `topic_hash` 去重（24h）
- 长度上限
- 风险分级
- plan 日限
- `normalizeTopic()`

---

## 12. Prompt Contract

Prompt 正文来自 `v3.2` 第十四章冻结包，不得改写语义。

关键 prompt：

- Round 1 `independent`
- Round 2 `review`
- Round 3 `rebuttal`
- Secretary `summary`
- Secretary degraded fallback

Prompt seed 约束：

- 写入 `prompt_templates`
- 与冻结包逐字一致
- active prompt 必须唯一命中

---

## 13. Testing Contract

测试矩阵必须覆盖：

- U01-U20
- I01-I12
- E01-E06
- C01-C06
- CLI-E01

Phase A1 最低 Go 条件：

- G01
- G03
- G05
- G06
- G07
- G08
- G09
- G11
- G13
- G14
- G17

Phase A2 最低 Go 条件：

- G01-G19

---

## 14. Execution Note

当前仓库继续施工时，必须把 `CORE_SPEC / BUILD_ORDER / TASKS / code` 全部视为 `v3.2` 的派生物。
如果某处与 `v3.2` 不一致，应修改派生物，而不是反向解释 `v3.2`。
