# Topic

## Discussion

为本地多个 coding agent 设计一套通用协作协议。

## Goals

- 让任意本地 coding agent 都能参与协作
- 协议不绑定某一个 agent 作为固定发起方
- 适合多轮协作：
  - propose
  - review
  - fix
  - verify
  - close
- 最终最好能沉淀为一个可安装的 skill

## Hard Requirements

- 所有 agent 间通信必须一字不落落盘
- 所有通信必须对人类可见、可审计
- 不允许隐藏通道
- 不允许隐瞒和欺骗
- 冷启动的 agent 必须能通过读取本地文件恢复上下文

## Current Constraint

- Codex 与 Claude Code 不能直接共享聊天上下文
- 本机存在 `claude` CLI，可作为外部 agent 调用入口
- 共享工作目录可以作为唯一真相源

## Current User Preference

- `agent_collab/` 下应以“一个文件夹 = 一次讨论”组织
- 讨论过程全部记到 `log.md`
- 讨论结论写到 `result.md`
- 若讨论过程中有产物，也放在同一目录下

## Discussion Scope

- 讨论协议本身
- 不讨论代码实现 review
- 不讨论 `docs` / `.env*` / `run.sh`
