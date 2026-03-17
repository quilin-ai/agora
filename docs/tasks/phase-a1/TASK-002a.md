# Task-002a — session-starter 统一启动路径

> 阶段：Phase A1
> 优先级：P0
> 前置依赖：Task-002, Task-008
> 真相源：`技术文档.md` 第九章、十一章、十二章、第二十二章
> 目标：把 discussion 启动、恢复、owner/observer 分流统一收敛到 `session-starter.ts`。

---

## 1. Goal

实现：

```ts
startOrAttachDiscussion({
  actor,
  discussionId,
  onEvent,
})
```

### 完成后应具备的能力

- 首次持锁连接成为 owner
- 重复连接成为 observer
- CLI 和 Web 共用同一路径
- 不重复启动同一 discussion

---

## 2. Scope

必须完成：

- `src/lib/orchestrator/session-starter.ts`
- owner / observer 判定
- 执行锁获取
- orchestrator 启动
- restore 场景分流

不做：

- 不重写 orchestrator 主流程
- 不新增事件
- 不在 CLI / Web 里各写一份启动逻辑

---

## 3. Acceptance Criteria

1. 重复调用不会重复启动
2. CLI / Web 共用同一入口
3. owner / observer 语义正确
4. `pnpm lint` / `pnpm typecheck` / `pnpm test` 通过

---

## 4. Stop Conditions

- 需要新增状态或字段才能表达 owner / observer
