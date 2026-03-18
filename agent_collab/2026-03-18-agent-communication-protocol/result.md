# Result

## Status

- state: `needs_revision`
- confidence: `medium`
- source_rounds: `2 complete + 1 aborted + external research synthesis + 1 gemini challenge review`

## Current Verdict

不存在一个可以直接拿来覆盖当前场景的成熟现成方案。

最优方案不是硬套 A2A、MCP、Agents SDK handoffs、Oracle Agent Spec 或某个单一厂商会话机制，而是定义一套更轻量的、本地文件系统优先的协议：

- 人类和 agent 共读的目录结构
- append-only 单日志文件
- 最小机器可读状态文件
- git 工作树作为代码事实源
- session continuity 仅作为可选优化

当前讨论收敛出的协议名为：

- 协议名：`LACP`
- 全称：`Local Agent Collaboration Protocol`
- 当前版本标签：`v0.1`

## Gemini Challenge Review

Gemini 的反驳是有效的，不能忽略。它指出当前草案还不够资格直接作为可实现的 `v0.1`，核心原因有三条：

1. 缺少并发控制
2. `log.md` 与 `state.json` 的更新不是原子操作
3. `log.md` 与 `state.json` 的真相源地位仍然不够清晰

这三条都属于基础可靠性问题，不是措辞问题。

## Revised Recommendation

协议方向仍成立，但当前版本应下调为：

- `LACP v0.0-draft`

在补完以下最小修改前，不应宣称为可实现的 `v0.1`：

1. 增加文件锁机制
2. 明确 `log.md` 是唯一最高真相源
3. 明确 `state.json` 只是缓存 / 物化视图
4. 增加启动恢复时的一致性校验流程

## Revision Applied

本轮已根据 Gemini 的有效反驳完成最小必要修正：

1. 增加 `.lock` 机制
2. 明确 `log.md` 是唯一最高真相源
3. 明确所有状态变更必须先写 `log.md` 再写 `state.json`
4. 增加恢复时的一致性检查与修复规则

因此当前协议状态可以上调为：

- `LACP v0.1`

## Post-Rehearsal Revision

在第一次真实 `Codex -> Claude` 演练之后，又补了两类协议级修正：

1. `log.md` 必须严格单调追加
   - 新 entry 只能写在文件末尾
   - 不允许把晚到的 entry 插到旧 entry 上方
2. 协议显式支持异步拾取
   - `state.json` 增加 `pending_requests`
   - 延迟响应方开始处理前，必须先写 `pickup` entry

这两条修正来自真实演练暴露的问题，而不是纸面推演。

## Second Rehearsal Revision

第二次真实演练又暴露出一个更现实的问题：

- 某些本地 agent 可以读取上下文并通过 CLI 返回真实回复
- 但它们不一定具备直接写 `agent_collab/` 的权限

如果协议仍强制要求对方自己写 `pickup`，那记录方就只剩两种坏选择：

1. 伪造一条并不存在的 `pickup`
2. 丢弃一条真实回复

两者都不可接受。

因此当前协议又补上一条最小必要修正：

1. 增加 `direct-write` 与 `proxy-recorded` 两种能力模式
2. 目标 agent 无法写协作文件时，请求方不得伪造 `pickup`
3. 请求方可以代理记录真实回复，但必须显式标注为 `proxy_recorded`

这让协议在受限权限的本地 CLI 环境里仍然保持可审计和不欺骗。

## Best Final Architecture

### 核心四层

1. `topic.md`
   - 说明目标、约束、上下文入口
2. `log.md`
   - 唯一 append-only 沟通审计流
3. `state.json`
   - 最小机器可读状态
4. `result.md`
   - 当前阶段结论与最终结论

补充事实层：

5. `artifacts/`
   - 中间产物、提案、截图、提示词、报告
6. `git working tree / git diff`
   - 代码与文件的真实变更事实

### 关键判断

- `log.md` 是协议核心，不可省略
- `state.json` 在真实任务协作中必须存在
- `result.md` 不是日志，不记录逐条消息，只记录当前权威结论
- session id / resume id 可以记录，但不能成为恢复上下文的必要条件

