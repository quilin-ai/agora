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

- 阶段状态：`Completed`
- 当前基线：`全部内容已按 技术文档.md 重对齐`
- 最新进展：`test 环境已切到国产付费模型基线；DB 已稳定走 transaction pooler；phase-a1:smoke:paid 已按环境默认模型完整跑通到 secretary summary 与 done`
- 当前重点：`Phase A1 已完成，可继续进入 Phase A2`
- 下一步：`推进 Task-015-CLI / Phase A2 工程化加固`
- 后续增强归属：`TTY panel 分区流式输出、round_summary 轮间书记员总结、grounding 联网背景拉齐已转入 Phase A2 推进，不影响 Phase A1 已完成验收结论`

## Task Progress

- [x] Task-001
- [x] Task-001a
- [x] Task-002
- [x] Task-004
- [x] Task-005
- [x] Task-008
- [x] Task-009
- [x] Task-010
- [x] Task-011
- [x] Task-012
- [x] Task-014
- [x] Task-002a
- [x] Task-A1-E2E

## Latest Verified

- `./run.sh test pnpm drizzle-kit push` 已成功执行，test DB 已创建 11 张表
- `./run.sh test pnpm seed` 已可写入 Phase A1 最小 seed data：
  - `billing_snapshots`
  - `users` 中与 `CLI_TEST_USER_ID` 对应的 CLI test user
  - `prompt_templates` 中 4 条冻结 prompt
- `./run.sh test pnpm typecheck` 通过
- `./run.sh test pnpm lint` 通过
- `./run.sh test pnpm test` 通过
- 当前测试结果：`18 files / 92 tests`
- test 环境当前模型基线已切换为国产付费模型：
  - allowed: `deepseek/deepseek-chat,qwen/qwen3.5-9b,moonshotai/kimi-k2,z-ai/glm-4.5-air,minimax/minimax-m1`
  - default council: `deepseek/deepseek-chat,z-ai/glm-4.5-air,moonshotai/kimi-k2`
  - secretary: `deepseek/deepseek-chat`
- DB 稳定性加固已落地：
  - `src/lib/db/index.ts` 现支持 `DATABASE_POOLER_URL` 优先
  - 现进一步支持 `DATABASE_SESSION_POOLER_URL` / `DATABASE_TRANSACTION_POOLER_URL`
  - pooler 连接默认禁用 prepared statements
  - `ensureDatabaseReady()` 已接入 seed / council run
  - `CONNECT_TIMEOUT` 等瞬时错误会触发重试与连接回收
  - `pnpm db:check` 已作为统一诊断入口落地
- `./run.sh test pnpm db:check` 已连续通过，当前连接源为 `DATABASE_TRANSACTION_POOLER_URL`
- `scripts/run-phase-a1-paid-smoke.sh` 已对齐到环境默认模型验证口径：
  - `ask` 直接走 `AGORA_SECRETARY_MODEL`
  - `council run` 直接走 `AGORA_DEFAULT_COUNCIL_MODELS`
  - council topic 自动附加唯一后缀，避免 topic hash 重复
  - seed / ask / council 均支持 3 次有限重试
- `./run.sh test pnpm agora council run -t "..."` 已不再是占位命令，已验证真实路径：
  - discussion create
  - session-starter owner 路径
  - orchestrator round 1
  - CLI renderer
  - JSONL event logger
- observer attach 路径已验证，能输出 restore / terminal error
- `./run.sh test pnpm agora ask -q "..."` 已不再是占位命令，已进入真实 OpenRouter 请求路径
- `./run.sh test pnpm agora ask -q 'phase a1 chinese paid smoke ask'` 已按默认 secretary 模型 `deepseek/deepseek-chat` 成功返回
- `pnpm phase-a1:smoke:paid` 已作为可复用 paid smoke 验证入口落地，并已实际完整跑通：
  - seed
  - ask
  - council round 1/2/3
  - secretary summary
  - done
- `2026-03-18` 当前默认 smoke 组合已切换为更快基线：
  - council: `deepseek/deepseek-chat,z-ai/glm-4.5-air,moonshotai/kimi-k2`
  - secretary: `deepseek/deepseek-chat`
  - round 1/2/3、summary、done 全部通过
- 新增稳定 happy-path 测试：`tests/unit/orchestrator/consensus.test.ts`
  - mock-based 覆盖 `runConsensusDiscussion` 的 3 轮主流程
  - 验证 `summary` / `done` 事件发射
  - 验证状态机迁移顺序
