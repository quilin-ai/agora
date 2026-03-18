# Task-004 Review

## Reviewed Task

Task-004 — OpenRouter 适配层

## Verdict

pass

## Blocking Gaps

None

## Suggested Fixes

None

## Evidence

### 1. 实现

- `src/lib/openrouter/client.ts` 支持流式与非流式调用
- `src/lib/config/models.ts` 统一读取 `AGORA_ALLOWED_MODELS` / `AGORA_DEFAULT_COUNCIL_MODELS` / `AGORA_SECRETARY_MODEL`

### 2. 真实验证

- `agora ask` 已使用 `openai/gpt-5-nano` 成功返回真实输出（q&a.md 11:42 note）
- `agora council run` 已使用 3 模型完整跑通 paid smoke path
- 流式输出可消费（paid smoke 中 Round 1/2/3 chunk 事件正常）

### 3. 测试

- `tests/unit/openrouter/client.test.ts`：5 test cases
- 16 files / 80 tests 全部通过

### 4. 验收项逐条

| # | 验收项 | 结论 |
|---|--------|------|
| 1 | 单模型调用可用 | pass |
| 2 | 流式输出可消费 | pass |
| 3 | token / raw cost 基础数据可读 | pass |
| 4 | 模型配置统一读取 | pass |
| 5 | lint / typecheck / test 通过 | pass |
