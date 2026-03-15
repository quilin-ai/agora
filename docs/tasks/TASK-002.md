# Task-002 — DB Schema 定义（Drizzle ORM）

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001
> 目标：在 Drizzle ORM 中定义 v3.1 冻结的 11 张表 schema，建立数据层基础。

---

## 0. Why This Task Exists

Agora 的所有核心状态（讨论、消息、轮次、执行记录、计费）都以 PostgreSQL 为 canonical storage。
没有 schema，orchestrator 无法持久化，billing 无法记账，状态机无法 CAS。

本任务把 v3.1 冻结的 11 张表精确映射为 Drizzle schema 定义。

---

## 1. Goal

在 `src/lib/db/schema.ts` 中用 Drizzle ORM 定义全部 11 张冻结表。

### 任务完成后，应具备的能力
- 所有表定义通过 typecheck
- `drizzle-kit generate` 可以生成迁移文件
- 表结构严格对应 v3.1 冻结 schema
- 枚举类型（status、role 等）正确定义

---

## 2. Scope

### 本任务必须实现

- `src/lib/db/schema.ts` — 全部 11 张表的 Drizzle 定义
- `src/lib/db/schema/` — 可按领域拆分文件，在 `schema.ts` 中统一导出
- 必要的 Drizzle 枚举（pgEnum）定义
- 表间关系定义（references / foreign key）
- 索引定义（v3.1 规定的索引）

### 11 张冻结表（来自 CORE_SPEC §7 / §12）

1. `users` — 用户基础信息
2. `conversations` — 对话（含普通 chat 和 council discussion）
3. `messages` — 对话消息
4. `discussions` — 讨论主记录（status 状态机、current_round、last_completed_round）
5. `discussion_rounds` — 每轮讨论记录
6. `discussion_executions` — 讨论执行记录（锁、进程标识）
7. `discussion_anonymization_maps` — 匿名化映射
8. `model_configs` — 模型配置快照
9. `prompt_templates` — Prompt 模板
10. `credit_transactions` — 计费流水
11. `billing_snapshots` — 计费快照

