# Task-A1-E2E — Phase A1 端到端验证

> 阶段：Phase A1（收尾）
> 优先级：P0
> 前置依赖：Task-001a, Task-002a, Task-008 ~ Task-012
> 目标：验证 Phase A1 所有组件集成后，`agora council run` 可完整跑通一场讨论。

---

## 0. Why This Task Exists

A1 阶段的每个 Task 都有独立验收标准。
但零件能单独工作不等于机器能跑。

本任务的职责是：
- 把所有 A1 零件装配起来
- 跑一场真实的端到端讨论
- 验证 Go/No-Go 清单
- 确认没有 CLI / core 分叉逻辑
- 确认 JSONL 没被误用为 canonical state

如果 A1-E2E 通不过，不得进入 A2。

---

## 1. Goal

编写并通过 Phase A1 端到端测试，验证完整讨论生命周期。

### 任务完成后，应具备的能力
- `agora council run --topic "..." --models "..."` 完整跑通
- 3 轮讨论按顺序执行
- 匿名互评正确生效
- Secretary 结构化总结正确产出
- 事件流完整记录到 JSONL
- 状态机无异常迁移
- 不存在重复启动

---

## 2. Scope

### 本任务必须实现

- `tests/e2e/a1-council-run.test.ts` — 端到端测试主文件
- 可选：`tests/e2e/helpers/` — 测试辅助工具

### 本任务必须验证（不一定要新写代码）

- CLI `council run` 命令完整链路
- session-starter → orchestrator → 3 rounds → secretary → done
- 状态机从 `created` 到 `completed`
- JSONL 事件日志完整性
- 匿名化映射存在性
- Secretary 输出通过 Zod 校验

### 本任务明确不做
- 不实现新功能
- 不修改现有代码（除非发现必须修复的 bug）
- 不修改 DB schema
- 不修改 docs
- 不触碰 Web 相关代码

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md`（完整）
- `docs/spec/BUILD_ORDER.md` §2 Phase A1 Go/No-Go
- 所有 A1 阶段 Task 文件

---

## 4. Deliverables

### 必交文件
```text
tests/e2e/a1-council-run.test.ts
```

### 可选文件
```text
tests/e2e/helpers/mock-openrouter.ts
tests/e2e/helpers/test-db.ts
tests/e2e/helpers/assertions.ts
```

---

## 5. Test Scenarios

### 5.1 Happy Path — 完整讨论闭环

```text
Given: 有效的 topic 和至少 2 个模型
When:  通过 startOrAttachDiscussion 启动
Then:
  - 状态从 created → streaming → summarizing → completed
  - 3 轮 round_done 事件
  - 匿名化事件在 Round 2 前
  - summary 事件包含有效的 SecretaryRawOutput
  - done 事件正确
  - JSONL 文件包含所有事件
```

### 5.2 重复启动保护

```text
Given: 一个已在 streaming 状态的 discussion
When:  再次调用 startOrAttachDiscussion
Then:
  - 第二个调用成为 observer
  - 收到 restore 事件
  - 不会重新启动 orchestrator
```

### 5.3 终态不可重入

```text
Given: 一个已 completed 的 discussion
When:  调用 startOrAttachDiscussion
Then:
  - 收到 restore 事件
  - 不会尝试重新执行
```

### 5.4 单模型失败容错

```text
Given: 3 个模型，其中 1 个会 timeout
When:  讨论正常执行
Then:
  - 收到 model_error 事件
  - 讨论继续执行
  - 最终正常完成（如果存活模型 >= 门槛）
```

### 5.5 全模型失败 → failed

```text
Given: 所有模型都会失败
When:  讨论执行
Then:
  - 状态迁移到 failed
  - 收到 error 事件
  - 执行锁被释放
```

### 5.6 状态机一致性

```text
验证：
  - 不存在非白名单迁移
  - 终态不可被覆盖
  - current_round 和 last_completed_round 语义正确
```

### 5.7 JSONL 不是 canonical state

```text
验证：
  - 删除 JSONL 文件后，discussion 状态仍然正确（从 DB 读取）
  - JSONL 缺失不影响核心流程
```

---

## 6. Go/No-Go Checklist（BUILD_ORDER §2）

本任务必须逐项验证：

| ID | 检查项 | 状态 |
|----|--------|------|
| G01 | `agora council run` 可完整跑通 | |
| G03 | 3 轮讨论可视化输出正常 | |
| G05 | 匿名互评生效 | |
| G06 | Secretary 结构化总结可产出 | |
| G07 | 关键事件流可记录为 JSONL | |
| G08 | session-starter 作为统一入口可用 | |
| G09 | 不重复启动 discussion | |
| G11 | 状态机稳定 | |
| G13 | summary schema 稳定 | |
| G14 | CLI 和 core 不存在分叉逻辑 | |
| G17 | JSONL 未被误用为 canonical state | |

### 失败即回退条件

以下任一项不成立，必须报告并阻塞 A2：
- 状态机不稳定
- 同一 discussion 会重复启动
- summary schema 不稳定
- CLI 和 core 存在分叉逻辑
- JSONL 依赖被误用为 canonical state

---

## 7. Non-Functional Requirements

- 测试可重复运行
- 测试环境隔离（不影响生产数据）
- Mock 外部 API（OpenRouter）以保证测试稳定性
- 测试超时设置合理（讨论流程可能较长）

---

## 8. Constraints

### 硬约束
- 只验证，不修改协议
- 如果发现 bug，修复时不得改变协议语义
- 如果发现 gap，记录并报告
- 不得为了通过测试而放宽验收标准
- 不得跳过任何 Go/No-Go 项

---

## 9. Acceptance Criteria

### 必须全部满足

1. Happy path 测试通过
2. 重复启动保护测试通过
3. 终态不可重入测试通过
4. 单模型失败容错测试通过
5. 全模型失败测试通过
6. 状态机一致性测试通过
7. JSONL 不是 canonical state 测试通过
8. Go/No-Go 清单全部勾选
9. `pnpm test` 通过
10. 无未解决的 gap 阻塞 A2

---

## 10. Expected Agent Output Format

### 1. Task understanding
### 2. Changed files
### 3. Implementation summary
### 4. Acceptance result
### 5. Go/No-Go checklist result
逐项填写上述表格。
### 6. Risks / gaps
### 7. Test result

---

## 11. Stop Conditions

- 发现任何 A1 前置 Task 未正确完成
- 状态机存在不可解释的异常迁移
- Secretary 输出无法通过 Zod 校验且原因不明
- CLI 和 core 之间存在分叉逻辑
- 需要修改冻结协议才能让测试通过

A1-E2E 是门卫，不是啦啦队。
通不过就是通不过，不存在"差不多算通过"。