## Exact Directory Structure

```text
agent_collab/
  PROTOCOL.md
  YYYY-MM-DD-<slug>/
    topic.md
    log.md
    state.json
    result.md
    artifacts/
```

说明：

- `agent_collab/PROTOCOL.md`
  - 未来 skill 安装后应放置或引用的全局协议说明
- `YYYY-MM-DD-<slug>/`
  - 一次讨论或一次真实协作
- `artifacts/`
  - 任意额外产物

## Exact File Responsibilities

### `topic.md`

职责：

- 任务标题
- 目标
- 硬约束
- 已知上下文
- 范围边界
- 当前希望得到的下一步输出

原则：

- 面向人类优先
- 冷启动 agent 第一个必读文件

### `log.md`

职责：

- 记录所有 agent 与人类之间的通信
- 记录所有 handoff
- 记录关键执行声明、失败、拒绝、阻塞、恢复

原则：

- append-only
- 不允许修改既有 entry 内容
- 可以追加更正 entry，但不能回写旧 entry

### `state.json`

职责：

- 为冷启动 agent 提供最小恢复点
- 为工具或脚本提供稳定读取入口
- 反映当前 owner、状态、待办、依赖、最后日志位置

原则：

- 只保留当前状态，不保存完整历史
- 历史只在 `log.md`

### `result.md`

职责：

- 记录当前最佳结论
- 记录最终结论
- 记录 still-open 的问题

原则：

- 随阶段更新
- 最终完成时应自洽，可单独阅读

## Exact Append-Only Log Format

每条消息单独一个 entry，严格按时间顺序追加，不合并 request/response。

推荐格式：

```md
## Entry 12

- timestamp: `2026-03-19 10:30:00`
- from: `codex`
- to: `claude`
- kind: `request`
- phase: `review`
- state_ref: `in_review`
- summary:
  - 请求 claude 对最近修复做复审
  - 指明只看增量变更

<details>
<summary>Raw message</summary>

```md
[完整原文，一字不落]
```

</details>
```

强制字段：

- `timestamp`
- `from`
- `to`
- `kind`
- `phase`
- `state_ref`
- `summary`
- `Raw message`

`kind` 允许值：

- `human_directive`
- `request`
- `response`
- `handoff`
- `status_update`
- `tool_report`
- `error`
- `decision`
- `closeout`

### 日志规则

- 每个真实消息一个 entry
- 每条 entry 必须带简短 summary
- raw message 必须保留原文
- 若消息由命令行调用其他 agent 产生，prompt 原文必须入 log
- 若引用了网页、命令结果、审查结论，也必须在 raw message 中保留足够上下文

## Exact Task/State Format

推荐最小 `state.json`：

```json
{
  "protocol_version": "LACP-v0.1",
  "collaboration_id": "2026-03-18-agent-communication-protocol",
  "title": "Design a local multi-agent collaboration protocol",
  "kind": "discussion",
  "status": "in_progress",
  "phase": "converging",
  "initiator": "codex",
  "current_owner": "codex",
  "participants": ["codex", "claude"],
  "next_action": "Finalize protocol draft",
  "last_log_entry": 4,
  "relevant_paths": [
    "agent_collab/2026-03-18-agent-communication-protocol/topic.md",
    "agent_collab/2026-03-18-agent-communication-protocol/log.md",
    "agent_collab/2026-03-18-agent-communication-protocol/result.md"
  ],
  "artifacts": [
    "agent_collab/2026-03-18-agent-communication-protocol/protocol.md"
  ],
  "session_hints": {
    "codex": null,
    "claude": null
  },
  "updated_at": "2026-03-19 00:00:00"
}
```

### `status` 允许值

- `initiated`
- `claimed`
- `in_progress`
- `waiting_on_agent`
- `waiting_on_human`
- `in_review`
- `fixing`
- `verifying`
- `completed`
- `aborted`
- `failed`

## Exact Workflow / State Machine

### 推荐工作流

1. `initiate`
   - 发起方创建目录与 4 个核心文件
