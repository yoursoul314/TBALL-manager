import type { Ability } from '../config/positions';
export const DEFENSE_SITUATIONS = {
  ground: '땅볼 수비',
  fly: '뜬공 수비',
  receive: '송구 받아 처리',
  throw: '송구 연습',
  base: '베이스·태그 처리',
  combined: '복합 수비',
} as const;
export type DefenseSituation = keyof typeof DEFENSE_SITUATIONS;
export type DefenseOutcome = 'success' | 'partial' | 'failure' | 'not-offered' | null;
export const DEFENSE_ERRORS = {
  none: '실책 없음',
  fielding: '타구 포구 실책',
  receiving: '송구 포구 실책',
  throwing: '악송구',
  base: '베이스 처리 실책',
  judgment: '판단 실책',
} as const;
export type DefenseError = keyof typeof DEFENSE_ERRORS;
export interface DefenseRubric {
  version: 'defense-checklist-trial-v1';
  success: number;
  partial: number;
  failure: number;
}
export interface DefenseRevision {
  id: string;
  date: string;
  situation: DefenseSituation;
  observations: Record<Ability, DefenseOutcome>;
  error: DefenseError | null;
  note: string;
  assessor: string;
  rubric: DefenseRubric;
  status: 'active' | 'cancelled';
  changedAt: string;
  changedBy: string;
  reason: string;
}
/** Append-only revisions: the first revision is the original observation. */
export interface DefenseAssessment {
  id: string;
  playerId: string;
  createdAt: string;
  revisions: DefenseRevision[];
}
export type DefenseInput = Pick<
  DefenseRevision,
  'date' | 'situation' | 'observations' | 'error' | 'note' | 'assessor' | 'rubric'
>;
export const DEFAULT_DEFENSE_RUBRIC: DefenseRubric = {
  version: 'defense-checklist-trial-v1',
  success: 2,
  partial: 1,
  failure: 0,
};
export const DEFENSE_PRIMARY: Record<DefenseSituation, Ability[]> = {
  ground: ['G', 'A'],
  fly: ['F', 'A'],
  receive: ['C', 'B'],
  throw: ['A', 'L'],
  base: ['C', 'B'],
  combined: ['G', 'F', 'C', 'A', 'B'],
};

export interface DefenseEvaluationChoice {
  id: string;
  playerId: string;
  source: 'manual' | 'checklist';
  changedAt: string;
  changedBy: string;
}

export interface DefenseAssessmentDay {
  date: string;
  assessor: string;
  purpose: string;
  note: string;
  playerIds: string[];
  createdAt: string;
}
