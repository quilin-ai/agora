# Task-007 — 计费系统

> 阶段：Phase A2
> 优先级：P0
> 前置依赖：Task-002
> 真相源：`Agora-MVP-统一工程规格-v3.2` 第三章、第二十二章
> 目标：实现 `estimateRawCost + hold / settle / release / refund` 的完整账本逻辑。

---

## 1. Goal

完成计费核心，使 CLI / Web / orchestrator 都走统一账本。

### 完成后应具备的能力

- `estimateRawCost()`
- `hold()`
- `settle()`
- `release()`
- `refund()`
- 幂等

---

## 2. Scope

必须完成：

- `src/lib/billing/`
- 账本写入
- snapshot 绑定
- 幂等校验
- 对应测试 U05-U09

---

## 3. Acceptance Criteria

1. 账本语义符合 `v3.2`
2. `raw_cost -> platform_price` 只发生一次
3. 幂等成立
4. `pnpm lint` / `pnpm typecheck` / `pnpm test` 通过
