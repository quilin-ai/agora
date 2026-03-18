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

- 阶段状态：`Done`
- 启动条件：`Phase A1 验收通过`
- 新增关键议题：`ask / council` 在处理强时效问题时，纯模型闭门回答会出现事实漂移；需要在正式回答前增加“联网背景拉齐（grounding）”步骤
- 当前判断：`grounding` 应作为 Phase A2 CLI 工程化加固的一部分推进，而不是继续依赖模型静态知识
- 最新 CLI 进展：`council run` 已新增 TTY 分区流式面板；每个模型的 chunk 只在自己的固定区域内更新，不再出现跨模型正文互相打断
- 最新编排进展：`council run` 已在 Round 1 -> Round 2、Round 2 -> Round 3 之间插入真正的 `round_summary` 书记员中间总结事件，CLI 会在下一轮开始前输出 checkpoint 与 `next_round`
- 最新匿名评审进展：Round 2 不再把模型自己的 Round 1 回答重新匿名后喂回给它本人；当前改为“每个 reviewer 只看其他选手的匿名首轮回答”，避免自评稀释匿名评论价值

## Current Focus

- 为 `agora ask` 和 `agora council run` 设计统一的联网背景拉齐层
- 目标形态：`search provider -> content extraction -> grounding brief -> answer / council`
- 当前推荐方向：
  - 快速可落地方案：`Tavily`
  - 更高效果上限方案：`Brave Search + Firecrawl`，必要时补 `Exa`
- 最低要求：
  - `ask` 在回答前可拉齐当前事实背景
  - `council` 在 round 1 前给所有参与模型注入同一份背景简报
  - 最终输出保留来源信息，避免“看起来能答但事实错误”

## Task Progress

- [x] Task-007
- [x] Task-A2-chat
- [x] Task-A2-tools
- [x] Task-A2-event
- [x] Task-A2-test
- [x] Task-015-CLI

## Task Documents

- [`TASK-007.md`](./TASK-007.md)
- [`TASK-A2-chat.md`](./TASK-A2-chat.md)
- [`TASK-A2-tools.md`](./TASK-A2-tools.md)
- [`TASK-A2-event.md`](./TASK-A2-event.md)
- [`TASK-A2-test.md`](./TASK-A2-test.md)
- [`TASK-015-CLI.md`](./TASK-015-CLI.md)

## Notes

- `2026-03-18`：新增事实性风险记录。当前 `ask / council` 虽已具备可运行链路，但在战争、政策、新闻、价格等强时效问题上，如果没有联网背景拉齐，回答容易出现错误或过时判断。
- `2026-03-18`：后续实现不应只是“换一个会联网的模型”，而应落成可复用的 grounding 架构，供 CLI / Web 共用。
- `2026-03-18`：TTY 模式下的 `council run` 已改为固定模型面板输出；非 TTY 模式继续保留按模型整段输出，避免并行 chunk 串台。
- `2026-03-18`：新增 `round_summary` 事件契约；当前已验证输出顺序为 `round_done -> round_summary -> next round progress/anonymize`。
- `2026-03-18`：重复 topic 风控已做环境与交互分层：
  - `test` 运行环境默认跳过 topic dedup，便于本地反复调试 CLI
  - 非 `test` 环境下，CLI 不再直接硬拒绝；若发现 24h 内重复 topic，会先提示用户复用历史 discussion、继续新建，或取消
- `2026-03-18`：test 环境默认模型已从 `qwen/qwen3.5-9b` 切走，避免默认 CLI 路径因 qwen 响应偏慢影响交互体验；当前默认 secretary 为 `deepseek/deepseek-chat`，默认 council 为 `deepseek/deepseek-chat,z-ai/glm-4.5-air,moonshotai/kimi-k2`。
- `2026-03-18`：轮间总结模型已从参与讨论模型中拆出，新增 `AGORA_ROUND_SUMMARY_MODEL`。当前 test 环境默认使用 `minimax/minimax-m1` 生成 `round_summary`，避免 checkpoint 直接复用参赛模型带来立场偏向。
- `2026-03-18`：Round 2 匿名评论已改为排除 reviewer 自己的 Round 1 内容。实现层按参与模型逐一生成匿名评审上下文，避免“匿名但仍在评自己”的无效回合。
