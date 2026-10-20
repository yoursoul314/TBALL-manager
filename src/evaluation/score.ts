import {
  ABILITIES,
  POSITIONS,
  POSITION_WEIGHTS,
  type Ability,
  type Position,
} from '../config/positions';
import type { EvaluationPolicy, Domain } from '../domain/model';

export function positionScore(
  abilities: Partial<Record<Ability, number>>,
  position: Position,
): number | null {
  const weights = POSITION_WEIGHTS[position];
  let sum = 0;
  for (let i = 0; i < ABILITIES.length; i++) {
    if (weights[i] === 0) continue;
    const value = abilities[ABILITIES[i]];
    if (value === undefined) return null;
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('능력 점수는 0~100');
    sum += (value * weights[i]) / 100;
  }
  return Math.round(sum * 100) / 100;
}
export function blend(
  skill: number | null,
  game: number | null,
  mix: { skill: number; game: number },
) {
  if (mix.skill + mix.game !== 100 || mix.skill < 0 || mix.game < 0)
    throw new Error('비율 합계는 100');
  if (skill === null || game === null) return null;
  if ([skill, game].some((n) => !Number.isFinite(n) || n < 0 || n > 100))
    throw new Error('점수는 0~100');
  return (skill * mix.skill + game * mix.game) / 100;
}
export function composite(scores: Record<Domain, number | null>, policy: EvaluationPolicy) {
  const weights = policy.domainWeights.value;
  if (
    Object.values(weights).some((n) => !Number.isFinite(n) || n < 0) ||
    Object.values(weights).reduce((a, b) => a + b, 0) !== 100
  )
    throw new Error('영역 비율 합계는 100');
  const entries = Object.entries(scores) as [Domain, number | null][];
  if (entries.some(([, n]) => n === null)) return { score: null, provisional: true };
  if (entries.some(([, n]) => !Number.isFinite(n) || n! < 0 || n! > 100))
    throw new Error('점수는 0~100');
  return {
    score: entries.reduce((sum, [key, n]) => sum + (n! * weights[key]) / 100, 0),
    provisional: Object.values(policy).some(
      (v) => typeof v === 'object' && 'status' in v && v.status === 'TODO',
    ),
  };
}
/** Exact maximum-weight assignment: O(players × positions × 2^positions).
 * Missing observations are not zero scores; those player/position edges are unavailable.
 */
export function recommendPositions(
  candidates: { playerId: string; abilities: Partial<Record<Ability, number>> }[],
) {
  if (new Set(candidates.map((c) => c.playerId)).size !== candidates.length)
    throw new Error('후보 선수 중복');
  type Solution = {
    total: number;
    assignments: { position: Position; playerId: string; score: number }[];
  };
  let dp = new Map<number, Solution>([[0, { total: 0, assignments: [] }]]);
  for (const candidate of candidates) {
    const next = new Map(dp);
    for (const [mask, solution] of dp) {
      POSITIONS.forEach((position, index) => {
        if (mask & (1 << index)) return;
        const score = positionScore(candidate.abilities, position);
        if (score === null) return;
        const newMask = mask | (1 << index);
        const total = solution.total + score;
        if (!next.has(newMask) || next.get(newMask)!.total < total) {
          next.set(newMask, {
            total,
            assignments: [
              ...solution.assignments,
              { position, playerId: candidate.playerId, score },
            ],
          });
        }
      });
    }
    dp = next;
  }
  return dp.get((1 << POSITIONS.length) - 1) ?? null;
}
