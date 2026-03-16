/**
 * Discussion 生命周期相关类型（CORE_SPEC §5）
 */

/** Discussion 持久状态 — 6 个值，不得新增 */
export type DiscussionStatus =
  | 'created'
  | 'streaming'
  | 'summarizing'
  | 'completed'
  | 'failed'
  | 'aborted';

/** 终态 — completed / failed / aborted 不允许迁移到任何新状态 */
export type TerminalStatus = 'completed' | 'failed' | 'aborted';

/** 轮次类型 */
export type RoundType = 'independent' | 'review' | 'rebuttal';

/** 轮次编号 — 1/2/3 */
export type RoundNumber = 1 | 2 | 3;

/** 轮次状态 */
export type RoundStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 执行锁状态 */
export type ExecutionStatus = 'running' | 'completed' | 'failed';

/**
 * 状态迁移白名单（CORE_SPEC §5）
 * 所有状态更新必须基于此白名单做 CAS，禁止覆盖终态。
 */
export type DiscussionTransition =
  | { from: 'created'; to: 'streaming' }
  | { from: 'created'; to: 'aborted' }
  | { from: 'created'; to: 'failed' }
  | { from: 'streaming'; to: 'streaming' }
  | { from: 'streaming'; to: 'summarizing' }
  | { from: 'streaming'; to: 'failed' }
  | { from: 'streaming'; to: 'aborted' }
  | { from: 'summarizing'; to: 'completed' }
  | { from: 'summarizing'; to: 'failed' };
