import { expect, it } from 'vitest';
import { assignTeamSlot } from './entrySlots';
import { createDemoWorkspace } from '../data/seed';
import type { MatchEntryDrafts } from './randomEntry';
const empty = (): MatchEntryDrafts => ({
  away: { loaded: false, assigned: [], lineup: [], status: {}, defense: {} },
  home: { loaded: false, assigned: [], lineup: [], status: {}, defense: {} },
});
it('여러 명을 선택한 팀에 선발 10명·나머지 후보로 넣고 중복 클릭을 방지한다', () => {
  const players = createDemoWorkspace().players,
    current = empty(),
    ids = players.slice(0, 12).map((p) => p.id);
  const result = assignTeamSlot(current, [...ids, ids[0]], 'home', players);
  expect(result.home.lineup).toHaveLength(10);
  expect(result.home.assigned).toHaveLength(12);
  expect(Object.values(result.home.status).filter((s) => s === 'reserve')).toHaveLength(2);
  expect(assignTeamSlot(result, ids, 'home', players)).toEqual(result);
  expect(current).toEqual(empty());
});
it('다른 팀으로 이동하면 원래 타순·수비에서 제거하고 양 팀 중복을 남기지 않는다', () => {
  const players = createDemoWorkspace().players;
  const current = assignTeamSlot(empty(), ['green-1', 'green-2'], 'away', players);
  current.away.defense = { '1B': 'green-1', SS: 'green-2' };
  const before = structuredClone(current),
    result = assignTeamSlot(current, ['green-1'], 'home', players);
  expect(result.away.lineup).toEqual(['green-2']);
  expect(result.away.defense).toEqual({ SS: 'green-2' });
  expect(result.away.status['green-1']).toBeUndefined();
  expect(result.home.lineup).toEqual(['green-1']);
  expect(current).toEqual(before);
});
it('빈 선택·삭제·결석·출전 불가가 섞이면 부분 배정 없이 거절한다', () => {
  const players = createDemoWorkspace().players,
    current = empty();
  expect(() => assignTeamSlot(current, [], 'home', players)).toThrow('선택');
  for (const blocked of ['inactive', 'archived', 'absent', 'unavailable']) {
    const ps = structuredClone(players),
      d = empty();
    if (blocked === 'inactive') ps[1].active = false;
    if (blocked === 'archived') ps[1].archivedAt = '2026-11-16T00:00:00Z';
    if (blocked === 'absent' || blocked === 'unavailable') d.away.status[ps[1].id] = blocked;
    const before = structuredClone(d);
    expect(() => assignTeamSlot(d, [ps[0].id, ps[1].id], 'home', ps)).toThrow('빠른 배정');
    expect(d).toEqual(before);
  }
});
