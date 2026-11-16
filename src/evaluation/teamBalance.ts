import { ABILITIES } from '../config/positions';
import { summarizeBatting } from '../assessment/battingSummary';
import { latestFungo } from '../assessment/fungo';
import { FUNGO_KEYS } from '../domain/fungo';
import type { Player, Side, Workspace } from '../domain/model';
import {
  buildEntryDrafts,
  createRandomEntries,
  validateCompositionPool,
  type MatchEntryDrafts,
  type EntryCaptains,
} from '../domain/randomEntry';
import { defenseEvaluation } from './defense';

export type BalanceDefenseSource = 'nine' | 'fungo';
export interface BalanceProfile {
  id: string;
  batting: number | null;
  defense: number | null;
  note: string;
}
export function balanceProfiles(
  data: Workspace,
  defenseSource: BalanceDefenseSource,
): BalanceProfile[] {
  return data.players
    .filter((p) => !p.archivedAt)
    .map((p) => {
      const batting = summarizeBatting(data, p.id);
      const defense = defenseEvaluation(data, p.id);
      const fungo = defenseSource === 'fungo' ? latestFungo(data, p.id).scores : null;
      const values =
        defenseSource === 'fungo'
          ? FUNGO_KEYS.map((key) => fungo![key])
          : ABILITIES.map((key) => defense.abilities[key] ?? null);
      const complete = values.every((v) => v !== null && Number.isFinite(v));
      return {
        id: p.id,
        batting: batting.selectedScore,
        defense: complete
          ? (values.reduce<number>((s, v) => s + v!, 0) / values.length) *
            (defenseSource === 'fungo' ? 10 : 1)
          : null,
        note: [
          data.battingSettings.scoreSource === 'legacy'
            ? '이전 수동 타격'
            : `${batting.rubric} · ${batting.count}회${batting.provisional ? ' · 진행 중' : ''}`,
          defenseSource === 'fungo'
            ? '최근 유효 펑고 5항목'
            : defense.source === 'manual'
              ? '수동 수비 9항목'
              : '체크리스트 수비 9항목',
          !complete ? '수비 항목 미완료' : '',
        ]
          .filter(Boolean)
          .join(' / '),
      };
    });
}
export function teamScoreSummary(ids: string[], profiles: BalanceProfile[]) {
  const rows = [...new Set(ids)].map((id) => profiles.find((p) => p.id === id));
  const metric = (key: 'batting' | 'defense') => {
    const values = rows.map((p) => p?.[key] ?? null).filter((v): v is number => v !== null);
    return {
      mean: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
      count: values.length,
      missing: rows.length - values.length,
    };
  };
  return { size: rows.length, batting: metric('batting'), defense: metric('defense') };
}

// Each scope stores batting sum/count and defense sum/count. Missing values never enter sums.
type Totals = number[][];
type Slot = { id: string; side: Side; starter: boolean };
function contribute(totals: Totals, slot: Slot, profile: BalanceProfile, sign: number) {
  const side = slot.side === 'away' ? 0 : 1;
  for (const scope of slot.starter ? [side, side + 2] : [side]) {
    for (const [k, value] of [profile.batting, profile.defense].entries()) {
      if (value === null) continue;
      totals[scope][k * 2] += sign * value;
      totals[scope][k * 2 + 1] += sign;
    }
  }
}
/** Lexicographic objective: balance observation coverage first, then independent mean gaps.
 * Both full rosters and starting tens matter. No student composite score is created. */
function objective(totals: Totals, sizes: number[]): [number, number] {
  let coverage = 0,
    gap = 0;
  for (const start of [0, 2])
    for (const k of [0, 2]) {
      const a = totals[start],
        b = totals[start + 1];
      coverage += Math.abs(a[k + 1] / sizes[start] - b[k + 1] / sizes[start + 1]);
      if (a[k + 1] && b[k + 1]) gap += Math.abs(a[k] / a[k + 1] - b[k] / b[k + 1]);
    }
  return [coverage, gap];
}
const better = (a: [number, number], b: [number, number]) =>
  a[0] < b[0] - 1e-9 || (Math.abs(a[0] - b[0]) < 1e-9 && a[1] < b[1] - 1e-9);

