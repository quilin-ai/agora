# Task-A1-E2E — Phase A1 端到端验证

> 阶段：Phase A1（收尾）
> 优先级：P0
> 前置依赖：Task-001a ~ Task-012, Task-002a
> 真相源：`技术文档.md` 第二十、二十一、二十二章
> 目标：验证 A1 的所有核心模块集成后，`agora council run` 可完整跑通。

---

## 1. Goal

验证以下闭环：

- `agora ask`
- `agora council run`
- 环境白名单模型选择
- 3 轮讨论
- 匿名互评
- Secretary 总结
- JSONL 事件记录
- 不重复启动

---

## 2. Scope

必须验证：

- `session-starter → orchestrator → 3 rounds → secretary → done`
- `AGORA_ALLOWED_MODELS` / `AGORA_DEFAULT_COUNCIL_MODELS` / `AGORA_SECRETARY_MODEL` 生效
- 状态机迁移
- JSONL 不是 canonical state
- 重复启动保护
- 单模型失败容错

当前阶段补充说明：

- test 环境当前已切换到国产付费模型基线，避免免费模型不稳定与区域限制影响 A1 验收
- 当前 test 环境白名单：
  - `deepseek/deepseek-chat`
  - `qwen/qwen3.5-9b`
  - `moonshotai/kimi-k2`
  - `z-ai/glm-4.5-air`
  - `minimax/minimax-m1`
- 当前 test 环境默认 council：
  - `qwen/qwen3.5-9b`
  - `z-ai/glm-4.5-air`
  - `deepseek/deepseek-chat`
- 当前 test 环境 secretary：
  - `qwen/qwen3.5-9b`
- 当前复用入口：
  - `./run.sh test pnpm db:check`
  - `./run.sh test pnpm seed`
  - `pnpm phase-a1:smoke:paid`
- `pnpm phase-a1:smoke:paid` 当前已对齐为：
  - `ask` 不显式传 `-m`，直接走 `AGORA_SECRETARY_MODEL`
  - `council run` 不显式传 `-m`，直接走 `AGORA_DEFAULT_COUNCIL_MODELS`
  - council topic 自动附加唯一后缀，避免 topic hash 重复
  - 对 seed / ask / council 提供 3 次有限重试，吸收瞬时外部波动

---

## 3. Acceptance Criteria

1. `agora council run` 以环境默认模型完整跑通（test 默认 3 个参与模型）
2. G01 / G03 / G05-G09 / G11 / G13 / G14 / G17 满足
3. Phase A1 无未解决 blocker

当前执行策略说明：

- 免费模型路径继续保留，用于验证真实默认模型组合的 best-effort 行为
- paid smoke path 作为当前稳定的人工闭环验证入口，用于证明 CLI → session-starter → orchestrator → summary → done 主链路已完整可执行

---

## 4. Stop Conditions

- 任一 A1 前置 Task 未按 `v3.2` 完成

---

## 5. Implementation Status

- 状态：`Completed`
- 最新更新时间：`2026-03-17`
- 当前实现范围：
  - `scripts/run-phase-a1-paid-smoke.sh`
  - `src/cli/commands/ask.ts`
  - `src/cli/commands/council-run.ts`
  - `src/lib/orchestrator/session-starter.ts`
  - `src/lib/orchestrator/consensus.ts`

## 6. Delivered

- `agora ask` 已进入真实 OpenRouter 调用路径
- `agora council run` 已进入真实 `session-starter -> orchestrator -> summary -> done/error` 路径
- observer attach / restore / terminal error 路径已验证
- paid smoke 验证入口已从“显式 `-m` 指定模型”收口为“按环境默认模型验证”
- paid smoke 脚本已增加唯一 topic 与有限重试，便于重复回归
- test 环境已切换到 5 个国产品牌模型白名单，并以最便宜/最快的 3 个作为默认 council
- DB runtime 已稳定走 `DATABASE_TRANSACTION_POOLER_URL`，`db:check` / `seed` 可重复通过

## 7. Verification

- `./run.sh test pnpm lint`
- `./run.sh test pnpm typecheck`
- `./run.sh test pnpm test`
- 当前自动化基线：`18 files / 92 tests`
- `./run.sh test pnpm db:check` 已连续通过，当前连接源为 `DATABASE_TRANSACTION_POOLER_URL`
- `./run.sh test pnpm seed` 已通过，当前连接源为 `pooler (DATABASE_TRANSACTION_POOLER_URL)`
- `./run.sh test pnpm agora ask -q 'phase a1 chinese paid smoke ask'` 已按默认 secretary 模型 `qwen/qwen3.5-9b` 成功返回
- `./run.sh test pnpm phase-a1:smoke:paid` 已按当前环境默认模型完整跑通：
  - seed
  - ask
  - council round 1
  - council round 2
  - council round 3
  - secretary summary
  - done
- 当前完整跑通组合：
  - allowed: `deepseek/deepseek-chat,qwen/qwen3.5-9b,moonshotai/kimi-k2,z-ai/glm-4.5-air,minimax/minimax-m1`
  - council: `qwen/qwen3.5-9b,z-ai/glm-4.5-air,deepseek/deepseek-chat`
  - secretary: `qwen/qwen3.5-9b`

## 8. Current Blockers

- None
