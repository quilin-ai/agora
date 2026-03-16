export interface ConsensusPoint {
  content: string;
  supporting_models: string[];
  evidence_refs: string[];
}

export interface DisagreementPosition {
  model_id: string;
  stance: 'for' | 'against' | 'neutral';
  summary: string;
}

export interface DisagreementPoint {
  topic: string;
  type: 'fact_conflict' | 'context_gap' | 'logic_divergence' | 'preference_difference';
  positions: DisagreementPosition[];
  severity: 'high' | 'medium' | 'low';
}

export interface SecretaryRawOutput {
  consensus: ConsensusPoint[];
  disagreements: DisagreementPoint[];
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  open_questions: string[];
  decision_boundary?: string;
  evidence_refs: string[];
}

export interface DiscussionSummaryFinal {
  consensus: ConsensusPoint[];
  disagreements: DisagreementPoint[];
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
  open_questions: string[];
  decision_boundary?: string;
  evidence_refs: string[];
  disclaimer: string;
  is_degraded: boolean;
}

export interface CompressedRoundState {
  round: number;
  model_positions: Array<{
    logical_model_id: string;
    core_stance: string;
    key_evidence: string[];
    challenged_by: string[];
    conceded_points: string[];
  }>;
  unresolved_conflicts: string[];
  new_information: string[];
  must_answer_in_next_round: string[];
}

export interface ModelFailureRecord {
  logical_model_id: string;
  actual_model_id: string | null;
  error_type: string;
  action: 'retrying' | 'degraded' | 'skipped';
}
