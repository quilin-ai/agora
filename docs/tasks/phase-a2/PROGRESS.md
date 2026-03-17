# Phase A2 Progress

## Summary

Phase A2 对应 [`技术文档.md`](../../../技术文档.md) 第二十二章的“工程化加固与完整 CLI”。

这一阶段建立在 A1 的最小闭环之上，目标是补全计费、会话化命令、工具链和完整测试矩阵，让 CLI 达到完整联调标准。

## Goals

- 补全计费系统
- 跑通 chat / upgrade / replay / export / followup
- 完成事件契约一致性校验
- 补齐 U / I / C 测试矩阵
- 通过 `Task-015-CLI`

## Deliverables

- Phase A 所有 CLI 命令可用
- 计费链路符合 `hold / settle / release / refund` 语义
- CLI 与 SSE 事件协议逐字段一致
- Phase A 测试矩阵通过

## In Scope

- Task-007
- Task-A2-chat
- Task-A2-tools
- Task-A2-event
- Task-A2-test
- Task-015-CLI

## Out Of Scope

- Web API 与 SSE route
- 前端页面
- 登录、支付产品化流程

## Current Status

- 阶段状态：`Not Started`
- 启动条件：`Phase A1 验收通过`

## Task Progress

- [ ] Task-007
- [ ] Task-A2-chat
- [ ] Task-A2-tools
- [ ] Task-A2-event
- [ ] Task-A2-test
- [ ] Task-015-CLI

## Task Documents

- [`TASK-007.md`](./TASK-007.md)
- [`TASK-A2-chat.md`](./TASK-A2-chat.md)
- [`TASK-A2-tools.md`](./TASK-A2-tools.md)
- [`TASK-A2-event.md`](./TASK-A2-event.md)
- [`TASK-A2-test.md`](./TASK-A2-test.md)
- [`TASK-015-CLI.md`](./TASK-015-CLI.md)
