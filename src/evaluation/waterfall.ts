import type { Player, Workspace, Selection } from '../domain/model';
import type { FungoScores } from '../domain/fungo';
import { FUNGO_KEYS } from '../domain/fungo';
import { POSITION_LABELS, type Position } from '../config/positions';
import { latestFungo } from '../assessment/fungo';
import { summarizeBatting } from '../assessment/battingSummary';
import { QUALITY_RUBRIC } from '../config/battingQuality';
import { defenseEvaluation } from './defense';
import { positionScore } from './score';
export interface WaterfallCandidate {
  player: Pick<Player, 'id' | 'name' | 'pref1' | 'pref2'>;
  scores: FungoScores;
  batting: number | null;
  pitcher: number | null;
}
export const WATERFALL_ORDER: Position[] = [
  '1B',
  'SS',
  '3B',
  'CF1',
  'LF',
  'CF2',
  '2B',
  'RF',
  'HP',
  'P',
];
export function waterfallScore(c: WaterfallCandidate, p: Position) {
  const { G, F, C, T_acc, T_pow } = c.scores,
    B = c.batting;
  const terms: Record<Position, [number | null, number][]> = {
    SS: [
      [G, 3.5],
      [T_pow, 3.5],
      [T_acc, 3],
    ],
    '3B': [
      [G, 3.5],
      [T_pow, 3.5],
      [T_acc, 3],
    ],
    '1B': [
      [C, 6],
      [G, 2.5],
      [F, 1.5],
    ],
    '2B': [
      [G, 4.5],
      [T_acc, 3.5],
      [F, 1],
      [T_pow, 1],
    ],
    LF: [
      [F, 5],
      [T_pow, 2.5],
      [G, 1.5],
      [T_acc, 1],
    ],
    CF1: [
      [F, 5],
      [T_pow, 2.5],
      [G, 1.5],
      [T_acc, 1],
    ],
    CF2: [
      [F, 5],
      [T_pow, 2.5],
      [G, 1.5],
      [T_acc, 1],
    ],
    RF: [
      [F, 3.5],
      [G, 2.5],
      [T_acc, 2],
      [B, 2],
    ],
    HP: [
      [C, 4],
      [G, 2],
      [T_acc, 1.5],
      [B, 2.5],
    ],
    P: [[c.pitcher, 1]],
  };
  if (terms[p].some(([v]) => v === null)) return null;
  const base = terms[p].reduce((sum, [v, w]) => sum + v! * w, 0);
  // P uses the existing TYPE1 v2.0 score, without a newly invented P formula.
  const bonus = c.player.pref1 === p ? 5 : c.player.pref2 === p ? 3 : 0;
  const penalty =
    (p === 'SS' || p === '3B') && (G! < 7 || T_acc! < 7)
      ? 30
      : p === '1B' && C! < 8
        ? 30
        : ['CF1', 'LF', 'CF2'].includes(p) && F! < 6
          ? 20
          : 0;
  return { base, bonus, penalty, score: base + bonus - penalty };
}
export function waterfallCandidates(data: Workspace): WaterfallCandidate[] {
  return data.players
    .filter((p) => p.active && !p.archivedAt)
    .map((player) => ({
      player,
      scores: latestFungo(data, player.id).scores,
      batting: summarizeBatting(data, player.id, { rubric: QUALITY_RUBRIC }).batting10,
      pitcher: positionScore(defenseEvaluation(data, player.id).abilities, 'P'),
    }));
}
export function recommendWaterfall(candidates: WaterfallCandidate[]) {
  if (new Set(candidates.map((c) => c.player.id)).size !== candidates.length)
    throw Error('후보 선수 중복');
  for (const c of candidates) {
    if (
      [...FUNGO_KEYS.map((k) => c.scores[k]), c.batting].some(
        (v) => v !== null && (!Number.isFinite(v) || v < 0 || v > 10),
      ) ||
      (c.pitcher !== null && (!Number.isFinite(c.pitcher) || c.pitcher < 0 || c.pitcher > 100))
    )
      throw Error('평가 점수 범위를 확인하세요');
    if (c.player.pref1 && c.player.pref1 === c.player.pref2) throw Error('1·2지망 중복');
  }
  const ranked = (p: Position, pool: WaterfallCandidate[]) =>
    pool
      .flatMap((c) => {
        const score = waterfallScore(c, p);
        return score ? [{ c, ...score }] : [];
      })
      .sort((a, b) => b.score - a.score || a.c.player.id.localeCompare(b.c.player.id));
  // Two infield slots: reserve only the strongest two eligible aces before 1B.
  const aces = candidates
    .map((c) => ({
      c,
      score: Math.max(
        waterfallScore(c, 'SS')?.score ?? -Infinity,
        waterfallScore(c, '3B')?.score ?? -Infinity,
      ),
    }))
    .filter((v) => v.score >= 80)
    .sort((a, b) => b.score - a.score || a.c.player.id.localeCompare(b.c.player.id))
    .slice(0, 2)
    .map((v) => v.c.player.id);
  const used = new Set<string>(),
    assignments: Selection['assignments'] = [],
    feedback: NonNullable<Selection['waterfall']>['feedback'] = [],
    vacancies: Position[] = [];
  for (const position of WATERFALL_ORDER) {
    const available = candidates.filter(
      (c) => !used.has(c.player.id) && !(position === '1B' && aces.includes(c.player.id)),
    );
    const best = ranked(position, available)[0];
    if (!best) {
      vacancies.push(position);
      continue;
    }
    const { c, score, base, bonus, penalty } = best;
    used.add(c.player.id);
    assignments.push({ playerId: c.player.id, position, score });
    const pref = c.player.pref1 ? POSITION_LABELS[c.player.pref1] : '미설정';
    const evidence =
      position === 'P'
        ? '기존 9능력 TYPE1 v2.0 가중점수'
        : FUNGO_KEYS.filter((k) => c.scores[k] !== null)
            .map((k) => k + ' ' + c.scores[k]!.toFixed(1))
            .join(' · ') + (c.batting === null ? '' : ' · 타격 B ' + c.batting.toFixed(1));
    const scoopRank =
      position === '1B'
        ? 1 +
          candidates.filter((other) => other.scores.C !== null && other.scores.C > c.scores.C!)
            .length
        : null;
    const text =
      c.player.name +
      ' 학생의 1지망은 ' +
      pref +
      '입니다. ' +
      (scoopRank === null ? '' : '스쿱 C는 후보 중 공동 ' + scoopRank + '위입니다. ') +
      evidence +
      '. ' +
      (aces.includes(c.player.id) && (position === 'SS' || position === '3B')
        ? '내야 적합도 80점 이상 상위 2명으로 내야를 우선 배정했습니다. '
        : '') +
      '배정 순서상 남은 측정 후보 중 ' +
      POSITION_LABELS[position] +
      ' 점수가 가장 높아 제안합니다. 기본 ' +
      base.toFixed(1) +
      ' + 희망 ' +
      bonus +
      ' − 기준 감점 ' +
      penalty +
      ' = ' +
      score.toFixed(1) +
      '점. 동점은 고유 ID 순이며 능력 차이를 뜻하지 않습니다. 감독 확인 후 조정할 수 있습니다.';
    feedback.push({ playerId: c.player.id, position, text, base, bonus, penalty });
  }
  return {
    assignments,
    feedback,
    vacancies,
    candidateIds: candidates.map((c) => c.player.id).sort((a, b) => a.localeCompare(b)),
    protectedAces: aces,
  };
}
