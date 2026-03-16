# Agora MVP Build Order

> 文档性质：施工顺序控制文件。
> 目标：把 v3.1 的完整目标规格压缩成实际可执行的阶段施工图。
> 优先级：不改变核心协议，只控制"先做什么、后做什么、什么暂时不做"。

---

## 0. Build Philosophy

### 为什么不是先做 Web
当前阶段核心风险在引擎：
- 匿名互评后第 3 轮是否真的增益
- Secretary 是否稳定输出高质量结构化总结
- 多模型脏环境下是否稳定、可恢复、可 debug

先做完整 Web 会把精力消耗在：
- 四宫格流式 UI
- SSE 管理
- 断线恢复
- 前后端联调
- 状态显示与交互细节

所以采用：
- **CLI-first**
- **event-first**
- **core first, renderer later**

---

## 1. Global Order

```text
Phase 1（CLI 命令版）:
  Phase A1:
  Task-001 → Task-002 → Task-004 → Task-005 → Task-001a
  → Task-008 → Task-009 → Task-010 → Task-011 → Task-012
  → Task-002a → Task-A1-E2E

  Phase A2:
  Task-007 → Task-A2-chat → Task-A2-tools
  → Task-A2-event → Task-A2-test → Task-015-CLI

Phase 2（TUI 终端应用）:
  TUI task group（待拆分）→ 在 Task-015-CLI 之后启动

Phase 3（Web 图形化应用）:
  Task-003 → Task-006 → Task-013 → Task-016(核心页面) → Task-015-Web

  Task-016(剩余) → Task-017 → Task-018 → Task-019 → Task-020 → Task-021 → Task-022
```

---

## 2. Phase A1 — 最小引擎闭环

### 目标

跑通一场最小但真实的 Agora 讨论闭环，让 CLI 可以驱动同一套 core 完成：

* 讨论创建
* 3 轮编排
* 匿名互评
* Secretary 总结
* 事件流渲染
* 恢复 / replay 的基础前提
* 最小端到端验证

### 本阶段必须完成

* `Task-001`
* `Task-002`
* `Task-004`
* `Task-005`
* `Task-001a`
* `Task-008`
* `Task-009`
* `Task-010`
* `Task-011`
* `Task-012`
* `Task-002a`
* `Task-A1-E2E`

### 本阶段明确不做

* Google OAuth
* Web 页面
* 完整 Billing 流水接入
* CLI 产品化设计
* 复杂 TUI
* Landing / Explore / Admin

### Go / No-Go

A1 结束时必须满足：

* `agora council run` 可以完整跑通
* 3 轮讨论可视化输出正常
* 匿名互评生效
* Secretary 结构化总结可产出
* 关键事件流可记录为 JSONL
* session-starter 作为统一入口可用
* 不重复启动 discussion
* G01 / G03 / G05-G09 / G11 / G13 / G14 / G17 满足

### 失败即回退条件

以下任一项不成立，不得进入 A2：

* 状态机不稳定
* 同一 discussion 会重复启动
* summary schema 不稳定
* CLI 和 core 存在分叉逻辑
* JSONL 依赖被误用为 canonical state

---

## 3. Phase A2 — 工程化加固

### 目标

在 A1 闭环基础上，把 CLI 做成完整的内部施工工具，而不是只会跑一次 demo 的纸老虎。

### 本阶段必须完成

* `Task-007`
* `Task-A2-chat`
* `Task-A2-tools`
* `Task-A2-event`
* `Task-A2-test`
* `Task-015-CLI`

### 关键能力

* `agora chat`
* `/switch`
* `/upgrade`
* `council replay`
* `council export`
* `council followup`
* 事件契约一致性校验
* 全面测试

### Go / No-Go

A2 结束时必须满足：

* CLI 全命令链路可用
* 事件字段与 v3.1 SSE 定义逐字段对齐
* U01-U20 全部通过
* I01-I04 / I06-I12 通过
* C01-C03 / C06 通过
* G01-G19 全满足
* CLI 端到端联调通过

### 本阶段不做

* 完整 Web 体验
* Landing / Explore / Billing UI
* Admin
* 国际化收尾

---

## 4. Phase 2 — TUI 终端应用

### 目标

在 CLI 命令链路已经稳定之后，把同一套 core、事件协议和 session-starter 包装成可持续驻留的终端应用，作为投资人演示原型。

### 启动时机

仅在以下条件成立后启动：

* `Task-015-CLI` 已完成
* CLI 全命令链路可用
* 事件字段与 v3.1 SSE 定义逐字段对齐
* `agora council run` 已可完整跑通

### 设计铁律

* TUI 只是新的 terminal renderer，不得改写 core 协议
* TUI 不得新增 CLI / TUI 专属状态机、事件类型、summary schema、prompt 体系
* TUI 必须复用 `src/lib/`、SSE 事件契约、session-starter、既有 DB schema
* 先做终端中的交互式演示层，再做 Web 图形化应用

### 本阶段交付形式

* 交互式终端入口（持续驻留，而非单次命令退出）
* 会话列表 / 当前讨论 / 事件流 / 输入区等终端面板
* 基于已有 CLI 与 core 能力的演示脚本和投资人演示路径

