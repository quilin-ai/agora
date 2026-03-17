# Session Handoff

最后更新时间：2026-03-17

## 1. 唯一真相源

- 产品与工程范围唯一真相源：`技术文档.md`
- Task / Phase 命名与依赖顺序必须对齐 `技术文档.md`
- 版本策略：默认跟随最新稳定版本基线，不主动降级到旧 major

## 2. 当前仓库状态

当前仓库不是干净工作区，存在未提交改动。继续开发前先看 `git status --short`，不要误覆盖。

本轮已经落地但尚未提交的关键改动包括：

- `run.sh`：环境切换脚本，支持 `./run.sh test ...` / `./run.sh prod ...`
- `.env.test.example` / `.env.prod.example`：环境模板
- `.env.example`：补充模型白名单相关变量
- `src/lib/config/models.ts`：统一模型配置读取与校验
- `src/cli/commands/ask.ts`：开始消费模型配置
- `src/cli/commands/council-run.ts`：开始消费模型配置
- `src/lib/db/index.ts`：更新数据库环境变量报错提示
- `tests/unit/config/models.test.ts`：新增模型配置单测
- `技术文档.md`：同步环境白名单与默认模型规则
- `docs/tasks/phase-a1/*.md`：同步任务与进度说明

注意：

- `tsconfig.json` 当前也在未提交改动中，值为 `jsx: "react-jsx"`；这是之前为了避免 Next.js build 自动改写
- `.gitignore` 也有未提交改动，已包含 `.env.test` / `.env.prod` 忽略规则

## 3. 已确认可用的本地基础设施

### 测试环境

本地已存在真实的 `.env.test`，且已验证以下两项可用：

- `DATABASE_URL`：已成功连接 Supabase PostgreSQL，并执行最小查询
- `OPENROUTER_API_KEY`：已成功请求 OpenRouter 模型列表，并成功发起过 `chat/completions` 请求

注意：

- 不要把 `.env.test` 明文提交
- 免费模型存在 `429`、空文本响应、排队等不稳定情况，这是当前测试 key 与免费池的现实限制，不代表 key 无效

### 启动方式

统一使用：

```bash
./run.sh test <command...>
./run.sh prod <command...>
```

示例：

```bash
./run.sh test pnpm agora --help
./run.sh test pnpm agora ask -q "hello"
./run.sh test pnpm agora council run -t "test topic"
./run.sh test pnpm test
```

`run.sh` 会：

- 自动加载 `.env.test` / `.env.prod`
- 如果本机装了 `nvm`，自动切到 `.nvmrc` 指定的 Node 版本

当前基线：

- Node：`24.14.0`
- pnpm：`10.32.1`

## 4. 当前模型配置规则

### 运行时环境变量

统一使用以下变量：

- `AGORA_MODEL_SOURCE`
- `AGORA_ALLOWED_MODELS`
- `AGORA_DEFAULT_COUNCIL_MODELS`
- `AGORA_SECRETARY_MODEL`

当前只支持：

- `AGORA_MODEL_SOURCE=openrouter`

### test 环境默认策略

测试环境当前采用：

- 白名单候选：5 个免费模型
- 默认 council 参与模型：3 个
- secretary：当前默认使用 `AGORA_SECRETARY_MODEL`；若未单独接线，可退化为 `AGORA_DEFAULT_COUNCIL_MODELS[0]`

当前 `.env.test` 约定的模型组合是：

- 白名单：
  - `openai/gpt-oss-120b:free`
  - `qwen/qwen3-next-80b-a3b-instruct:free`
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `nousresearch/hermes-3-llama-3.1-405b:free`
  - `google/gemma-3-27b-it:free`
- 默认 council：
  - `openai/gpt-oss-120b:free`
  - `qwen/qwen3-next-80b-a3b-instruct:free`
  - `meta-llama/llama-3.3-70b-instruct:free`
- 默认 secretary：
  - `openai/gpt-oss-120b:free`

原因：

- 免费档风控上限当前是 3 个参与模型
- 免费模型池波动大，保留 5 个白名单候选比只配 3 个更稳

## 5. 当前代码真实状态

### 已存在的核心模块

`src/lib/` 下已经存在这些核心模块文件：

- `db/schema.ts`
- `openrouter/client.ts`
- `security/risk-control.ts`
- `orchestrator/state-machine.ts`
- `orchestrator/execution-lock.ts`
- `orchestrator/consensus.ts`
- `orchestrator/stream-hub.ts`
- `orchestrator/anonymizer.ts`
- `orchestrator/secretary.ts`
- `orchestrator/context-manager.ts`
- `orchestrator/session-starter.ts`

### 当前阻塞点

虽然上面的 core 文件存在，但 CLI 入口目前仍不是一个真正可用的产品链路：

- `agora ask` 仍是占位命令
- `agora council run` 仍是占位命令
- 这两个命令现在只会正确读取并打印模型配置，还没有接到真实执行主流程

也就是说：

- Core 层已有较多实现
- CLI 入口层仍未把“创建讨论 → session-starter → orchestrator → 事件输出”这条链路真正接起来

## 6. 本轮已验证的行为

已实际验证：

- `./run.sh test pnpm agora ask -q "hello"` 会读取并打印 `AGORA_SECRETARY_MODEL`
- `./run.sh test pnpm agora council run -t "test topic"` 会读取并打印 `AGORA_DEFAULT_COUNCIL_MODELS`
- `pnpm lint` 通过
- `pnpm typecheck` 通过
- `pnpm test` 通过

最新测试结果：

- Test Files：`14 passed`
- Tests：`71 passed`

## 7. 下个会话的优先事项

下个会话不要重新从零分析，直接按这个顺序继续：

1. 先读本文件和 `技术文档.md`
2. 运行 `git status --short`，确认未提交改动
3. 不要改动 docs 之外的真相源规则，继续沿用当前模型白名单配置
4. 继续把 CLI 入口接到真实流程，而不是重复做环境层工作

建议的直接开发目标：

1. 让 `agora council run` 真正创建/加载 discussion，并接入 `session-starter`
2. 把 `onEvent(event)` 接到 CLI renderer / logger
3. 验证 owner / observer 路径
4. 再继续推进 `Task-A1-E2E`

如果需要先选一个最直接的“下一件事”，建议做：

- 把 `src/cli/commands/council-run.ts` 从占位实现改成真实调用路径

其次再做：

- `agora ask` 的真实单模型调用

## 8. 新会话建议提示词

如果要在新会话里无缝接着做，建议直接这样开场：

```text
先读取 SESSION_HANDOFF.md 和 技术文档.md，不要重新从零分析。
按 handoff 里的当前状态继续开发，优先把 agora council run 从占位命令接成真实链路。
继续前先检查 git status，保留当前未提交改动，不要覆盖已有环境与模型白名单配置。
```
