import { expect, it } from 'vitest';
import { game, record } from '../test/fixtures';
import { quickOutcomes, quickDefenseSteps } from './quickPlays';
import { projectDefenseSequence } from './defenseSequence';
import { calculateStats } from '../statistics/calculate';
import { DEFAULT_POLICY } from '../config/evaluation';
const setup = () => {
  const r = record();
  r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '1B': 'h2', '2B': 'h3' } });
  return r;
};
it('땅볼 6-3 빠른 연결은 보살·자살·관찰을 각각 한 번 기록', () => {
  const r = setup(),
    state = r.add({ type: 'START_PLAY' }),
    steps = quickDefenseSteps(state, 'ground', { first: 'SS', finish: '1B' }),
    p = projectDefenseSequence(state, steps);
  r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'out',
    direction: null,
    quality: 'ground',
    fielding: p.fielding,
    details: p.details,
    outcomes: quickOutcomes(state, 'ground'),
    defenseSequence: steps,
  });
  const stats = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(stats.find((s) => s.playerId === 'h1')).toMatchObject({
    assists: 1,
    putouts: 0,
    fieldingTypes: { G: 1, A: 1 },
  });
  expect(stats.find((s) => s.playerId === 'h2')).toMatchObject({
    assists: 0,
    putouts: 1,
    fieldingTypes: { C: 1, B: 1 },
  });
  expect(stats.find((s) => s.playerId === 'a1')).toMatchObject({
    pa: 1,
    hits: 0,
    runningOuts: 1,
    rbi: 0,
  });
});
it('6-4-3 병살은 두 주자의 아웃과 각각의 자살·보살을 연결', () => {
  const r = setup();
  r.hit();
  const state = r.add({ type: 'START_PLAY' }),
    steps = quickDefenseSteps(state, 'double', { first: 'SS', relay: '2B', finish: '1B' }),
    p = projectDefenseSequence(state, steps);
  const end = r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'out',
    direction: null,
    quality: 'ground',
    fielding: p.fielding,
    details: p.details,
    outcomes: quickOutcomes(state, 'double'),
    defenseSequence: steps,
  });
  expect(end.bases.away).toEqual({});
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((s) => s.playerId === 'h1')).toMatchObject({ assists: 1, putouts: 0 });
  expect(rows.find((s) => s.playerId === 'h3')).toMatchObject({ assists: 1, putouts: 1 });
  expect(rows.find((s) => s.playerId === 'h2')).toMatchObject({ assists: 0, putouts: 1 });
});
it('단독 땅볼 아웃·뜬공 아웃은 존재하지 않는 송구나 보살을 만들지 않는다', () => {
  const r = setup(),
    state = r.add({ type: 'START_PLAY' });
  const own = quickDefenseSteps(state, 'ground', { first: '1B', finish: '1B' });
  expect(own.map((s) => s.action)).toEqual(['ground-catch', 'force-out']);
  const fly = quickDefenseSteps(state, 'fly', { first: 'SS' });
  expect(fly).toHaveLength(1);
  expect(projectDefenseSequence(state, fly).fielding[0]).toMatchObject({
    skill: 'F',
    success: true,
  });
  expect(() => quickDefenseSteps(state, 'ground', { first: 'LF', finish: '1B' })).toThrow(
    '실제 배치',
  );
  expect(() => quickOutcomes(state, 'double')).toThrow('1루 주자');
});
it('마지막 타자 1루 포스아웃은 빠른 병살에서도 RULE02 잔루 복구를 유지', () => {
  const r = setup();
  r.strikeout();
  r.hit();
  const state = r.add({ type: 'START_PLAY' }),
    steps = quickDefenseSteps(state, 'double', { first: 'SS', relay: '2B', finish: '1B' }),
    p = projectDefenseSequence(state, steps);
  const end = r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'out',
    direction: null,
    quality: 'ground',
    fielding: p.fielding,
    details: p.details,
    outcomes: quickOutcomes(state, 'double'),
    defenseSequence: steps,
  });
  expect(end.side).toBe('home');
  expect(end.bases.away).toEqual(state.live!.bases);
});
