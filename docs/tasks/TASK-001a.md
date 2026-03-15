# Task-001a — CLI 骨架 + event-logger

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001
> 来源：v3.1a 任务组补丁
> 目标：建立 CLI 最小骨架和 JSONL 事件日志能力，为后续 `council run` / replay / debug 打地基。

---

## 0. Why This Task Exists

当前施工策略是 CLI-first。
CLI 的定位不是独立产品，而是：
- orchestration harness
- engine validator
- debug / replay tool
- test entrypoint

因此，在真正接入 orchestrator 前，必须先有：
1. CLI 命令入口
2. 基础命令注册
3. 统一事件写盘能力
4. 与 core 分层兼容的最小骨架

---

## 1. Goal

实现一个最小可运行的 CLI skeleton，并提供 JSONL event logger。

### 任务完成后，应具备的能力
- 运行 `agora --help` 可以看到 CLI 主命令
- CLI 已有基础命令注册结构
- event logger 可将结构化事件追加写入本地 JSONL 文件
- 后续命令可复用 logger，不需要再重新发明一套输出系统

---

## 2. Scope

### 本任务必须实现
- `src/cli/index.ts`
- `src/cli/event-logger.ts`
- `src/cli/commands/` 目录骨架
- 至少一个占位命令的注册能力（建议 `council-run` 骨架）
- `.agora/sessions/{discussionId}.events.jsonl` 写入逻辑
- 基础错误处理
- 基础目录创建逻辑

### 本任务可以顺带做的极小辅助内容
- `src/cli/types.ts` 中的本地轻量类型
- `src/cli/utils/fs.ts` 之类的文件工具函数
- 基础 logger 单元测试

### 本任务明确不做
- 不实现真实 orchestrator 调用
- 不实现 Web 逻辑
- 不实现 OAuth
- 不实现真实 billing
- 不实现复杂 display renderer
- 不实现 replay / export / followup
- 不改动 DB schema
- 不增加任何新事件类型
- 不定义 CLI 专属协议

---

## 3. Required Inputs

实现前必须阅读：
- `docs/spec/CORE_SPEC.md`
- `docs/spec/BUILD_ORDER.md`

允许参考：
- v3.1 SSE 事件定义
- v3.1a 中 CLI 目录建议与 JSONL 边界说明

禁止把原始文档未冻结的示例代码当成协议新增来源。

---

## 4. Deliverables

### 必交文件
```text
src/cli/index.ts
src/cli/event-logger.ts
src/cli/commands/council-run.ts   # 可为最小骨架
```

### 可选文件

```text
src/cli/types.ts
src/cli/utils/fs.ts
tests/unit/cli/event-logger.test.ts
```

---

## 5. Functional Requirements

### 5.1 CLI entry

`src/cli/index.ts` 必须：

* 提供 CLI 程序入口
* 注册基础命令
* 支持 `--help`
* 支持 `--version`（可选，但建议）
* 具备后续扩展多个 commands 的结构

### 5.2 Event logger

`src/cli/event-logger.ts` 必须：

* 暴露创建 / 写入 logger 的接口
* 按 JSONL 逐行追加写入
* 自动创建父目录
* 文件路径格式固定为：

  * `.agora/sessions/{discussionId}.events.jsonl`
* 每行包含：

  * `timestamp`
  * `type`
  * `data`

### 5.3 Event data rule

* `type` 必须来自 v3.1 SSE 事件类型集合
* `data` 为原始事件负载
* logger 不负责改写事件语义
* logger 不负责把 JSONL 变成 canonical state
* logger 不得吞事件字段

### 5.4 Error handling

必须处理：

* 目录不存在
* 文件创建失败
* 追加失败
* 非法 discussionId
* 非法 event.type

### 5.5 Command skeleton

建议注册一个最小 `council-run` 占位命令：

* 接收 topic 参数
* 暂不接真实 orchestrator
* 可以打印"not implemented yet"或注入 mock event
* 但结构上必须为后续任务可扩展

