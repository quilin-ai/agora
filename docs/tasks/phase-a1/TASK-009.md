# Task-009 — StreamHub 容错

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 真相源：`技术文档.md` 第十二章、第二十二章
> 目标：实现 `v3.2` 规定的并发流、TTFT、retry、degraded、skipped 容错链路。

---

## 1. Goal

完成 `executeRound → streamWithRetry → streamSingle` 容错管线。

### 必须覆盖

- `MODEL_TIMEOUT_MS`
- `MODEL_TTFT_TIMEOUT_MS`
- `MIN_MODELS_PER_ROUND`
- `MAX_RETRIES_PER_MODEL`
- `RETRY_WITH_DEGRADED`

---

## 2. Scope

必须完成：

- `src/lib/orchestrator/stream-hub.ts`
- timeout / TTFT
- retry → degraded → skipped
- token / raw cost 统计
- 对应集成测试 I01 / I02 / I03 / I11 / I12

---

## 3. Acceptance Criteria

1. 容错路径完整
2. 单模型失败不致整局崩溃
3. 低于 `MIN_MODELS_PER_ROUND` 时整轮失败
4. 事件发射与 `v3.2` 对齐

---

## 4. Stop Conditions

- 需要新增事件字段才能表达 retry / degraded / skipped

---

## 5. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 实现范围：
  - `src/lib/orchestrator/stream-hub.ts`
  - `src/lib/orchestrator/consensus.ts`
  - `src/lib/openrouter/client.ts`
  - `tests/unit/orchestrator/stream-hub.test.ts`
  - `tests/unit/orchestrator/consensus.test.ts`
  - `tests/unit/openrouter/client.test.ts`

## 6. Delivered

- 已实现 `executeRound -> streamWithRetry -> streamSingle`
- 已接入 `MODEL_TIMEOUT_MS` 与 `MODEL_TTFT_TIMEOUT_MS`
- 已实现 `retrying -> degraded -> skipped` 事件语义
- 已修正 `round_done.skipped_models` 仅包含最终 skipped 的逻辑模型
- 已将 round token / raw_cost 写入 `discussion_rounds`
- 已将 `conversations.total_raw_cost` / `total_input_tokens` / `total_output_tokens` 做聚合更新

## 7. Verification

- `./run.sh test pnpm test tests/unit/orchestrator/stream-hub.test.ts tests/unit/orchestrator/consensus.test.ts tests/unit/openrouter/client.test.ts`
- `./run.sh test pnpm test`
- `./run.sh test pnpm typecheck`
- `./run.sh test pnpm lint`
