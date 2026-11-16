import { expect, it } from 'vitest';
import { POSITIONS } from '../config/positions';
import { createDemoWorkspace } from '../data/seed';
import { createRandomEntries, type MatchEntryDrafts } from './randomEntry';
import { applyPositionPreferences, preferenceCounts } from './preferenceEntry';
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const empty = (): MatchEntryDrafts => ({
  away: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
  home: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
});
it('수비 점수 없이 각 포지션 희망 2명씩이면 두 팀 모두 1지망 10개를 맞춘다', () => {
  const ps = createDemoWorkspace().players.slice(0, 20);
  ps.forEach((p, i) => {
    p.pref1 = POSITIONS[i % 10];
  });
  const captains = { away: ps[0].id, home: ps[10].id };
  const current = createRandomEntries(
      ps,
      ps.map((p) => p.id),
      empty(),
      rng(1),
      captains,
    ),
    before = structuredClone({ ps, current });
  const result = applyPositionPreferences(ps, current, captains, true, rng(3));
  expect(preferenceCounts(ps, result)).toEqual({ first: 20, second: 0, unmatched: 0, unset: 0 });
  expect(result.away.lineup).toContain(ps[0].id);
  expect(result.home.lineup).toContain(ps[10].id);
  expect(new Set([...result.away.lineup, ...result.home.lineup]).size).toBe(20);
  expect({ ps, current }).toEqual(before);
});
it('1지망 수를 우선 유지하고 2지망을 활용하며 희망이 겹쳐도 모두 선발로 배치한다', () => {
  const ps = createDemoWorkspace().players.slice(0, 20);
  ps.forEach((p, i) => {
    p.pref1 = 'SS';
    p.pref2 = POSITIONS.filter((p) => p !== 'SS')[i % 9];
  });
  const seed = createRandomEntries(
    ps,
    ps.map((p) => p.id),
    empty(),
    rng(10),
  );
  const result = applyPositionPreferences(ps, seed, {}, true, rng(5));
  const count = preferenceCounts(ps, result);
  expect(count.first).toBe(2);
  expect(count.second).toBe(18);
  expect(new Set(Object.values(result.away.defense)).size).toBe(10);
});
it('균형 구성에서는 팀·선발·후보·타순을 유지하며 팀 안의 희망 배치만 바꾼다', () => {
  const ps = createDemoWorkspace().players;
  ps.forEach((p, i) => {
    p.pref1 = POSITIONS[i % 10];
  });
  const seed = createRandomEntries(
    ps,
    ps.map((p) => p.id),
    empty(),
    rng(10),
  );
  const result = applyPositionPreferences(ps, seed, {}, false, rng(5));
  for (const side of ['away', 'home'] as const) {
    expect(result[side].lineup).toEqual(seed[side].lineup);
    expect(result[side].assigned.slice().sort()).toEqual(seed[side].assigned.slice().sort());
    expect(result[side].status).toEqual(seed[side].status);
    expect(new Set(Object.values(result[side].defense)).size).toBe(10);
  }
});
it('미설정 선수를 낮은 점수나 미출전으로 취급하지 않고 무작위 남은 자리에 배정한다', () => {
  const ps = createDemoWorkspace().players,
    seed = createRandomEntries(
      ps,
      ps.map((p) => p.id),
      empty(),
      rng(8),
    );
  const a = applyPositionPreferences(ps, seed, {}, true, rng(9)),
    b = applyPositionPreferences(ps, seed, {}, true, rng(10));
  expect(preferenceCounts(ps, a).unset).toBe(20);
  expect([...a.away.lineup, ...a.home.lineup].sort()).toEqual(
    [...seed.away.lineup, ...seed.home.lineup].sort(),
  );
  for (const side of ['away', 'home'] as const)
    expect(Object.keys(a[side].status).filter((id) => a[side].status[id] === 'reserve')).toEqual(
      Object.keys(seed[side].status).filter((id) => seed[side].status[id] === 'reserve'),
    );
  expect(a.away.defense).not.toEqual(b.away.defense);
});
it('잘못된 선발·반대 팀 주장·중복 지망·출전 불가를 차단한다', () => {
  const ps = createDemoWorkspace().players,
    seed = createRandomEntries(
      ps,
      ps.map((p) => p.id),
      empty(),
      rng(8),
    );
  expect(() => applyPositionPreferences(ps, empty(), {}, true)).toThrow('10명');
  expect(() => applyPositionPreferences(ps, seed, { away: seed.home.lineup[0] }, true)).toThrow(
    '주장',
  );
  const p = ps.find((p) => p.id === seed.away.lineup[0])!;
  p.pref1 = 'SS';
  p.pref2 = 'SS';
  expect(() => applyPositionPreferences(ps, seed, {}, true)).toThrow('1·2지망');
  p.pref2 = null;
  p.active = false;
  expect(() => applyPositionPreferences(ps, seed, {}, true)).toThrow('출전');
});
