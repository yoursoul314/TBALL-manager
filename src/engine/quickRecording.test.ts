import { expect, it } from 'vitest';
import { game, record } from '../test/fixtures';
import { suggestOutcomes, confirmationError } from './recording';
import { replayGame, scoreboard } from './game';
import { calculateStats } from '../statistics/calculate';
import { createDemoWorkspace } from '../data/seed';
it('2루타 이동은 제안일 뿐 상태를 바꾸지 않고 주자 전원 확인이 필요하다', () => {
  const r = record();
  r.hit();
  const state = r.add({ type: 'START_PLAY' }),
    before = structuredClone(state);
  const outcomes = suggestOutcomes(state, 'double');
  expect(state).toEqual(before);
  expect(outcomes).toEqual([
    { playerId: 'a1', to: 3, action: 'advance' },
    { playerId: 'a2', to: 2, action: 'advance' },
  ]);
  expect(confirmationError(outcomes, ['a1', 'a2'], ['a2'], true)).toContain('모든 주자');
  expect(confirmationError(outcomes, ['a1', 'a2'], ['a1', 'a2'], false)).toContain('심판');
  expect(confirmationError(outcomes, ['a1', 'a2'], ['a1', 'a2'], true)).toBeNull();
});
it('주자 누락·중복·베이스 충돌·아웃 판정 누락을 차단한다', () => {
  const one = { playerId: 'a1', to: 1 as const, action: 'advance' as const };
  expect(confirmationError([one], ['a1', 'a2'], ['a1'], true)).toContain('모든');
  expect(confirmationError([one, one], ['a1', 'a2'], ['a1', 'a2'], true)).toContain('모든');
  expect(
    confirmationError([one, { ...one, playerId: 'a2' }], ['a1', 'a2'], ['a1', 'a2'], true),
  ).toContain('두 주자');
  expect(confirmationError([{ ...one, to: 'out' }], ['a1'], ['a1'], true)).toContain('아웃');
});
it('간편 null 관찰로도 마지막 1루 포스아웃은 잔루·득점을 원상 복구한다', () => {
  const r = record();
  r.hit();
  r.strikeout();
  const before = r.state().bases.away;
  r.add({ type: 'START_PLAY' });
  const s = r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'out',
    direction: null,
    quality: null,
    fielding: [],
    outcomes: [
      { playerId: 'a1', to: 'home', action: 'advance' },
      { playerId: 'a3', to: 'out', action: 'advance', outReason: 'force', outAt: 1 },
    ],
  });
  expect(s.bases.away).toEqual(before);
  expect(s.plays.at(-1)?.cancelledAdvances).toBe(true);
  expect(scoreboard(s).total.away).toBe(0);
});
it('경기 간편 기록 취소·정정 후 안타·득점·주루를 원본에서 재계산한다', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'single',
    direction: null,
    quality: null,
    fielding: [],
    outcomes: [{ playerId: 'a1', to: 1, action: 'advance' }],
  });
  const original = structuredClone(r.events[1]);
  const replacement = {
    type: 'END_PLAY' as const,
    endedBy: 'umpire-time' as const,
    result: 'home-run' as const,
    direction: null,
    quality: null,
    fielding: [],
    outcomes: [{ playerId: 'a1', to: 'home' as const, action: 'advance' as const }],
  };
  r.add({ type: 'REVISE_PLAY', targetId: 'e2', author: '가상', reason: '정정', replacement });
  expect(r.events[1]).toEqual(original);
  expect(calculateStats(game, r.events, createDemoWorkspace().policy).rows[0]).toMatchObject({
    pa: 1,
    hits: 1,
    totalBases: 4,
    runs: 1,
    advances: 1,
  });
  r.add({
    type: 'REVISE_PLAY',
    targetId: 'e2',
    reason: '원본 복원',
    author: '가상',
    replacement: original.payload as typeof replacement,
  });
  expect(replayGame(game, r.events).bases.away).toEqual({ 1: 'a1' });
  expect(calculateStats(game, r.events, createDemoWorkspace().policy).rows[0]).toMatchObject({
    pa: 1,
    hits: 1,
    totalBases: 1,
    runs: 0,
  });
});
