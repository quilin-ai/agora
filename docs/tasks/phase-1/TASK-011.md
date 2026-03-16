# Task-011 — Secretary 总结

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第七章、第八章、第十二章、第十四章、第二十二章
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
