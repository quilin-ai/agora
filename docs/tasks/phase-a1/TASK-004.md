# Task-004 — OpenRouter 适配层

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-001
> 真相源：`技术文档.md` 第三章、第十二章、第二十二章
> 目标：建立符合 `v3.2` 的 OpenRouter 调用封装，为 `ask`、orchestrator、Secretary 提供统一 provider 入口。

---

## 1. Goal

完成可复用的 OpenRouter 适配层。

### 完成后应具备的能力

- 调用单模型获得流式响应
- token 统计可读
- 常量导出齐全
- 后续可被 StreamHub / Secretary / `agora ask` 复用

---

## 2. Scope

必须完成：

- `src/lib/openrouter/client.ts`
- 基于环境变量的模型白名单读取与默认模型解析
- 常量导出
- 流式与非流式调用
- 错误处理

不做：

- 不做多 provider adapter
- 不做 CLI 命令
- 不做业务容错策略（留给 StreamHub）

---

## 3. Acceptance Criteria

1. 单模型调用可用
2. 流式输出可消费
3. token / raw cost 基础数据可读
4. `AGORA_ALLOWED_MODELS` / `AGORA_DEFAULT_COUNCIL_MODELS` / `AGORA_SECRETARY_MODEL` 可被统一读取
5. `pnpm lint` / `pnpm typecheck` / `pnpm test` 通过

---

## 4. Stop Conditions

- OpenRouter 协议与 `v3.2` 冻结接口冲突
