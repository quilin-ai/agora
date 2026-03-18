# LACP v0.1

## Name

Local Agent Collaboration Protocol

## Purpose

为多个本地 coding agent 提供一套简单、可审计、可冷启动恢复、跨 agent 通用的协作协议。

## Scope

适用场景：

- 多个本地 CLI coding agent 共享同一工作目录
- 人类希望完整看到 agent 沟通过程
- 需要支持多轮 propose / review / fix / verify / close

不解决：

- 网络化 agent discovery
- 跨主机 transport
- 厂商私有会话同步

## Core Design

### Folder = One Collaboration

```text
agent_collab/
  YYYY-MM-DD-<slug>/
    topic.md
    log.md
    state.json
    .lock
    result.md
    artifacts/
```

### Required Files

- `topic.md`
  - 任务目标、硬约束、范围边界
- `log.md`
  - append-only 审计日志
- `state.json`
  - 当前状态缓存
- `.lock`
  - 共享写操作互斥锁
- `result.md`
  - 当前结论 / 最终结论

## Source of Truth

`log.md` 是唯一最高真相源。

规则：

- 所有真实通信、handoff、状态变更声明、失败、恢复动作，必须先进入 `log.md`
- `state.json` 不是独立真相源，只是从 `log.md` 派生出的当前状态缓存
- 当 `state.json` 与 `log.md` 冲突时，必须以 `log.md` 为准
- `result.md` 是当前结论文档，不参与真相裁定

## File Semantics

### `topic.md`

读取优先级最高的人类说明文件。

至少包含：

- title
- goals
- hard requirements
- current constraints
- scope

### `log.md`

唯一审计流。

强约束：

- append-only
- 每条真实消息单独一条 entry
- 必须包含 raw message
- 任何状态变更必须先落日志，再更新 `state.json`
- 必须按时间和编号单调追加，禁止把新 entry 插入到旧 entry 上方

推荐 entry 结构：

```md
## Entry N

- timestamp: `YYYY-MM-DD HH:MM:SS`
- from: `agent-or-human`
- to: `agent-or-human`
- kind: `request|pickup|response|handoff|status_update|error|decision|closeout`
- phase: `initiate|review|fix|verify|close`
- state_ref: `state-name`
- summary:
  - short point 1
  - short point 2

<details>
<summary>Raw message</summary>

```md
[verbatim content]
```

</details>
```

### `state.json`

只保存当前状态，不保存历史。

它是缓存，不是权威历史。

最小字段：

```json
{
  "protocol_version": "LACP-v0.1",
  "collaboration_id": "YYYY-MM-DD-slug",
  "title": "string",
  "kind": "discussion|review|implementation|research",
  "status": "initiated|claimed|in_progress|waiting_on_agent|waiting_on_human|in_review|fixing|verifying|completed|aborted|failed",
  "phase": "string",
  "initiator": "string",
  "current_owner": "string",
  "participants": ["string"],
  "next_action": "string",
  "last_log_entry": 0,
  "pending_requests": [],
  "relevant_paths": ["string"],
  "artifacts": ["string"],
  "session_hints": {},
  "updated_at": "YYYY-MM-DD HH:MM:SS"
}
```

`pending_requests` 推荐最小元素结构：

```json
{
  "id": "req-001",
  "to": "claude",
  "entry_ref": 12,
  "status": "pending",
  "requested_at": "2026-03-19 03:10:00",
  "pickup_entry_ref": null,
  "response_entry_ref": null,
  "resolution_mode": null
}
```

允许状态：

- `pending`
- `picked_up`
- `resolved`
- `failed`

### `result.md`

必须可单独阅读。

建议结构：

- status
- current conclusion
- open questions
- final recommendation

### `.lock`

共享写锁文件。

用途：

- 串行化对 `log.md` 和 `state.json` 的写入
- 防止多个 agent 同时做 `read -> modify -> write`

规则：

1. 任何 agent 在修改 `log.md` 或 `state.json` 前，必须先持有 `.lock`
2. 锁必须包含：
   - owner
   - pid 或 session hint
   - acquired_at
   - intended_action
3. 若锁超时，可由后续 agent 按协议写入 `error` entry 后接管
4. 不允许绕过锁直接更新共享状态文件

推荐最小锁内容：

