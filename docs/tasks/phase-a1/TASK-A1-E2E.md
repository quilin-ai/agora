# Task-A1-E2E — Phase A1 端到端验证

> 阶段：Phase A1（收尾）
> 优先级：P0
> 前置依赖：Task-001a ~ Task-012, Task-002a
> 真相源：`技术文档.md` 第二十、二十一、二十二章
> 目标：验证 A1 的所有核心模块集成后，`agora council run` 可完整跑通。

---

## 1. Goal

验证以下闭环：

- `agora ask`
- `agora council run`
- 3 轮讨论
- 匿名互评
- Secretary 总结
- JSONL 事件记录
- 不重复启动

---

## 2. Scope

必须验证：

- `session-starter → orchestrator → 3 rounds → secretary → done`
- 状态机迁移
- JSONL 不是 canonical state
- 重复启动保护
- 单模型失败容错

---

## 3. Acceptance Criteria

1. `agora council run` 完整跑通
2. G01 / G03 / G05-G09 / G11 / G13 / G14 / G17 满足
3. Phase A1 无未解决 blocker

---

## 4. Stop Conditions

- 任一 A1 前置 Task 未按 `v3.2` 完成
