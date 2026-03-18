# Task-009 Review

## Reviewed Task

Task-009 — StreamHub 容错

## Verdict

pass

## Blocking Gaps

None

## Suggested Fixes

None

## Evidence

### 1. ROUND_RULES 常量对齐

`src/lib/orchestrator/stream-hub.ts:20-26` 定义的 `ROUND_RULES` 与 `技术文档.md` 第十二章（第 1582-1586 行）逐值一致：

| 常量 | 技术文档 | 实现 |
|------|---------|------|
| MODEL_TIMEOUT_MS | 45_000 | 45_000 |
| MODEL_TTFT_TIMEOUT_MS | 15_000 | 15_000 |
| MIN_MODELS_PER_ROUND | 2 | 2 |
| MAX_RETRIES_PER_MODEL | 1 | 1 |
| RETRY_WITH_DEGRADED | true | true |

### 2. 容错管线实现

- `streamWithRetry`（stream-hub.ts:187）：完整实现 retry → degraded → skipped 链路
- `streamSingle`（stream-hub.ts:347）：单次流式调用，接入 MODEL_TIMEOUT_MS 和 MODEL_TTFT_TIMEOUT_MS
- `executeRound` 在 `consensus.ts` 中调用 streamWithRetry 并按 MIN_MODELS_PER_ROUND 判断轮次是否失败

### 3. 事件语义

- `model_error` 事件包含 `error_type`（timeout/rate_limited/server_error/stream_interrupted/output_filtered）和 `action`（retrying/degraded/skipped）
- `round_done` 事件包含 `completed_models`、`skipped_models`、`failed_models`
- `skipped_models` 仅包含最终 skipped 的逻辑模型（TASK-009 §6 明确说明已修正）

### 4. token / cost 统计

- round token 和 raw_cost 写入 `discussion_rounds`
- `conversations.total_raw_cost` / `total_input_tokens` / `total_output_tokens` 做聚合更新

### 5. 测试覆盖

- `tests/unit/orchestrator/stream-hub.test.ts`：4 test cases
- `tests/unit/orchestrator/consensus.test.ts`：3 test cases
- `tests/unit/openrouter/client.test.ts`：5 test cases
- 总计 16 files / 80 tests 全部通过

### 6. 验收项逐条

| # | 验收项 | 结论 |
|---|--------|------|
| 1 | 容错路径完整 | pass — streamWithRetry 实现 retry → degraded → skipped |
| 2 | 单模型失败不致整局崩溃 | pass — Promise.allSettled + 存活模型计数 |
| 3 | 低于 MIN_MODELS_PER_ROUND 时整轮失败 | pass — consensus.ts 检查 responses.length < MIN_MODELS_PER_ROUND |
| 4 | 事件发射与 v3.2 对齐 | pass — model_error / round_done 事件包含规定字段 |

### 7. 补充验证

- `pnpm lint` — pass
- `pnpm typecheck` — pass
- `pnpm test` — 16 files / 80 tests pass
- paid smoke path 已跑通完整 3 轮 + secretary + done（q&a.md evidence）

## Deep Review Update - 2026-03-17

以下为 subagent deep review 发现的 non-blocking 项，verdict 保持 **pass** 不变，标记为 A2 改进项。

- **勘误**：review §6 验收项第 2 条误称 `Promise.allSettled`，实际是 `Promise.all`（安全因为 `streamWithRetry` 不抛异常）
- **补充**：silent retry failure 是设计选择（retry 失败不发事件，直到 degraded/skipped 才发）
