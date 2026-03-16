/**
 * ActorContext — 跨层身份传递抽象（CORE_SPEC §4）
 *
 * Core workflow 不得在内部读取当前用户，不得直接依赖 NextAuth、cookie、session。
 * 所有调用者必须显式传入 ActorContext。
 */

export interface ActorContext {
  userId: string;
  source: 'cli' | 'web' | 'test';
}
