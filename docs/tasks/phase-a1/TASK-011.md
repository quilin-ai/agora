# Task-011 — Secretary 总结

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 真相源：`技术文档.md` 第七章、第八章、第十二章、第十四章、第二十二章
> 目标：实现 `SecretaryRawOutputSchema → validateSemantics → DiscussionSummaryFinal` 的唯一总结管线。

---

## 1. Goal

完成 Secretary 总结模块。

### 必须覆盖

- `SecretaryRawOutputSchema`
- 语义校验
- strict retry
- degraded fallback
- `DiscussionSummaryFinal`

---

## 2. Scope

必须完成：

- `src/lib/orchestrator/secretary.ts`
- zod schema
- 语义校验
- degraded summary
- 对应测试 U12 / U13 / U14 / U15

---

## 3. Acceptance Criteria

1. 输出通过 zod 校验
2. 输出通过语义校验
3. 失败时可 degraded
4. 最终类型为 `DiscussionSummaryFinal`

---

## 4. Stop Conditions

- 需要修改冻结 Prompt 或 Summary 契约才能通过

---

## 5. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 实现范围：
  - `src/lib/orchestrator/secretary.ts`
  - `src/lib/types/schemas/secretary.schema.ts`
  - `tests/unit/orchestrator/secretary.test.ts`

## 6. Delivered

- 已实现 `SecretaryRawOutputSchema -> validateSemantics -> DiscussionSummaryFinal` 唯一路径
- 已实现 invalid JSON strict retry
- 已实现语义校验：
  - unknown supporting model
  - unknown disagreement model
  - `confidence=high` 且缺少 evidence
- 已实现 degraded fallback summary

## 7. Verification

- `./run.sh test pnpm test tests/unit/orchestrator/secretary.test.ts tests/unit/orchestrator/context-manager.test.ts tests/unit/orchestrator/consensus.test.ts`
- `./run.sh test pnpm typecheck`
- `./run.sh test pnpm lint`
