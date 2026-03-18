# External Sources

## Goal

记录这次协议讨论中已确认可借鉴的外部方案与官方资料。

## Findings

### 1. Google A2A

Source:

- https://agent2agent.info/

What it contributes:

- agent discovery / agent card 思路
- standardized interfaces
- task lifecycle management
- status updates / result synchronization

Why it matters:

- A2A 证明“agent-to-agent task + lifecycle + capability discovery”已经有公开标准方向
- 但它更重，更偏跨系统 / 网络化 agent 互联，不完全适合“多个本地 CLI agent 共享工作目录”这个场景

Useful parts to borrow:

- 生命周期和角色声明
- capability / agent identity 概念
- task-oriented 而不是纯 message-oriented 的组织方式

### 2. MCP

Source:

- https://modelcontextprotocol.info/specification/

What it contributes:

- 明确的 messages / lifecycle / transports / logging / progress 等概念
- open protocol，用于 LLM 应用连接工具和外部资源
- 最新稳定版中已出现 experimental tasks support

Why it matters:

- MCP 不是 agent-to-agent 协议，本质更像 agent-to-tool / agent-to-resource
- 但它对“消息、生命周期、日志、任务支持”的抽象值得借鉴

Useful parts to borrow:

- 消息与生命周期分层
- logging / progress / cancellation 这些控制语义
- 协议设计上优先简单、可扩展、可实现

### 3. Claude Code CLI

Source:

- https://code.claude.com/docs/en/cli-reference

What it confirms:

- 支持 `claude -p`
- 支持 `claude -c`
- 支持 `claude -r "<session>"`
- 支持 `--session-id`
- 支持 `--allowedTools`

Why it matters:

- session continuity 可以作为某些 agent 的优化
- 但它是 agent-specific capability，不应成为跨-agent协议的硬依赖

Useful parts to borrow:

- session id / resume 可作为内部优化
- tools allowlist 模式说明 agent 行为能力可以显式约束

### 4. OpenAI Agents SDK / handoffs

Sources:

- https://developers.openai.com/api/docs/guides/agents-sdk
- https://openai.github.io/openai-agents-js/guides/handoffs/

What it contributes:

- handoff 概念
- full trace of what happened
- input filters / metadata / structured handoff payload

Why it matters:

- 它验证了“handoff + trace + structured payload”是成熟模式
- 但这是单 runtime / SDK 内的编排，不是多个独立 CLI agent 通过共享目录协作

Useful parts to borrow:

- handoff metadata
- trace / full history
- input filtering and context minimization

## Current Synthesis

最适合当前场景的结论不是“直接采用某个现成协议”，而是：

- 借 A2A：任务生命周期、角色/能力声明
- 借 MCP：消息 / 生命周期 / logging 抽象
- 借 Agents SDK：handoff / trace / structured payload
- 借 Claude CLI：session continuity 作为可选优化

然后落成一个更轻量的、本地文件系统优先的协议与 skill。
