# Task-A2-chat — CLI chat + upgrade

> 阶段：Phase A2
> 优先级：P0
> 前置依赖：Task-A1-E2E, Task-007
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第二十一、二十二章
> 目标：补齐会话化 chat 和从 chat 升级到 council 的完整 CLI 链路。

---

## 1. Goal

完成：

- `agora chat`
- `/switch`
- `/upgrade`
- `parent_id` 正确关联

---

## 2. Acceptance Criteria

1. 多轮 chat 可用
2. `/switch` 不丢上下文
3. `/upgrade` 可升级为 council
4. 满足 G02 / G04 / G12
