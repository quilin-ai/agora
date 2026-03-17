# Agora MVP Build Order

> 文档性质：[`技术文档.md`](../../技术文档.md) 第二十二章的施工顺序摘要。
> 目标：把完整规格压缩成实际执行顺序。
> 优先级：不改变协议，只定义顺序、阶段、验收门槛。

---

## 0. Build Philosophy

为什么不是先做 Web：

- 当前核心风险在引擎，不在 UI
- 先做完整 Web 会被 SSE、恢复态、断线、联调拖住
- CLI 更适合快速验证 prompt、容错、summary 质量

因此采用：

- CLI-first
- event-first
- core first, renderer later

---

## 1. Global Order

```text
Phase A1（最小引擎闭环）:
  Task-001 → Task-002 → Task-004 → Task-005 → Task-001a
  → Task-008 → Task-009 → Task-010 → Task-011 → Task-012 → Task-014
  → Task-002a → Task-A1-E2E

Phase A2（工程化加固与完整 CLI）:
  Task-007 → Task-A2-chat → Task-A2-tools
  → Task-A2-event → Task-A2-test → Task-015-CLI

Phase B（Web 最小壳接入）:
  Task-003 → Task-006 → Task-013 → Task-016-core → Task-015-Web

Phase C（产品化完善）:
  Task-016-rest → Task-017 → Task-018 → Task-019 → Task-020 → Task-021 → Task-022
```

---

## 2. Phase A1

目标：

- 跑通 `agora ask`
- 跑通 `agora council run`
- 3 轮讨论 + 匿名互评 + Secretary 总结
- 事件流写入 JSONL
- DB 持久化正确

范围：

- DB schema + migrations + seed data（11 张表）
- OpenRouter 适配层
- 安全层（基础版）
- Orchestrator 核心
- StreamHub 容错
- Anonymizer
- Secretary
- ContextManager
- session-starter
- CLI skeleton + `agora ask` + `agora council run`
- JSONL 事件日志

不做：

- 计费系统真实接入
- 会话化 chat + upgrade
- replay / export / followup
- 任何前端
- 精致终端交互

Go / No-Go：

- G01 / G03 / G05 / G06 / G07 / G08 / G09 / G11 / G13 / G14 / G17

失败即回退：

- 状态机不稳定
- summary schema 不稳定
- discussion 可重复启动
- CLI / core 逻辑分叉
- JSONL 被误当 canonical state

### Phase A1 Tasks

| Task | 名称 | 前置 | 完成标准 |
|------|------|------|---------|
| Task-001 | 项目初始化 | 无 | 环境、目录、基础脚本、Drizzle 连接就绪 |
| Task-001a | CLI 骨架 + event-logger | Task-001 | `agora --help` 正常 + JSONL 写入可用 |
| Task-002 | 数据模型与 Migrations | Task-001 | 11 张表 + 约束 + seed data 就绪 |
| Task-004 | OpenRouter 适配层 | Task-001 | 单模型流式响应可用 + 常量导出 |
| Task-005 | 安全层 | Task-002 | 注入拦截 + `topic_hash` 去重 + 长度上限 + Plan 日限 + `normalizeTopic()` |
| Task-008 | Orchestrator 核心 | Task-004, Task-005 | 状态 CAS + 执行锁 + 3 轮主流程 + `canContinue()` |
| Task-009 | StreamHub 容错 | Task-004 | timeout / TTFT / retry→degraded→skipped / `MIN_MODELS_PER_ROUND` |
| Task-010 | 匿名化 | Task-002 | 身份剥离 + 映射持久化 |
| Task-011 | Secretary 总结 | Task-004 | zod 校验 + 语义校验 + degraded |
| Task-012 | ContextManager | Task-004 | `CompressedRoundState` 产出 + 保真验证 |
| Task-014 | Prompt Seed | Task-002 | 4 条 prompt 插入成功并与冻结包逐字一致 |
| Task-002a | session-starter 统一启动路径 | Task-002, Task-008 | CLI / Web 共用启动入口 + 不重复启动 |
| Task-A1-E2E | Phase A1 端到端验证 | Task-001a ~ Task-012, Task-002a | `agora council run` 完整跑通 |

---

## 3. Phase A2

目标：

- 补全计费
- 补全 chat / upgrade / replay / export / followup
- 把 CLI 做成稳定施工工具

范围：

- `hold / settle / release / refund`
- `agora chat`
- `agora council upgrade`
- `agora council replay`
- `agora council export`
- `agora council followup`
- U01-U20
- I01-I04 / I06-I12
- C01-C03 / C06

Go / No-Go：

- CLI 全命令链路可用
- 事件字段与 v3.2 SSE 定义逐字段对齐
- G01-G19 满足
- CLI 端到端联调通过

### Phase A2 Tasks

| Task | 名称 | 前置 | 完成标准 |
|------|------|------|---------|
| Task-007 | 计费系统 | Task-002 | `estimateRawCost + hold/settle/release/refund` 正确且幂等 |
| Task-A2-chat | CLI chat + upgrade | Task-A1-E2E, Task-007 | 多轮 chat + `/upgrade` + `parent_id` |
| Task-A2-tools | CLI replay + export + followup | Task-A1-E2E | 三个命令可用 |
| Task-A2-event | 事件契约一致性检查 | Task-A1-E2E | CLI 事件字段与 SSE 定义逐字段对齐 |
| Task-A2-test | CLI 全面测试 | Task-A2-chat, Task-A2-tools | U/I/C 矩阵通过 |
| Task-015-CLI | CLI 端到端联调 | Task-A2-test | CLI 完整链路跑通 + Phase A 测试通过 |

---

## 4. Phase B

目标：

- 把同一套 core 接到 Web
- 跑通 SSE 恢复和最小页面

任务：

- Task-003
- Task-006
- Task-013
- Task-016-core
- Task-015-Web

铁律：

- Web route 不得重写 orchestration
- `GET /api/discussions/:id/stream` 必须调用 `startOrAttachDiscussion()`
- 前端状态只来自 SSE 事件流或 DB 状态
- `can_stream=false` 时走 polling fallback

---

## 5. Phase C

目标：

- 补齐页面、管理后台、国际化、分享、全量测试和部署验收

任务：

- Task-016-rest
- Task-017
- Task-018
- Task-019
- Task-020
- Task-021
- Task-022

---

## 6. Non-Goals By Construction

以下内容不得插队：

- CLI 专属状态机
- CLI 专属 summary schema
- CLI 专属 prompt 体系
- CLI 专属事件定义
- CLI 专属 DB schema
- JSONL 作为 canonical state
- 在 Phase A 提前做 Web renderer
- 在未完成 `Task-015-CLI` 前启动 Phase B
