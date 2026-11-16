import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { POSITIONS } from '../config/positions';
import { assignEntryBatch, type EntryDraft } from './entryBatch';
import { createRandomEntries, randomEntryEligible, type MatchEntryDrafts } from './randomEntry';

const blank = (): EntryDraft => ({
  loaded: false,
  assigned: [],
  status: {},
  lineup: [],
  defense: {},
});
const entries = (): MatchEntryDrafts => ({ away: blank(), home: blank() });
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

it('20명을 양 팀 선발·타순·TYPE1 10포지션에 중복 없이 배치한다', () => {
  const players = createDemoWorkspace().players;
  const ids = players.slice(0, 20).map((p) => p.id);
  const result = createRandomEntries(players, ids, entries(), rng(17));
  for (const side of ['away', 'home'] as const) {
    expect(result[side].lineup).toHaveLength(10);
    expect(Object.keys(result[side].defense)).toEqual([...POSITIONS]);
    expect(Object.values(result[side].defense).sort()).toEqual([...result[side].lineup].sort());
    expect(result[side].assigned.every((id) => result[side].status[id] === 'starter')).toBe(true);
  }
  expect([...result.away.assigned, ...result.home.assigned].sort()).toEqual(ids.sort());
});

it('홀수 참가자와 교체 후보도 누락 없이 고르게 나누며 재추첨할 수 있다', () => {
  const players = createDemoWorkspace().players.slice(0, 23);
  const ids = players.map((p) => p.id);
  for (let seed = 1; seed <= 20; seed++) {
    const result = createRandomEntries(players, ids, entries(), rng(seed));
    expect(new Set([...result.away.assigned, ...result.home.assigned]).size).toBe(23);
    expect(Math.abs(result.away.assigned.length - result.home.assigned.length)).toBe(1);
    expect(
      [...Object.values(result.away.status), ...Object.values(result.home.status)].filter(
        (s) => s === 'reserve',
      ),
    ).toHaveLength(3);
    expect(result.away.lineup).toHaveLength(10);
    expect(result.home.lineup).toHaveLength(10);
  }
  expect(createRandomEntries(players, ids, entries(), rng(1)).away.lineup).not.toEqual(
    createRandomEntries(players, ids, entries(), rng(20)).away.lineup,
  );
});

it('중복 선택은 한 명으로 계산하며 20명 미만이면 기존 편성을 그대로 둔다', () => {
  const players = createDemoWorkspace().players;
  const current = entries();
  const ids = players.slice(0, 19).map((p) => p.id);
  expect(() => createRandomEntries(players, [...ids, ids[0]], current)).toThrow('20명');
  expect(current).toEqual(entries());
  const valid = players.slice(0, 20).map((p) => p.id);
  const next = createRandomEntries(players, [...valid, valid[0]], current, rng(3));
  expect([...next.away.assigned, ...next.home.assigned]).toHaveLength(20);
});

it('삭제·출전 불가·결석·존재하지 않는 학생을 검증해 전체 적용을 차단한다', () => {
  for (const reason of ['archived', 'inactive', 'absent', 'unavailable', 'missing']) {
    const players = createDemoWorkspace().players;
    const current = entries();
    const id = players[0].id;
    const ids = players.slice(0, 20).map((p) => p.id);
    if (reason === 'archived') players[0].archivedAt = '2026-11-16T00:00:00Z';
    if (reason === 'inactive') players[0].active = false;
    if (reason === 'absent' || reason === 'unavailable') current.home.status[id] = reason;
    if (reason === 'missing') ids[0] = 'missing';
    if (reason !== 'missing') expect(randomEntryEligible(players[0], current)).toBe(false);
    const snapshot = structuredClone(current);
    expect(() => createRandomEntries(players, ids, current)).toThrow('삭제·결석·출전 불가');
    expect(current).toEqual(snapshot);
  }
});

it('기존 결석·미출전은 보존하고 선택한 선수의 양 팀 중복과 이전 수비 배치를 제거한다', () => {
  const data = createDemoWorkspace();
  const current = entries();
  current.away = assignEntryBatch(
    current.away,
    ['green-1', 'green-2'],
    'starter',
    data.players,
    [],
  );
  current.away.defense = { SS: 'green-1' };
  current.home = assignEntryBatch(current.home, ['orange-12'], 'absent', data.players, []);
  current.home = assignEntryBatch(current.home, ['orange-11'], 'reserve', data.players, []);
  const before = structuredClone({ data, current });
  const ids = data.players
    .filter((p) => !['green-1', 'orange-11', 'orange-12'].includes(p.id))
    .map((p) => p.id);
  const result = createRandomEntries(data.players, ids, current, rng(15));
  expect(result.away.status['green-1']).toBe('not-playing');
  expect(result.home.status['orange-11']).toBe('not-playing');
  expect(result.home.status['orange-12']).toBe('absent');
  const assigned = [...result.away.assigned, ...result.home.assigned];
  expect(new Set(assigned).size).toBe(assigned.length);
  expect({ data, current }).toEqual(before);
  expect([
    ...Object.values(result.away.defense),
    ...Object.values(result.home.defense),
  ]).not.toContain('green-1');
});
