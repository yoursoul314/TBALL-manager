import type { Player, Side } from './model';
import { randomEntryEligible, type MatchEntryDrafts } from './randomEntry';

/** Validate all moves before making an immutable, cross-team transfer. */
export function assignTeamSlot(
  current: MatchEntryDrafts,
  selected: string[],
  target: Side,
  players: Player[],
): MatchEntryDrafts {
  const ids = [...new Set(selected)];
  if (!ids.length) throw new Error('팀에 배정할 학생을 선택하세요');
  for (const id of ids) {
    const player = players.find((p) => p.id === id);
    if (!player || !randomEntryEligible(player, current))
      throw new Error(
        '삭제·결석·출전 불가 학생은 빠른 배정에 포함할 수 없습니다. 경기 상태를 먼저 확인하세요',
      );
  }
  const next = structuredClone(current);
  const other = target === 'away' ? 'home' : 'away';
  next[other].assigned = next[other].assigned.filter((id) => !ids.includes(id));
  next[other].lineup = next[other].lineup.filter((id) => !ids.includes(id));
  for (const id of ids) delete next[other].status[id];
  next[other].defense = Object.fromEntries(
    Object.entries(next[other].defense).filter(([, id]) => !ids.includes(id!)),
  );
  next[target].loaded = true;
  for (const id of ids) {
    if (!next[target].assigned.includes(id)) next[target].assigned.push(id);
    if (['starter', 'reserve'].includes(next[target].status[id])) continue;
    const starter = next[target].lineup.length < 10;
    next[target].status[id] = starter ? 'starter' : 'reserve';
    if (starter) next[target].lineup.push(id);
  }
  return next;
}
