import { POSITIONS, type Position } from '../config/positions';
import type { Player } from './model';
import { shuffled, type EntryCaptains, type MatchEntryDrafts } from './randomEntry';

/** Rectangular Hungarian assignment. Rows <= columns; minimizes total cost. */
function match(cost: number[][]): number[] {
  const n = cost.length,
    m = cost[0].length;
  const u = Array(n + 1).fill(0),
    v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0),
    way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array(m + 1).fill(Infinity),
      used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const current = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (current < min[j]) {
            min[j] = current;
            way[j] = j0;
          }
          if (min[j] < delta) {
            delta = min[j];
            j1 = j;
          }
        }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else min[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const assigned = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) assigned[p[j] - 1] = j - 1;
  return assigned;
}

/** Only wishes are used. Never read batting/defense scores or alter starters/reserves selection.
 * Random mode may move starters between teams; balanced mode locks existing team membership.
 * 21 encodes lexicographic first-choice count then second-choice count for 20 slots, not grades. */
export function applyPositionPreferences(
  players: Player[],
  current: MatchEntryDrafts,
  captains: EntryCaptains,
  allowTeamMoves: boolean,
  random: () => number = Math.random,
): MatchEntryDrafts {
  const ids = [...current.away.lineup, ...current.home.lineup];
  if (ids.length !== 20 || current.away.lineup.length !== 10 || new Set(ids).size !== 20)
    throw new Error('희망 포지션 배정에는 중복 없는 양 팀 선발 10명씩이 필요합니다');
  const candidates = shuffled(
    ids.map((id) => {
      const p = players.find((p) => p.id === id);
      if (!p || p.archivedAt || !p.active)
        throw new Error('출전 가능한 선발 선수만 배정할 수 있습니다');
      if (p.pref1 && p.pref1 === p.pref2) throw new Error('1·2지망 포지션은 다르게 선택하세요');
      return p;
    }),
    random,
  );
  for (const side of ['away', 'home'] as const)
    if (captains[side] && !current[side].lineup.includes(captains[side]!))
      throw new Error('주장은 지정된 팀의 선발에 포함되어야 합니다');
  const slots = shuffled(
    (['away', 'home'] as const).flatMap((side) =>
      POSITIONS.map((position) => ({ side, position })),
    ),
    random,
  );
  const forbidden = 100000;
  const cost = slots.map(({ side, position }) =>
    candidates.map((p) => {
      if (
        (!allowTeamMoves && !current[side].lineup.includes(p.id)) ||
        captains[side === 'away' ? 'home' : 'away'] === p.id
      )
        return forbidden;
      return p.pref1 === position ? -21 : p.pref2 === position ? -1 : 0;
    }),
  );
  const matching = match(cost);
  const next = structuredClone(current);
  for (const side of ['away', 'home'] as const) {
    const placements = slots.flatMap((slot, i) => {
      if (cost[i][matching[i]] === forbidden)
        throw new Error('주장·팀 조건에 맞는 수비 편성을 만들 수 없습니다');
      return slot.side === side
        ? [{ position: slot.position, id: candidates[matching[i]].id }]
        : [];
    });
    const newIds = placements.map((a) => a.id);
    const kept = current[side].assigned.filter((id) => !ids.includes(id));
    next[side] = {
      ...current[side],
      assigned: [...kept, ...newIds],
      status: {
        ...Object.fromEntries(kept.map((id) => [id, current[side].status[id]])),
        ...Object.fromEntries(newIds.map((id) => [id, 'starter' as const])),
      },
      lineup: [
        ...current[side].lineup.filter((id) => newIds.includes(id)),
        ...newIds.filter((id) => !current[side].lineup.includes(id)),
      ],
      defense: Object.fromEntries(placements.map((a) => [a.position, a.id])),
    };
  }
  return next;
}

export function preferenceCounts(players: Player[], entries: MatchEntryDrafts) {
  const count = { first: 0, second: 0, unmatched: 0, unset: 0 };
  for (const side of ['away', 'home'] as const)
    for (const id of entries[side].lineup) {
      const p = players.find((p) => p.id === id);
      const position = Object.entries(entries[side].defense).find(([, who]) => who === id)?.[0] as
        | Position
        | undefined;
      if (!p?.pref1 && !p?.pref2) count.unset++;
      else if (position && p?.pref1 === position) count.first++;
      else if (position && p?.pref2 === position) count.second++;
      else count.unmatched++;
    }
  return count;
}