### 本任务明确不做
- 不运行 migration（不执行 SQL）
- 不实现业务逻辑
- 不实现查询函数
- 不定义 TypeScript 业务类型（Task-004）
- 不定义 Zod 校验（Task-005）
- 不触碰 `src/cli/` 或 `src/app/`

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md` §5 Discussion Lifecycle（状态枚举）
- `docs/spec/CORE_SPEC.md` §6 Billing Canon（计费字段语义）
- `docs/spec/CORE_SPEC.md` §7 Canonical Storage（表清单）
- `docs/spec/CORE_SPEC.md` §12 DB Freeze Scope（冻结范围）

---

## 4. Deliverables

### 必交文件
```text
src/lib/db/schema.ts          # 统一导出
src/lib/db/schema/enums.ts    # pgEnum 定义
src/lib/db/schema/users.ts
src/lib/db/schema/conversations.ts
src/lib/db/schema/messages.ts
src/lib/db/schema/discussions.ts
src/lib/db/schema/discussion-rounds.ts
src/lib/db/schema/discussion-executions.ts
src/lib/db/schema/discussion-anonymization-maps.ts
src/lib/db/schema/model-configs.ts
src/lib/db/schema/prompt-templates.ts
src/lib/db/schema/credit-transactions.ts
src/lib/db/schema/billing-snapshots.ts
```

### 可选文件
```text
tests/unit/db/schema.test.ts  # schema 完整性检查
```

---

## 5. Functional Requirements

### 5.1 discussions 表

核心字段（冻结）：
- `id` — uuid, primary key
- `conversation_id` — 关联 conversations
- `status` — 枚举：`created | streaming | summarizing | completed | failed | aborted`
- `current_round` — integer, 0-3
- `last_completed_round` — integer, 0-4（4 = summary 完成）
- `topic` — text, 讨论主题
- `model_ids` — 参与模型列表
- `created_at` / `updated_at`
- `completed_at` / `failed_at` / `aborted_at` — 终态时间戳
- `error_code` / `error_message` — 失败信息
- `summary` — jsonb, DiscussionSummaryFinal

### 5.2 discussion_rounds 表

- `id` — uuid
- `discussion_id` — 关联 discussions
- `round_number` — 1/2/3
- `round_type` — `independent | review | rebuttal`
- `status` — `pending | running | completed | failed`
- `started_at` / `completed_at`
- `model_responses` — jsonb

### 5.3 discussion_executions 表

- `id` — uuid
- `discussion_id` — 关联 discussions
- `lock_holder` — text, 进程标识
- `locked_at` / `released_at`
- `status` — `running | completed | failed`
- `error_code` / `error_message`

### 5.4 credit_transactions 表

- `id` — uuid
- `user_id` — 关联 users
- `discussion_id` — 可空，关联 discussions
- `type` — `hold | release | refund | settle`
- `amount_raw` — decimal
- `amount_platform` — decimal
- `billing_snapshot_id` — 关联 billing_snapshots
- `created_at`

### 5.5 discussion_anonymization_maps 表

- `id` — uuid
- `discussion_id`
- `round_number`
- `model_id` — 真实模型 ID
- `anonymous_label` — 匿名标签（如 "Model A"）
- `created_at`

### 5.6 状态枚举

必须定义以下 pgEnum：
- `discussionStatusEnum`: `created | streaming | summarizing | completed | failed | aborted`
- `roundTypeEnum`: `independent | review | rebuttal`
- `roundStatusEnum`: `pending | running | completed | failed`
- `executionStatusEnum`: `running | completed | failed`
- `creditTransactionTypeEnum`: `hold | release | refund | settle`
- `conversationTypeEnum`: `chat | council`
- `messageRoleEnum`: `user | assistant | system`

---

## 6. Non-Functional Requirements

- TypeScript strict 通过
- 所有表名使用 snake_case
- 所有字段名使用 snake_case
- 时间字段使用 `timestamp with time zone`
- UUID 字段使用 `uuid` 类型并 `defaultRandom()`
- jsonb 字段不做运行时校验（留给 Zod）

---

## 7. Constraints

### 硬约束
- 不得自创字段（CORE_SPEC §12 铁律）
- 不得自创状态枚举值
- 不得自创表
- 不得运行 migration 或任何 SQL
- 不得在 schema 文件中引入业务逻辑
- 不得修改 `src/lib/db/index.ts` 的连接逻辑（Task-001 已建）

### Gap 处理
- 如果 v3.1 冻结的某张表字段定义不明确，记录 gap 并用最合理的最小字段集
- 在 gap 注释中标注 `// GAP: 字段来源待确认`

---

## 8. Acceptance Criteria

### 必须全部满足

1. 11 张表全部定义
2. 所有枚举使用 pgEnum
3. `pnpm typecheck` 通过
4. `pnpm lint` 通过
5. 表间关系（foreign key）正确
6. `discussions.status` 枚举值与 CORE_SPEC §5 完全一致
7. `credit_transactions.type` 枚举值与 CORE_SPEC §6 完全一致
8. 不含自创字段
9. 不含业务逻辑
10. `drizzle-kit generate` 可成功生成迁移（不需要执行）

---

## 9. Suggested Validation Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm drizzle-kit generate
```

---

## 10. Out of Scope Handoffs

本任务完成后：
- `Task-004` 基于 schema 推导 TypeScript 业务类型
- `Task-005` 基于类型定义 Zod 校验
- `Task-008` 基于 schema 实现 orchestrator 的持久化操作

---

## 11. Expected Agent Output Format

完成后必须按以下格式汇报：

### 1. Task understanding
### 2. Changed files
### 3. Implementation summary
### 4. Acceptance result
### 5. Risks / gaps
### 6. Test result

---

## 12. Stop Conditions

遇到以下情况必须停止实现并报 gap：
- v3.1 某张表的字段定义完全缺失
- 枚举值与 CORE_SPEC 存在矛盾
- Drizzle ORM 不支持某个需要的 PostgreSQL 特性
- 需要新增冻结范围之外的表或字段
