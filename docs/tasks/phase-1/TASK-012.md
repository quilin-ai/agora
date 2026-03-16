# Task-012 — ContextManager

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第八章、第十二章、第二十二章
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
