# Task-005 — 安全层

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第十三章、第二十二章
> 目标：补齐 `v3.2` 规定的基础安全与风控能力。

---

## 1. Goal

完成最小但明确的 guardrails：

- 注入 pattern 拦截
- `topic_hash` 去重（24h）
- 输入长度上限
- 风险分级
- Plan 级日限
- `normalizeTopic()`

---

## 2. Scope

必须完成：

- `src/lib/security/`
- 输入校验
- 风险分级
- `topic_hash` 生成与去重
- Plan 日限基础能力
- 对应测试 U18 / U19 / U20

不做：

- 不做完整 ML 风控
- 不做支付风控后台

---

## 3. Acceptance Criteria

1. 注入 pattern 可被拦截
2. `topic_hash` 重复会被拒绝
3. 输入长度上限生效
4. Plan 日限生效
5. `normalizeTopic()` 可复用

---

## 4. Stop Conditions

- 安全能力需要新增未冻结协议字段
