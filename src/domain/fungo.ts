export const FUNGO_KEYS = ['G', 'F', 'C', 'T_acc', 'T_pow'] as const;
export type FungoKey = (typeof FUNGO_KEYS)[number];
export const FUNGO_LABELS: Record<FungoKey, string> = {
  G: '땅볼 포구',
  F: '뜬공 포구',
  C: '1루 원바운드 포구·스쿱',
  T_acc: '송구 정확도',
  T_pow: '송구 강도·공 빼는 속도',
};
export type FungoScores = Record<FungoKey, number | null>;
export interface FungoBall {
  kind: 'G' | 'F' | 'C';
  catch: number | null;
  throw: number | null;
  power: number | null;
}
export interface FungoInput {
  date: string;
  assessor: string;
  mode: 'quick' | 'precise';
  balls: FungoBall[];
  manual: FungoScores;
  note: string;
}
export interface FungoRevision extends FungoInput {
  id: string;
  at: string;
  by: string;
  reason: string;
  status: 'active' | 'cancelled';
  version: 'fungo-five-v1';
}
export interface FungoAssessment {
  id: string;
  playerId: string;
  revisions: FungoRevision[];
}
export interface FungoDay {
  date: string;
  assessor: string;
  playerIds: string[];
}
export const blankFungoScores = (): FungoScores => ({
  G: null,
  F: null,
  C: null,
  T_acc: null,
  T_pow: null,
});
export const blankFungo = (date: string, assessor: string): FungoInput => ({
  date,
  assessor,
  mode: 'quick',
  balls: (['G', 'G', 'F', 'C', 'G'] as const).map((kind) => ({
    kind,
    catch: null,
    throw: null,
    power: null,
  })),
  manual: blankFungoScores(),
  note: '',
});
export function fungoScores(input: FungoInput): FungoScores {
  if (input.mode === 'precise') return { ...input.manual };
  const mean = (values: (number | null)[], max: number) => {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length ? (valid.reduce((s, v) => s + v, 0) / valid.length / max) * 10 : null;
  };
  return {
    G: mean(
      input.balls.filter((b) => b.kind === 'G').map((b) => b.catch),
      3,
    ),
    F: mean(
      input.balls.filter((b) => b.kind === 'F').map((b) => b.catch),
      3,
    ),
    C: mean(
      input.balls.filter((b) => b.kind === 'C').map((b) => b.catch),
      3,
    ),
    T_acc: mean(
      input.balls.map((b) => b.throw),
      3,
    ),
    T_pow: mean(
      input.balls.map((b) => b.power),
      10,
    ),
  };
}
