# Task-001a — CLI 骨架 + event-logger

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001
> 真相源：`技术文档.md` 第二十一、二十二章
> 目标：建立 CLI 骨架和 JSONL 事件日志能力，为 `agora ask` / `agora council run` / replay 打底。

---

## 1. Goal

完成最小 CLI skeleton，并提供 JSONL 事件日志能力。

### 完成后应具备的能力

- `agora --help` 正常
- CLI 已有命令注册结构
- 事件可追加写入 `.agora/sessions/{discussionId}.events.jsonl`
- logger 不改写事件语义

---

## 2. Scope

必须完成：

- `src/cli/index.ts`
- `src/cli/event-logger.ts`
- `src/cli/commands/` 目录骨架
- 至少一个占位命令
- JSONL 写盘逻辑

不做：

- 不接真实 orchestrator
- 不做 replay / export / followup
- 不做 Web

---

## 3. Acceptance Criteria

1. `agora --help` 正常
2. JSONL 写入路径正确
3. 重复写入是追加而不是覆盖
4. 非法 event.type 被拒绝
5. `pnpm lint` / `pnpm typecheck` / `pnpm test` 通过

---

## 4. Stop Conditions

- 需要新增 CLI 专属事件
- 需要把 JSONL 当 canonical state

---

## 5. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 实现范围：
  - `src/cli/index.ts`
  - `src/cli/event-logger.ts`
  - `src/cli/commands/ask.ts`
  - `src/cli/commands/council-run.ts`
  - `tests/unit/cli/index.test.ts`
  - `tests/unit/cli/event-logger.test.ts`

## 6. Delivered

- 已建立 commander CLI 骨架与 `agora --help` 根命令入口
- 已建立 `ask` / `council run` 命令注册结构
- 已建立 `.agora/sessions/{discussionId}.events.jsonl` JSONL 事件日志能力
- 已补齐路径安全校验、事件类型白名单与追加写入语义

## 7. Verification

- `./run.sh test pnpm agora --help`
- `./run.sh test pnpm test tests/unit/cli/index.test.ts tests/unit/cli/event-logger.test.ts`
- `./run.sh test pnpm lint`
- `./run.sh test pnpm typecheck`
