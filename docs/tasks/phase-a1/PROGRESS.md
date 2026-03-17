# Phase A1 Progress

## Summary

Phase A1 对应 [`技术文档.md`](../../../技术文档.md) 第二十二章的“最小引擎闭环验证”。

这一阶段的目标不是补 UI，也不是做 Web 壳，而是用最少代码跑通单模型问答和环境默认模型议会讨论的核心链路，验证引擎、状态机、SSE 事件和持久化语义。

## Goals

- 跑通 `agora ask`
- 跑通 `agora council run`
- 验证环境白名单和默认模型选择
- 完成 3 轮讨论、匿名互评、Secretary 总结
- 验证状态机、执行锁、恢复语义、JSONL 事件日志和 DB 持久化

## Deliverables

- `agora ask` 可运行
- `agora council run` 可运行（test 环境默认 3 个参与模型）
- Phase A1 所需核心模块落地：schema、OpenRouter、安全层、orchestrator、stream-hub、anonymizer、secretary、context-manager、session-starter、CLI 骨架
- `Task-A1-E2E` 验收通过

## In Scope

- DB schema + migrations + seed data
- OpenRouter 适配层
- 安全层基础版
- 共识编排主流程
- StreamHub 容错基础能力
- 匿名化
- Secretary 总结
- ContextManager
- session-starter
- CLI 骨架 + event-logger

## Out Of Scope

- 计费完整闭环
- chat / upgrade / replay / export / followup
- Web renderer
- 产品化页面和后台

## Current Status

- 阶段状态：`In Progress`
- 当前基线：`全部内容已按 技术文档.md 重对齐`
- 最新进展：`基线对齐改动已提交并推送（commit: 66aa19b）`
- 当前重点：`Task-001 / Task-001a 已完成，开始推进 Task-002`
- 下一步：`复核数据库 schema、索引、约束和 seed 相关最小交付是否达到 Task-002 验收线`

## Task Progress

- [x] Task-001
- [x] Task-001a
- [ ] Task-002
- [ ] Task-004
- [ ] Task-005
- [ ] Task-008
- [ ] Task-009
- [ ] Task-010
- [ ] Task-011
- [ ] Task-012
- [ ] Task-014
- [ ] Task-002a
- [ ] Task-A1-E2E

## Task Documents

- [`TASK-001.md`](./TASK-001.md)
- [`TASK-001a.md`](./TASK-001a.md)
- [`TASK-002.md`](./TASK-002.md)
- [`TASK-004.md`](./TASK-004.md)
- [`TASK-005.md`](./TASK-005.md)
- [`TASK-008.md`](./TASK-008.md)
- [`TASK-009.md`](./TASK-009.md)
- [`TASK-010.md`](./TASK-010.md)
- [`TASK-011.md`](./TASK-011.md)
- [`TASK-012.md`](./TASK-012.md)
- [`TASK-014.md`](./TASK-014.md)
- [`TASK-002a.md`](./TASK-002a.md)
- [`TASK-A1-E2E.md`](./TASK-A1-E2E.md)
