import { it, expect } from 'vitest';
import { record, game } from '../test/fixtures';
import { DEFAULT_POLICY } from '../config/evaluation';
import { calculateStats } from './calculate';
it('미완료 이닝 포함 정책을 바꿔도 전체 원본 통계는 보존하고 선발용만 달라진다', () => {
  const r = record();
  r.hit('home-run');
  const all = calculateStats(game, r.events, DEFAULT_POLICY);
  expect(all.rows.find((x) => x.playerId === 'a1')).toMatchObject({
    pa: 1,
    hits: 1,
    runs: 1,
    totalBases: 4,
    battingAverage: 1,
  });
  expect(calculateStats(game, r.events, DEFAULT_POLICY, 'selection').rows).toHaveLength(0);
  const policy = structuredClone(DEFAULT_POLICY);
  policy.incompleteInnings.value = 'include';
  expect(calculateStats(game, r.events, policy, 'selection').rows[0].hits).toBe(1);
});
it('희생플라이 정책에 따라 분모가 변하고 관측 없음은 null', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'sacrifice-fly',
    direction: 'center',
    quality: 'fly',
    fielding: [{ playerId: 'h1', skill: 'F', position: 'LF', success: true }],
    outcomes: [{ playerId: 'a1', to: 'out', action: 'advance', outReason: 'fly', outAt: 1 }],
  });
  expect(
    calculateStats(game, r.events, DEFAULT_POLICY).rows.find((r) => r.playerId === 'a1'),
  ).toMatchObject({ pa: 1, atBats: 0, battingAverage: null });
  const p = structuredClone(DEFAULT_POLICY);
  p.sacrificeFly.value = 'include-in-at-bats';
  expect(calculateStats(game, r.events, p).rows.find((r) => r.playerId === 'a1')?.atBats).toBe(1);
  expect(calculateStats(game, r.events, p).rows.find((r) => r.playerId === 'h1')).toMatchObject({
    fieldingAttempts: 1,
    fieldingSuccesses: 1,
    battingAverage: null,
  });
});
it('취소한 기록은 스카우팅과 통계에 중복 반영되지 않는다', () => {
  const r = record();
  r.hit();
  r.add({ type: 'RETRACT', targetId: 'e2', reason: '정정' });
  expect(calculateStats(game, r.events, DEFAULT_POLICY).rows).toHaveLength(0);
});