### 当前 gap

* TUI 任务文件尚未拆分
* 详细任务编号在 `Task-015-CLI` 完成后补齐

---

## 5. Phase 3 — Web 图形化应用

### 目标

在 CLI 与 TUI 两层都已经验证过核心流程之后，把同一套 core 接到 Web，并逐步补齐页面、登录、支付和产品化能力。

### 本阶段必须完成

* `Task-003`
* `Task-006`
* `Task-013`
* `Task-016(核心页面)`
* `Task-015-Web`

### Web 接入铁律

* Web route 不得重写 orchestration
* `GET /api/discussions/:id/stream` 必须调用 `startOrAttachDiscussion()`
* 前端状态只来自 SSE 事件流或 DB 状态
* `can_stream=false` 时走 polling fallback
* Web 可用 JSONL 做 mock / debug，但不得依赖 JSONL

### Go / No-Go

B 结束时必须满足：

* 浏览器可完整跑通讨论
* SSE 恢复正常
* `restore` 语义正确
* `can_stream=true/false` 行为正确
* E01 / E06 通过

### 本阶段后续补齐

* `Task-016(剩余)`
* `Task-017`
* `Task-018`
* `Task-019`
* `Task-020`
* `Task-021`
* `Task-022`

---

## 6. Task Group Notes

### 6.1 Task-001a

* 名称：CLI 骨架 + event-logger
* 前置：Task-001
* 完成标准：

  * `agora --help` 输出正常
  * JSONL 写入可用

### 6.2 Task-002a

* 名称：session-starter 统一启动路径
* 前置：Task-002, Task-008
* 完成标准：

  * CLI 和 Web 共用同一启动入口
  * 重复调用不会重复启动

### 6.3 Task-A1-E2E

* 名称：Phase A1 端到端验证
* 前置：Task-001a ~ Task-012
* 完成标准：

  * `agora council run` 完整跑通
  * 关键 Go/No-Go 项满足

### 6.4 Task-A2-chat

* 名称：CLI chat + upgrade
* 前置：Task-A1-E2E, Task-007
* 完成标准：

  * `agora chat` 多轮可用
  * `/upgrade` 可升级成 council

### 6.5 Task-A2-tools

* 名称：CLI replay + export + followup
* 前置：Task-A1-E2E
* 完成标准：

  * 三个命令可用
  * 满足 G15 / N01

### 6.6 Task-A2-event

* 名称：事件契约一致性检查
* 前置：Task-A1-E2E
* 完成标准：

  * CLI 事件字段与 SSE 逐字段对齐

### 6.7 Task-A2-test

* 名称：CLI 全面测试
* 前置：Task-A2-chat, Task-A2-tools
* 完成标准：

  * 单元 / 集成 / chaos 测试通过

### 6.8 Task-015-CLI

* 名称：CLI 端到端联调
* 前置：Task-A2-test
* 完成标准：

  * CLI 完整链路跑通
  * 所有 Phase A 测试通过

### 6.9 Task-015-Web

* 名称：Web 端到端联调
* 前置：Task-015-CLI, Task-016
* 完成标准：

  * 浏览器跑通
  * SSE 恢复正常
  * E01 / E06 通过

---

## 7. Non-Goals by Construction

以下内容明确不允许插队：

* 独立 CLI 产品设计
* 在 Phase 1 内提前做复杂 TUI
* CLI 专属状态机
* CLI 专属 summary schema
* CLI 专属 prompt 体系
* CLI 专属事件定义
* CLI 专属 DB schema
* 与 Web 断裂的临时逻辑
* CLI 用户认证系统
* CLI 支付/计费 UI
* `src/lib` 重命名为 `src/core`
* JSONL 变 canonical state

---

## 8. Execution Rules for Agents

每次只允许执行一个任务文件，且必须遵守：

1. 只读当前 task 所需文档
2. 只修改 task 允许的目录
3. 不跨阶段施工
4. 不顺手做下一个 task
5. 不为未来任务预埋协议改动
6. 发现 gap 立即停下

### 标准执行节奏

* 读 `CORE_SPEC.md`
* 读 `BUILD_ORDER.md`
* 读当前 `TASK-XXX.md`
* 复述任务
* 实现最小变更
* 跑 lint / typecheck / test
* 输出验收结果和风险点

---

## 9. Human Review Gates

以下节点必须人工 review 后再继续：

* A1 完成
* A2 完成
* Web 首次接入完成
* Final polish 前

### review 重点

* 是否偏离协议
* 是否出现 CLI / Web 双轨逻辑
* 是否引入非冻结字段 / 状态 / 事件
* 是否出现"为了方便"而偷改语义
* 是否测试通过但行为不符合产品定义

---

## 10. Branching Advice

推荐分支策略：

* `main`：稳定主干
* `feat/task-001a-cli-skeleton`
* `feat/task-008-orchestrator`
* `feat/task-002a-session-starter`
* `feat/task-a2-chat`
* `feat/task-013-sse-restore`

禁止一个分支同时做多个 phase 的事。
那会把版本控制变成废墟考古。
