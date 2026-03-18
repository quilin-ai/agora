# Task-012 — ContextManager

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 真相源：`技术文档.md` 第八章、第十二章、第二十二章
> 目标：产出并验证 `CompressedRoundState`，为 Round 3 与 Secretary 提供压缩后的高保真上下文。

---

## 1. Goal

完成结构化压缩模块。

### 完成后应具备的能力

- 产出 `CompressedRoundState`
- 验证 `core_stance`
- 验证 `must_answer_in_next_round`
- 持久化 `discussion_rounds.compressed_state`

---

## 2. Scope

必须完成：

- `src/lib/orchestrator/context-manager.ts`
- 压缩逻辑
- 保真验证
- fallback 到 heavier context
- 对应测试 U16 / U17

---

## 3. Acceptance Criteria

1. 能产出合法 `CompressedRoundState`
2. 验证失败时能 fallback
3. 可落库到 `compressed_state`

---

## 4. Stop Conditions

- 压缩后无法满足 `v3.2` 的保真要求

---

## 5. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 实现范围：
  - `src/lib/orchestrator/context-manager.ts`
  - `src/lib/orchestrator/consensus.ts`
  - `src/lib/types/schemas/discussion.schema.ts`
  - `tests/unit/orchestrator/context-manager.test.ts`

## 6. Delivered

- 已实现 `CompressedRoundState` 结构化压缩
- 已实现 round state 合并与 JSON 序列化
- 已把压缩态写入 `discussion_rounds.compressed_state`
- 已把压缩态接入 Round 3 prompt 和 Secretary prompt
- 已实现验证失败时的 heavier fallback

## 7. Verification

- `./run.sh test pnpm test tests/unit/orchestrator/context-manager.test.ts tests/unit/orchestrator/secretary.test.ts tests/unit/orchestrator/consensus.test.ts`
- `./run.sh test pnpm typecheck`
- `./run.sh test pnpm lint`