```json
{
  "owner": "codex",
  "session_hint": "optional-session-id",
  "acquired_at": "2026-03-19 01:40:00",
  "intended_action": "append log and update state"
}
```

## State Machine

```text
initiated
  -> claimed
  -> in_progress
  -> waiting_on_agent
  -> waiting_on_human
  -> in_review
  -> fixing
  -> verifying
  -> completed

Any state -> aborted
Any state -> failed
```

典型循环：

```text
in_progress -> in_review -> fixing -> in_review -> verifying -> completed
```

## Async Pickup

协议必须支持异步响应，而不是隐含要求近同步往返。

### Request Rule

当 agent A 请求 agent B 时：

1. 先追加一条 `request` log entry
2. 在 `state.json.pending_requests` 中新增一条请求记录，状态为 `pending`
3. 将 `state.json.status` 置为 `waiting_on_agent`

### Pickup Rule

当目标 agent B 之后才开始处理该请求时：

1. 冷启动读取 `state.json.pending_requests`
2. 找到分配给自己的 `pending` 请求
3. 先追加一条 `pickup` log entry
4. 将对应请求状态更新为 `picked_up`
5. 完成处理后追加 `response` entry
6. 将对应请求状态更新为 `resolved` 或 `failed`

### Why

这样可以避免把调用方的等待预算错误地当作协议预算。

## Capability Modes

协议默认优先使用共享可写工作目录，但不能假设所有本地 agent 都能直接写 `agent_collab/`。

### Direct-write Mode

目标 agent 能直接读写协作目录时，使用标准流程：

1. `request`
2. `pickup`
3. `response`
4. 更新 `pending_requests`

### Proxy-recorded Mode

当目标 agent 可以读取上下文并返回真实消息，但没有权限直接写协作文件时：

1. 请求方仍然正常记录 `request` 并创建 `pending_requests`
2. 如果对方返回消息但没有写 `pickup`，请求方不得伪造 `pickup`
3. 请求方必须先追加一条 `tool_report` 或 `status_update`
4. 该条记录必须明确说明：
   - 响应来自真实外部返回
   - 目标 agent 无法直接写协作文件
   - 当前记录是代理落盘，不是对方自写
5. 然后再追加对方的 `response` entry，`raw message` 必须逐字保留
6. 将对应 `pending_requests` 记录标记为 `resolved`，并写明 `resolution_mode: proxy_recorded`

### Why

这样可以在不伪造对方行为的前提下，兼容只读或受限写权限的本地 agent。

### Embedded-context Mode

当目标 agent 不能可靠读取协作目录时：

1. 请求方仍然先正常记录 `request`
2. 请求中只内联最小必要上下文，而不是假装对方已经读取文件
3. 日志里必须明确说明该请求使用了 `embedded_context`
4. 如果这影响了请求语义或可恢复性，应在 `pending_requests` 中写明 `resolution_mode: embedded_context`

### Why

这样可以兼容无法直接访问本地协作目录的 agent，同时避免伪造“已读文件”的假上下文。

## Capability Preflight

在发起协作前，请求方应尽量先判断目标 agent 的能力，而不是等到失败后再猜。

若本机已经有已验证 agent profile，应先读取该 profile，再决定是否要重新试探。

推荐使用一个机器本地缓存文件，例如：

```text
<skill-root>/profiles/verified-agents.json
```

它的定位是：

- 环境级能力缓存
- 仅用于 preflight 和默认模式选择
- 不属于某次协作的真相源

若 live 协作表现与 profile 冲突，必须以当前这次协作中的真实证据为准，再回写 profile。

至少检查：

1. 是否能读协作目录
2. 是否能写协作目录
3. 是否能加载约定 skill
4. 是否具备本轮任务需要的外部工具能力
5. 是否严格单跳直接回答；如果可能继续调用其他 agent，这些下游调用能否进入同一套审计日志

能力模式最少区分为：

- `direct_write`
- `proxy_recorded`
- `embedded_context`
- `blocked`

优先自动降级。只有在该协作分支完全无法继续时，才要求人类介入。

默认协作策略应为 `single_hop_only`：

- 被请求的目标 agent 直接回答
- 不再继续调用其他 agent

`single_hop_only` 不是能力缺陷，而是默认优先模式。