- `Task-009` 容错链路已按新版技术文档落地并完成定向验证：
  - `executeRound -> streamWithRetry -> streamSingle`
  - `MODEL_TIMEOUT_MS` / `MODEL_TTFT_TIMEOUT_MS` / `MAX_RETRIES_PER_MODEL` / `RETRY_WITH_DEGRADED`
  - `retrying -> degraded -> skipped` 事件语义
  - `round_done.skipped_models` 与 `failed_models` 结构修正
  - round token / raw_cost 聚合写入 `discussion_rounds`
  - `conversations.total_raw_cost` / `total_input_tokens` / `total_output_tokens` 自动汇总更新
- `Task-010` 匿名化已按新版技术文档收口并完成定向验证：
  - 匿名标签已统一为 `选手A / 选手B / ...`
  - Round 2 review context 已接入身份剥离
  - `IDENTITY_PATTERNS` 已落地并补齐单测
  - 映射写入 `discussion_anonymization_maps` 的持久化路径已验证
- `Task-011` Secretary 已按新版技术文档完成定向验证：
  - `SecretaryRawOutputSchema -> validateSemantics -> DiscussionSummaryFinal` 唯一路径
  - invalid JSON strict retry
  - unknown supporting model / disagreement model 校验
  - `confidence=high` 且无 evidence 的 degraded fallback
- `Task-012` ContextManager 已按新版技术文档完成定向验证：
  - `CompressedRoundState` 结构化压缩
  - `compressed_context` / `compressed_rounds` 改为 JSON 序列化结果
  - `discussion_rounds.compressed_state` 已接入持久化
  - 验证失败时 fallback 到 heavier context
- `Task-014` Prompt Seed 已按新版技术文档完成实现对齐：
  - 4 条主 prompt 已写入 seed 脚本
  - `prompt_templates` active 记录可由 prompt store 读取
  - `pnpm seed` 可重复写入并保持激活状态
- 新增容错验证测试：
  - `tests/unit/orchestrator/stream-hub.test.ts`
    - degraded fallback 成功路径
    - TTFT timeout -> retrying -> skipped 路径
  - `tests/unit/orchestrator/consensus.test.ts`
    - partial round 继续路径
    - 低于 `MIN_MODELS_PER_ROUND` 的 round failed 路径

## Current Blockers

- None

## Task Notes

- `Task-002`
  - 表结构已实际落库
  - 最小 seed 脚本已补齐
  - 仍需继续对照新版技术文档复核是否还有 schema / seed 漏项
- `Task-004`
  - OpenRouter client 已被 `ask` 和 `council run` 真实消费
  - 免费模型路径的 blocker 已转移到上游模型池和账号策略，而不是 CLI 占位实现
  - 付费模型 smoke path 已证明 provider 链路本身可用
- `Task-008`
  - `council run` 已接入真实 orchestrator 主路径
  - 当前已能触发真实 round 事件、summary 与 done
- `Task-002a`
  - `session-starter` owner / observer 路径都已通过 CLI 真实链路触发
  - 仍需继续收口验收与文档对齐
- `Task-A1-E2E`
  - 已有可复用 paid smoke 验证路径
  - `pnpm phase-a1:smoke:paid` 已按当前环境默认模型完整跑通到 summary / done
  - paid smoke 脚本现已真正按环境默认模型执行，不再依赖显式 `-m`
  - mock-based happy-path 测试已补齐，当前不再只依赖真实模型池
  - 当前已完成验收并勾选
- `Task-009`
  - 旧版“一次直呼 + Promise.allSettled” round 执行逻辑已移除
  - 现已切换为 `streamWithRetry` 管线，支持 retry / degraded / skipped
  - TTFT timeout 与总 timeout 已接入真实 abort 信号
  - 已补齐 round token / raw_cost 持久化和聚合统计
- `Task-010`
  - 旧版 `Model A/B/...` 标签已移除，改为文档要求的 `选手A/B/...`
  - `anonymizeRoundResponses()` 已补齐 identity stripping
  - 已新增针对身份自报和模型名泄露的单测
- `Task-011`
  - Secretary 语义校验测试已覆盖 U12 / U13 / U14 / U15
  - 当前实现与 `DiscussionSummaryFinal` 最终消费类型一致
- `Task-012`
  - 旧版纯字符串截断逻辑已移除
  - 当前已切换为 `CompressedRoundState` 结构化压缩与合并
  - `consensus.ts` 已消费压缩态 JSON 进入 Round 3 与 Secretary
- `Task-014`
  - seed 脚本中的 4 条主 prompt 已与冻结 prompt 变量名对齐
  - 当前可通过 `createDefaultPromptTemplateStore()` 正常读取 active prompt

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
