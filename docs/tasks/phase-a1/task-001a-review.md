# Task-001a Review

## Reviewed Task

Task-001a — CLI 骨架 + event-logger

## Verdict

pass

## Blocking Gaps

None

## Suggested Fixes

None — 以下为非阻塞观察，不影响验收。

1. **event-logger 事件类型白名单是手写 Set**（`src/cli/event-logger.ts:7-19`）：与 `SSEEventType` 类型定义分离维护。后续 Task-005 的 `sseEventTypeSchema` Zod enum 可替代。当前不阻塞。

2. **`agora ask` 和 `agora council run` 仍为占位命令**：Task-001a scope 明确"不接真实 orchestrator"，占位命令符合任务定义。真实链路接入由后续 Task 负责。

## Evidence

### 1. CLI 入口

- `src/cli/index.ts` 使用 commander，导出 `createProgram()`
- `isCliEntrypoint()` 保护避免测试 import 触发 `process.exit`
- `agora --help` 输出正常：显示 `ask` 和 `council` 命令

### 2. 命令注册结构

- `src/cli/commands/ask.ts` — `registerAskCommand()`：`agora ask -q <question> [-m <model>]`
- `src/cli/commands/council-run.ts` — `registerCouncilCommands()`：`agora council run -t <topic> [-m <models...>]`
- 命令结构与 `技术文档.md` §21.2 CLI 命令清单对齐（`agora ask` / `agora council run`）

### 3. Event Logger

- `src/cli/event-logger.ts`：`createEventLogger({ discussionId, baseDir? })`
- JSONL 路径：`{baseDir}/{discussionId}.events.jsonl`，默认 `.agora/sessions/`
- 与 `技术文档.md` §2.6 JSONL 路径规范一致
- 追加模式写入（`appendFile`）
- 自动创建父目录（`mkdir recursive`）
- 事件类型白名单校验：11 种 SSE 事件
- discussionId 安全校验：空值 + 路径穿越

### 4. 测试覆盖

- `tests/unit/cli/index.test.ts`（3 tests）：root 命令元数据、ask/council 注册、council run 嵌套
- `tests/unit/cli/event-logger.test.ts`（7 tests）：JSONL 写入路径、追加不覆盖、非法类型拒绝、空 id 拒绝、路径穿越拒绝、11 种类型全部接受、深层目录自动创建

### 5. 验收项逐条

| # | 验收项 | 结论 |
|---|--------|------|
| 1 | `agora --help` 正常 | pass |
| 2 | JSONL 写入路径正确 | pass |
| 3 | 重复写入是追加不覆盖 | pass（测试验证） |
| 4 | 非法 event.type 被拒绝 | pass（测试验证） |
| 5 | lint / typecheck / test 通过 | pass |

## Deep Review Update - 2026-03-17

以下为 subagent deep review 发现的 non-blocking 项，verdict 保持 **pass** 不变，标记为 A2 改进项。

- **勘误**：review §Suggested Fixes 第 2 条称 `agora ask` 和 `agora council run` 为"占位命令"，但实际代码已包含真实业务逻辑（OpenRouter 调用、DB 操作、session-starter），这些属于后续 Task 的交付物