只有在满足以下条件时，才允许下游多跳协作：

1. 下游 agent 被显式披露
2. 下游 agent 也进入同一个 `agent_collab/` 审计流
3. 下游 request / response 同样逐字落盘

否则应视为隐藏通道风险，不应接受。

## Write Protocol

任何状态变更必须遵循以下顺序：

1. 获取 `.lock`
2. 读取当前 `state.json`
3. 读取 `log.md` 末尾，确认最新 entry 编号
4. 先向 `log.md` 追加新 entry
5. 再更新 `state.json`
6. 写入完成后释放 `.lock`

### Monotonic Append Rule

每次追加前必须确认：

- 新 entry 编号 = 当前末尾编号 + 1
- 新 entry 被写入文件末尾

不允许：

- 在文件上方插入新 entry
- 回填旧编号
- 重排历史 entry

### Atomicity Rule

协议不假设跨文件原子提交。

因此必须采用：

- `log.md` 先写
- `state.json` 后写
- 恢复时始终允许根据 `log.md` 修复 `state.json`

## Operating Rules

1. 所有 agent 间通信必须写入 `log.md`
2. 不允许存在未落盘 side channel
3. 不允许修改既有日志
4. 不允许伪造执行结果或对方回复
5. 不允许把 session continuity 当作唯一上下文
6. 冷启动必须从文件恢复
7. 任何 handoff 必须先写 `log.md`，再更新 `state.json`
8. 所有失败和阻塞必须如实落盘
9. 任何共享写操作必须持有 `.lock`
10. `state.json` 只可作为缓存读取，不得覆盖 `log.md` 已记录事实
11. 所有 `request` 若存在延迟处理可能，必须写入 `pending_requests`
12. 目标 agent 开始处理延迟请求前，必须先写 `pickup` entry
13. `log.md` 必须保持单调追加顺序
14. 若目标 agent 无法写协作文件，不允许伪造其 `pickup`
15. 若响应通过 CLI 或其他可见通道真实返回，允许由请求方代理落盘，但必须明确标注为 `proxy_recorded`
16. 若目标 agent 无法直接读取协作文件，不允许假称其已读取；必须显式使用 `embedded_context`
17. 请求方应优先自动降级并继续协作，只有在该协作腿被环境彻底阻断时才要求用户介入
18. 默认只允许单跳协作；若目标 agent 继续调用其他 agent，必须显式披露并纳入同一套审计日志
19. 若下游 agent 调用无法完整审计，则该协作腿必须视为 `blocked`

## Recovery Order

冷启动 agent 必须按以下顺序恢复上下文：

1. `topic.md`
2. `state.json`
3. `log.md`
4. 校验 `state.json.last_log_entry` 与 `log.md` 实际末尾 entry 是否一致
5. 若不一致，以 `log.md` 为准修复 `state.json`
6. `result.md`
7. `git status`
8. `git diff`
9. 相关源码或产物

### Recovery Rule

若发现以下任一情况：

- `state.json.last_log_entry` 小于日志末尾 entry
- `state.json.status` 与最后一条状态相关日志矛盾
- `pending_requests` 与日志中的 request / pickup / response 状态不一致
- 锁文件残留且已超时

则必须：

1. 在 `log.md` 记录一条 `error` 或 `status_update` entry
2. 以 `log.md` 重建或修正 `state.json`
3. 必要时回收陈旧锁

## Session Continuity

session continuity 可选。

允许：

- 在 `state.json.session_hints` 中记录 `session_id`
- 用于优化后续调用

不允许：

- 把 session id 当作唯一上下文来源
- 因 session 丢失而丢失可恢复性

## Borrowed Concepts

### From A2A

- lifecycle
- identity
- capability declaration
- handoff framing

### From MCP

- tool/resource/progress/failure semantics
- protocol layering

### From Agents SDK

- handoff metadata
- trace-first thinking
- context minimization

## Recommended Skill Packaging

```text
skills/local-agent-collab/
  SKILL.md
  PROTOCOL.md
  templates/
    topic.md
    log.md
    state.json
    result.md
  scripts/
    init-collab.sh
    append-log.py
    update-state.py
```

## Final Rule

If a communication did not land in `log.md`, the protocol must treat it as if it did not happen.