2. `claim`
   - 当前执行 agent 在 `state.json` 标记 owner，并在 `log.md` 留痕
3. `work`
   - 读取 `topic.md`、`state.json`、`result.md`、`log.md`
4. `handoff / request`
   - 对外部 agent 或人类发起请求，先写 `log.md`
5. `response`
   - 收到回复后写 `log.md`，必要时更新 `state.json`
6. `review / fix / verify`
   - 多轮循环
7. `close`
   - `result.md` 定稿，`state.json.status = completed`

### 状态转移

- `initiated -> claimed`
- `claimed -> in_progress`
- `in_progress -> waiting_on_agent`
- `in_progress -> waiting_on_human`
- `in_progress -> in_review`
- `in_review -> fixing`
- `fixing -> in_review`
- `fixing -> verifying`
- `verifying -> fixing`
- `verifying -> completed`
- `* -> aborted`
- `* -> failed`

## Skill Packaging Recommendation

最合适的 skill 形态是“文本协议 + 模板 + 最小辅助脚本”，而不是依赖某个专有 SDK。

推荐结构：

```text
skills/local-agent-collab/
  SKILL.md
  PROTOCOL.md
  templates/
    topic.md
    result.md
    state.json
    log.md
  scripts/
    init-collab.sh
    append-log.py
    update-state.py
```

### 设计原则

- `SKILL.md`
  - 告诉 agent 什么时候必须启用本 skill
- `PROTOCOL.md`
  - 放协议正文
- `templates/`
  - 降低冷启动成本
- `scripts/`
  - 可选，不能成为协议唯一入口

## Rules Every Agent Must Obey

1. 所有 agent 间通信必须写入 `log.md`
2. 不允许隐藏通道
3. 不允许宣称执行了未执行的动作
4. 不允许伪造另一方回复
5. 不允许修改既有日志内容
6. 不允许把 session continuity 当作唯一上下文来源
7. 冷启动时必须先读 `topic.md`、`state.json`、`result.md`、`log.md`
8. 任何 handoff 必须同时更新 `log.md` 和 `state.json`
9. 如因权限、认证、上下文缺失导致失败，必须如实记录到 `log.md`
10. 如果引用外部搜索、网页、命令输出，必须留下可审计来源

## What to Borrow

### 从 A2A 借

- agent identity / capability declaration
- task lifecycle
- handoff 概念

### 从 MCP 借

- 工具 / 资源 / 进度 / 失败 的清晰语义
- 简单、可扩展、可实现的协议分层

### 从 Agents SDK / handoffs 借

- handoff metadata
- trace 思维
- 输入过滤与上下文裁剪

### 从 session continuity 借

- 会话恢复可以作为优化

### 明确不借

- 不借 A2A 的网络重协议和服务化假设
- 不借 MCP 的 transport 作为本协议核心
- 不借 session continuity 作为硬依赖

## Why This Is Better Than Previous Alternatives

相比“只靠 session id”的方案：

- 更稳
- 可冷启动恢复
- 不绑定单一 agent

相比“纯 Markdown 无状态文件”的方案：

- 更易于脚本与工具恢复上下文
- 更容易做状态检查与自动化

相比“每条消息一个日志文件”的方案：

- 更符合用户偏好
- 更容易按单次协作审计
- 文件数量可控

相比“直接套用 A2A / MCP”的方案：

- 更贴近本地 CLI agent 共享工作目录的现实
- 更少实现负担
- 更适合做 skill

## Working Recommendation

当前唯一可继续推进的方案仍然是 LACP，但应先修正为：

- 一个协作 = 一个目录
- 目录内固定包含 `topic.md`、`log.md`、`state.json`、`.lock`、`result.md`
- `log.md` 是唯一 append-only 通信流
- `state.json` 是从日志派生的当前状态缓存
- `result.md` 是当前权威结论
- 任何 session id / resume id 只能作为可选提示
- 在补上锁、一致性校验、恢复规则后，再包装成文本优先的 cross-agent skill

## Current Final Recommendation

经过本轮修订，当前协议可以作为：

- `LACP v0.1`

继续进入 skill 化与真实任务演练阶段。
