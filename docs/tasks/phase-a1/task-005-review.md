# Task-005 Review

## Reviewed Task

Task-005 — 安全层

## Verdict

pass

## Blocking Gaps

None

## Suggested Fixes

None

## Evidence

### 1. 实现

- `src/lib/security/risk-control.ts` 覆盖：注入拦截、`topic_hash` 去重（24h）、输入长度上限、风险分级、Plan 日限、`normalizeTopic()`
- `agora ask` / `agora council run` 已真实接入输入校验路径

### 2. Plan 日限验证

- q&a.md 10:45 note 确认 `free` plan 的 `councilPerDay=1` 限制在真实链路中生效
- test 用户已调整为 `pro` plan 避免本地开发被日限卡住

### 3. 测试

- `tests/unit/security/risk-control.test.ts` 覆盖 U18 / U19 / U20
- 16 files / 80 tests 全部通过

### 4. 验收项逐条

| # | 验收项 | 结论 |
|---|--------|------|
| 1 | 注入 pattern 可被拦截 | pass |
| 2 | topic_hash 重复会被拒绝 | pass |
| 3 | 输入长度上限生效 | pass |
| 4 | Plan 日限生效 | pass |
| 5 | normalizeTopic() 可复用 | pass |

## Deep Review Update - 2026-03-17

以下为 subagent deep review 发现的 non-blocking 项，verdict 保持 **pass** 不变，标记为 A2 改进项。

- **已知偏差**：长度上限用 characters（4:1 比例）近似 token，技术文档原文是 token 单位
- U20 全角测试通过 NFKC 隐式覆盖，未显式断言全角标点转换
