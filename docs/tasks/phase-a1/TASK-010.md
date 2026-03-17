# Task-010 — 匿名化

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002
> 真相源：`技术文档.md` 第十二章、第二十二章
> 目标：实现匿名互评所需的身份剥离、signature style 削弱和映射持久化。

---

## 1. Goal

完成匿名化模块。

### 完成后应具备的能力

- 剥离身份自报
- 生成匿名标签
- 落库到 `discussion_anonymization_maps`
- 前端和事件流不暴露映射关系

---

## 2. Scope

必须完成：

- `src/lib/orchestrator/anonymizer.ts`
- `IDENTITY_PATTERNS`
- 映射持久化
- 对应单测 U10 / U11

---

## 3. Acceptance Criteria

1. 模型真实身份不会进入匿名互评上下文
2. 映射能持久化
3. 匿名标签稳定可用

---

## 4. Stop Conditions

- 需要 reveal 机制才能完成 MVP