export function createBalancedEntries(
  players: Player[],
  selected: string[],
  current: MatchEntryDrafts,
  profiles: BalanceProfile[],
  random: () => number = Math.random,
  captains: EntryCaptains = {},
): MatchEntryDrafts {
  const ids = validateCompositionPool(players, selected, current, captains);
  const fixed = new Set(Object.values(captains).filter(Boolean));
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const id of ids) {
    const row = byId.get(id);
    if (
      !row ||
      [row.batting, row.defense].some(
        (v) => v !== null && (!Number.isFinite(v) || v < 0 || v > 100),
      )
    )
      throw new Error('균형 구성에 사용할 평가 점수를 확인하세요');
  }
  if (!ids.some((id) => byId.get(id)!.batting !== null || byId.get(id)!.defense !== null))
    throw new Error(
      '선택한 학생의 유효 평가 점수가 없습니다. 평가 출처를 확인하거나 단순 랜덤을 사용하세요',
    );
  let bestSlots: Slot[] = [],
    bestObjective: [number, number] = [Infinity, Infinity];
  // Bounded multi-start pair exchanges; heuristic, not a claim of a globally optimal team.
  for (let attempt = 0; attempt < 3; attempt++) {
    const seed = createRandomEntries(players, ids, current, random, captains);
    const slots: Slot[] = (['away', 'home'] as const).flatMap((side) =>
      seed[side].assigned
        .filter((id) => ids.includes(id))
        .map((id) => ({ id, side, starter: seed[side].status[id] === 'starter' })),
    );
    let totals: Totals = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const sizes = [
      slots.filter((s) => s.side === 'away').length,
      slots.filter((s) => s.side === 'home').length,
      10,
      10,
    ];
    for (const slot of slots) contribute(totals, slot, byId.get(slot.id)!, 1);
    let score = objective(totals, sizes);
    for (let pass = 0; pass < 16; pass++) {
      let winner: { i: number; j: number; totals: Totals; score: [number, number] } | null = null;
      const evaluate = (i: number, j: number) => {
        const a = slots[i],
          b = slots[j];
        if (
          i === j ||
          fixed.has(a.id) ||
          fixed.has(b.id) ||
          (a.side === b.side && a.starter === b.starter)
        )
          return;
        const next = totals.map((v) => [...v]);
        contribute(next, a, byId.get(a.id)!, -1);
        contribute(next, b, byId.get(b.id)!, -1);
        contribute(next, a, byId.get(b.id)!, 1);
        contribute(next, b, byId.get(a.id)!, 1);
        const candidate = objective(next, sizes);
        if (better(candidate, winner?.score ?? score))
          winner = { i, j, totals: next, score: candidate };
      };
      if (slots.length <= 80) {
        for (let i = 0; i < slots.length; i++)
          for (let j = i + 1; j < slots.length; j++) evaluate(i, j);
      } else {
        for (let pair = 0; pair < 3200; pair++)
          evaluate(Math.floor(random() * slots.length), Math.floor(random() * slots.length));
      }
      if (!winner) break;
      const chosen = winner as { i: number; j: number; totals: Totals; score: [number, number] };
      [slots[chosen.i].id, slots[chosen.j].id] = [slots[chosen.j].id, slots[chosen.i].id];
      totals = chosen.totals;
      score = chosen.score;
    }
    if (better(score, bestObjective)) {
      bestObjective = score;
      bestSlots = slots;
    }
  }
  const assigned = Object.fromEntries(
    (['away', 'home'] as const).map((side) => [
      side,
      bestSlots
        .filter((s) => s.side === side)
        .sort((a, b) => Number(b.starter) - Number(a.starter))
        .map((s) => s.id),
    ]),
  ) as Record<Side, string[]>;
  return buildEntryDrafts(players, assigned, current, random);
}