---

## 6. Non-Functional Requirements

* TypeScript strict 通过
* 不得把业务逻辑写到 CLI 层
* 文件写入必须追加模式，不覆盖已有日志
* 代码应具备单元测试可测性
* API 尽量纯函数化 / 可注入路径，便于测试

---

## 7. Interface Suggestion

> 这是建议，不是强制签名。真正实现只要符合约束即可。

```ts
export interface LoggedEvent {
  timestamp: string;
  type: string;
  data: unknown;
}

export interface EventLogger {
  log(event: { type: string; data: unknown }): Promise<void>;
  getFilePath(): string;
}

export async function createEventLogger(params: {
  discussionId: string;
  baseDir?: string; // default ".agora/sessions"
}): Promise<EventLogger>;
```

---

## 8. Constraints

### 硬约束

* 不得修改 schema
* 不得新增状态
* 不得新增事件类型
* 不得触碰 `src/app/`
* 不得在 `src/lib/` 中引入 `src/cli/`
* 不得把 logger 设计成生产依赖
* 不得让 Web 读取或写入 JSONL
* 不得把 mock 逻辑伪装成正式 orchestration

### 目录约束

* 只允许修改：

  * `src/cli/**`
  * 必要时极少量 `src/lib/types/**` 的类型导出
  * 对应测试目录

---

## 9. Acceptance Criteria

### 必须全部满足

1. `agora --help` 输出正常
2. 至少一个基础命令被注册
3. 创建 logger 后可写入：

   ```json
   { "timestamp": "...", "type": "chunk", "data": { ... } }
   ```
4. JSONL 文件路径正确：

   * `.agora/sessions/{discussionId}.events.jsonl`
5. 重复写入时为追加而不是覆盖
6. 非法事件类型会报错或被拒绝
7. lint / typecheck / test 通过

---

## 10. Suggested Validation Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm tsx src/cli/index.ts --help
```

如项目实际脚本不同，以仓库脚本为准。

---

## 11. Example Manual Check

### Step 1

运行：

```bash
agora --help
```

预期：

* 输出主命令帮助
* 至少能看到已注册命令

### Step 2

在测试或本地脚本中写入两个事件：

```json
{ "type": "progress", "data": { "round": 1 } }
{ "type": "chunk", "data": { "text": "hello" } }
```

预期：

* 生成 `.agora/sessions/test-discussion.events.jsonl`
* 文件内有两行 JSON
* 每行都包含 `timestamp/type/data`

### Step 3

再次追加一条事件

预期：

* 文件行数增加
* 旧内容不丢失

---

## 12. Out of Scope Handoffs

本任务完成后，下一批任务会接管：

* `Task-008` 接入真实 orchestrator
* `Task-002a` 接入统一 session-starter
* `Task-A2-tools` 消费 JSONL 做 replay / export

所以本任务不要抢跑。
把地基打直，不要顺手盖天台。

---

## 13. Expected Agent Output Format

完成后必须按以下格式汇报：

### 1. Task understanding

用 3-6 句话复述本任务要做什么、不做什么。

### 2. Changed files

列出所有新增 / 修改文件。

### 3. Implementation summary

说明：

* CLI 入口怎么注册
* logger 怎么写盘
* 如何校验事件类型
* 如何处理路径和错误

### 4. Acceptance result

逐条对应 `Acceptance Criteria` 检查是否通过。

### 5. Risks / gaps

列出仍未覆盖的风险或任何规格缺口。

### 6. Test result

列出实际执行的 lint / typecheck / test 结果。

---

## 14. Stop Conditions

遇到以下情况必须停止实现并报 gap：

* 仓库没有 CLI 依赖且无法判断选型
* 原始 SSE 事件类型定义缺失
* 需要新增协议字段才能实现
* 需要改动 core 才能让本任务成立
* 路径规范与仓库现状严重冲突

禁止一边猜一边写。
那种代码通常长得很勤奋，死得很迅速。
