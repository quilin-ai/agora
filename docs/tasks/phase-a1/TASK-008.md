# Task-008 — Orchestrator 核心

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-004, Task-005
> 真相源：`技术文档.md` 第五章、第十二章、第二十二章
> 目标：实现讨论主状态机、执行锁和 3 轮主流程骨架，作为唯一 orchestration 主路径。

---

## 1. Goal

完成 `runConsensusDiscussion()` 的核心主流程能力。

### 完成后应具备的能力

- 白名单状态迁移
- CAS 更新
- 执行锁
- 3 轮共识主路径
- 按环境默认模型集执行主流程（test 环境默认 3 个参与模型）
- `canContinue()`
- 与 StreamHub / Anonymizer / Secretary / ContextManager 的接口接线点

---

## 2. Scope

必须完成：

- `consensus.ts`
- `state-machine.ts`
- `execution-lock.ts`
- discussion 生命周期推进
- `handleFatalError`

本任务不做：

- 不实现 StreamHub 容错细节
- 不实现 Secretary 完整总结管线
- 不实现 ContextManager 保真细节
- 不做 Prompt Seed

---

## 3. Acceptance Criteria

1. 白名单迁移正确
2. 终态保护正确
3. 执行锁可用
4. 主流程可对接后续 009-012
5. 覆盖 U01 / U02 / U04

---

## 4. Stop Conditions

- 需要新增状态才能完成主流程

---

## 5. Implementation Status

- 状态：`Completed`
- 完成时间：`2026-03-17`
- 验证摘要：
  - `runConsensusDiscussion()` 已成为唯一 3 轮主流程入口
  - 状态机、CAS 迁移、执行锁、`handleFatalError` 已接通
  - `agora council run` 已真实进入 discussion create -> session-starter -> orchestrator -> round 1/2/3 -> summary -> done
  - `tests/unit/orchestrator/consensus.test.ts` 已覆盖 happy path、partial path、insufficient live models path
