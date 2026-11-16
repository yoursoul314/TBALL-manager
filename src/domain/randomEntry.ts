import { POSITIONS } from '../config/positions';
import type { EntryDraft } from './entryBatch';
import type { Player, Side } from './model';

export type MatchEntryDrafts = Record<Side, EntryDraft>;
export type EntryCaptains = Partial<Record<Side, string>>;

export function randomEntryEligible(player: Player, entries: MatchEntryDrafts): boolean {
  return (
    player.active &&
    !player.archivedAt &&
    !(['away', 'home'] as const).some((side) =>
      ['absent', 'unavailable'].includes(entries[side].status[player.id]),
    )
  );
}

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Creates an editable draft only. Never changes players, saved games, or approval. */
export function validateCompositionPool(
  players: Player[],
  selectedIds: string[],
  current: MatchEntryDrafts,
  captains: EntryCaptains = {},
): string[] {
  const fixed = Object.values(captains).filter(Boolean);
  if (new Set(fixed).size !== fixed.length)
    throw new Error('같은 학생을 양 팀 주장으로 지정할 수 없습니다');
  const ids = [...new Set([...fixed, ...selectedIds])];
  if (ids.length < 20)
    throw new Error('양 팀 선발 10명씩 구성하려면 출전 가능한 학생을 20명 이상 선택하세요');
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const id of ids) {
    const player = byId.get(id);
    if (!player || !randomEntryEligible(player, current))
      throw new Error('삭제·결석·출전 불가 학생은 랜덤 구성에 포함할 수 없습니다');
  }
  return ids;
}

export function createRandomEntries(
  players: Player[],
  selectedIds: string[],
  current: MatchEntryDrafts,
  random: () => number = Math.random,
  captains: EntryCaptains = {},
): MatchEntryDrafts {
  const ids = validateCompositionPool(players, selectedIds, current, captains);
  const pool = shuffled(
    ids.filter((id) => !Object.values(captains).includes(id)),
    random,
  );
  // Randomize which side receives an odd reserve; no fixed advantage for the away team.
  const first: Side = random() < 0.5 ? 'away' : 'home';
  const assigned: Record<Side, string[]> = {
    away: captains.away ? [captains.away] : [],
    home: captains.home ? [captains.home] : [],
  };
  for (const id of pool) {
    const side =
      assigned.away.length === assigned.home.length
        ? first
        : assigned.away.length < assigned.home.length
          ? 'away'
          : 'home';
    assigned[side].push(id);
  }
  // Captain is a starter, but has no automatic priority in the batting order.
  if (Object.values(captains).some(Boolean)) {
    for (const side of ['away', 'home'] as const)
      assigned[side] = [
        ...shuffled(assigned[side].slice(0, 10), random),
        ...assigned[side].slice(10),
      ];
  }
  return buildEntryDrafts(players, assigned, current, random);
}

/** First ten IDs on each side are starters, remaining IDs are reserves. */
export function buildEntryDrafts(
  players: Player[],
  assigned: Record<Side, string[]>,
  current: MatchEntryDrafts,
  random: () => number,
): MatchEntryDrafts {
  const ids = [...assigned.away, ...assigned.home];
  const byId = new Map(players.map((p) => [p.id, p]));
  const result = {} as MatchEntryDrafts;
  for (const side of ['away', 'home'] as const) {
    const lineup = assigned[side].slice(0, 10);
    const positions = shuffled(lineup, random);
    const kept = current[side].assigned.filter(
      (id) => !ids.includes(id) && byId.has(id) && !byId.get(id)!.archivedAt,
    );
    result[side] = {
      loaded: true,
      assigned: [...kept, ...assigned[side]],
      status: {
        ...Object.fromEntries(
          kept.map((id) => [
            id,
            !byId.get(id)!.active
              ? 'unavailable'
              : ['absent', 'unavailable'].includes(current[side].status[id])
                ? current[side].status[id]
                : 'not-playing',
          ]),
        ),
        ...Object.fromEntries(assigned[side].map((id, i) => [id, i < 10 ? 'starter' : 'reserve'])),
      },
      lineup,
      defense: Object.fromEntries(POSITIONS.map((position, i) => [position, positions[i]])),
    };
  }
  return result;
}
