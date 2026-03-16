# Task-A2-event — 事件契约一致性检查

> 阶段：Phase A2
> 优先级：P0
> 前置依赖：Task-A1-E2E
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第十章、第二十章、第二十二章
> 目标：确认 CLI 消费的事件字段与 `v3.2` SSE 定义逐字段一致。

---

## 1. Goal

建立专门的事件一致性验证。

---

## 2. Acceptance Criteria

1. 11 种事件逐字段对齐
2. CLI 无私有 payload 漂移
3. 满足 CLI-E01
