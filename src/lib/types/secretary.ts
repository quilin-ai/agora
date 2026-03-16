/**
 * Secretary 输出类型（CORE_SPEC §11）
 *
 * Secretary 必须输出结构化 JSON，遵守固定 schema。
 * 禁止额外 markdown 或说明文字。
 */

export interface SecretaryRawOutput {
  consensus: string;
  disagreements: string[];
  recommendation: string;
  confidence: number;
  open_questions: string[];
  decision_boundary?: string;
  evidence_refs: string[];
}

export interface DiscussionSummaryFinal {
  raw_output: SecretaryRawOutput;
  generated_at: string;
  secretary_model: string;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
