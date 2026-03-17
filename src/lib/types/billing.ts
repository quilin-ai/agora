/**
 * 计费相关类型（CORE_SPEC §6）
 */

/** 计费流水类型 */
export type CreditTransactionType =
  | 'hold'
  | 'settle'
  | 'release'
  | 'refund'
  | 'grant'
  | 'purchase'
  | 'monthly_reset';

/**
 * 计费成本
 * - raw_cost: 上游 API 原始成本
 * - platform_price: 用户侧结算价格
 */
export interface BillingCost {
  raw_cost: number;
  platform_price: number;
}
