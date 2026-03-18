# Task-002 — 数据模型与 Migrations

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001
> 真相源：`技术文档.md` 第六章、第二十二章
> 目标：按 `v3.2` 的完整 schema 落地数据库模型、索引、约束和 seed data。

---

## 1. Goal

完成 `v3.2` 冻结的 11 张表及其约束：

- `billing_snapshots`
- `users`
- `conversations`
- `messages`
- `discussion_rounds`
- `discussion_executions`
- `discussion_anonymization_maps`
- `prompt_templates`
- `credit_transactions`
- `byok_keys`
- `events`

---

## 2. Scope

必须完成：

- Drizzle schema
- migrations
- seed data
- 枚举值
- 索引与唯一约束
- JSONB 字段类型约束

关键要求：

- discussion 主状态落在 `conversations`
- `conversations.summary` 对齐 `DiscussionSummaryFinal`
- `discussion_rounds.compressed_state` 对齐 `CompressedRoundState`
- `topic_hash`、`parent_id`、`fork_point_message_id`、`billing_snapshot_id` 等冻结字段必须存在

不做：

- 不自创字段
- 不简化成“最小合理字段集”
- 不改写 canonical state 归属

---

## 3. Deliverables

```text
src/lib/db/schema/**
drizzle/*
seed data for prompt / base records
tests/unit/db/*.test.ts
```

---

## 4. Acceptance Criteria

1. 11 张表与 `v3.2` 对齐
2. 所有索引和约束就绪
3. seed data 可插入
4. `pnpm lint` / `pnpm typecheck` / `pnpm test` 通过

---

## 5. Stop Conditions

- 发现 `v3.2` schema 自相矛盾
- 需要擅自删减冻结字段才能通过实现

---

## 6. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 验证摘要：
  - 11 张表 schema / 索引 / 约束已落地
  - `./run.sh test pnpm drizzle-kit push` 已在 test DB 成功建表
  - `./run.sh test pnpm seed` 已写入 `billing_snapshots`、CLI test user、4 条 active prompt templates
  - `tests/unit/db/schema.test.ts` 已覆盖冻结字段与关键索引
