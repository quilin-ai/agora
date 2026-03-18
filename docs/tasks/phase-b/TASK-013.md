# Task-013 — SSE 恢复与 Polling

> 阶段：Phase B
> 优先级：P0
> 前置依赖：Task-008
> 真相源：`技术文档.md` 第十章、第十一章、第二十二章
> 目标：实现 Web 侧 `restore + can_stream + polling fallback` 的恢复契约。

---

## 1. Goal

把 A 阶段已经验证过的 core 事件流接到 Web SSE 恢复语义。

### 完成后应具备的能力

- `GET /api/discussions/:id/stream` 建立连接时返回正确的 `restore`
- `can_stream=true` 时继续实时监听
- `can_stream=false` 时切换到 polling fallback
- 已完成消息与 summary 可恢复渲染

---

## 2. Scope

必须完成：

- Web SSE adapter 恢复分流
- `restore` 事件契约
- `can_stream=false` 的前端 polling fallback
- 对应 I05 / E06

不做：

- 不做逐 chunk 重放
- 不做跨实例实时续流
- 不重写 orchestrator

---

## 3. Acceptance Criteria

1. 建连时能根据 discussion 状态返回正确的 `restore`
2. `can_stream=true` 时能继续监听后续流
3. `can_stream=false` 时前端能走 polling 并最终拿到结果
4. 满足 `I05`、`E06`

---

## 4. Stop Conditions

- 需要新增 SSE 协议字段才能完成恢复契约
