# Task-014 — Prompt Seed

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002
> 真相源：`技术文档.md` 第十四章、第二十二章
> 目标：把冻结 Prompt 正文逐字写入 `prompt_templates`，作为 MVP 首版 prompt 资产。

---

## 1. Goal

完成 Prompt Seed 数据写入。

### 必须覆盖

- Round 1 `independent`
- Round 2 `review`
- Round 3 `rebuttal`
- Secretary `summary`
- Secretary degraded fallback

---

## 2. Scope

必须完成：

- Prompt seed data
- `prompt_templates` active 记录
- 与冻结包逐字一致校验

不做：

- 不改写 prompt
- 不做 A/B 管理后台

---

## 3. Acceptance Criteria

1. 4 条主 prompt 可写入并激活
2. 与冻结包逐字一致
3. orchestrator 可通过 prompt store 读取

---

## 4. Stop Conditions

- Prompt 正文与 `v3.2` 原文存在冲突或缺失
