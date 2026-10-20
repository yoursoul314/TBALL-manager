import { expect, it } from 'vitest';
import { game, record } from '../test/fixtures';
import { effectiveEvents, replayGame, scoreboard } from './game';
import { calculateStats } from '../statistics/calculate';
import { DEFAULT_POLICY } from '../config/evaluation';
import type { EndPlayPayload } from '../domain/model';
const single = (overrides: Partial<EndPlayPayload> = {}): EndPlayPayload => ({
  type: 'END_PLAY',
  endedBy: 'umpire-time',
  result: 'single',
  direction: 'center',
  quality: 'line',
  distance: 'middle',
  strength: 'normal',
  fielding: [],
  outcomes: [{ playerId: 'a1', to: 1, action: 'advance' }],
  details: [],
  ...overrides,
});
it('타격 완료 후 벤치로 나갔다가 다른 남은 타순에 재출전해 중복 타격할 수 없다', () => {
  const r = record();
  r.strikeout();
  r.add({ type: 'SUBSTITUTE', side: 'away', slot: 0, playerId: 'a4' });
  expect(() => r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a1' })).toThrow(
    '이미 타격한 학생',
  );
  expect(r.state().lineups.away).toEqual(['a4', 'a2', 'a3']);
  r.add({ type: 'SUBSTITUTE', side: 'away', slot: 0, playerId: 'a1' });
  r.strikeout();
  r.strikeout();
  r.strikeout();
  r.strikeout();
  r.strikeout();
  expect(r.state().inning).toBe(2);
  expect(() => r.strikeout()).not.toThrow();
});
it('볼 데드에서만 수비 변경하며 중복 포지션 선수를 거절한다', () => {
  const r = record();
  expect(
    r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '1B': 'h2' } }).defense.home.SS,
  ).toBe('h1');
  expect(() =>
    r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '1B': 'h1' } }),
  ).toThrow('중복');
  r.add({ type: 'START_PLAY' });
  expect(() => r.add({ type: 'DEFENSE', side: 'home', assignments: { RF: 'h3' } })).toThrow(
    '볼 데드',
  );
});
it.each(['left', 'center', 'right'] as const)(
  '9구역 %s 방향의 근·중·원거리는 유형·강도와 독립',
  (direction) => {
    for (const distance of ['near', 'middle', 'far'] as const) {
      const r = record();
      r.add({ type: 'START_PLAY' });
      r.add(single({ direction, distance, quality: 'ground', strength: 'strong' }));
      const stat = calculateStats(game, r.events, DEFAULT_POLICY).rows[0];
      expect(stat.zones).toEqual({ [direction + '-' + distance]: 1 });
      expect(stat.qualities).toEqual({ ground: 1 });
      expect(stat.strengths).toEqual({ strong: 1 });
    }
  },
);
it('복수 수비 동작·9능력 관찰·자살·보살·실책을 분리 집계한다', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  r.add(
    single({
      result: 'out',
      outcomes: [{ playerId: 'a1', to: 'out', action: 'advance', outReason: 'force', outAt: 1 }],
      fielding: [
        { playerId: 'h1', position: 'SS', skill: 'G', success: true },
        { playerId: 'h1', position: 'SS', skill: 'A', success: true },
        { playerId: 'h2', position: '1B', skill: 'C', success: true },
        { playerId: 'h2', position: '1B', skill: 'B', success: true },
      ],
      details: [
        {
          id: 'd1',
          type: 'FIELDING_ACTION',
          playerId: 'h1',
          position: 'SS',
          action: 'receive',
          success: true,
        },
        {
          id: 'd2',
          type: 'FIELDING_ACTION',
          playerId: 'h1',
          position: 'SS',
          action: 'throw',
          success: true,
        },
        {
          id: 'd3',
          type: 'FIELDING_ACTION',
          playerId: 'h2',
          position: '1B',
          action: 'base',
          success: true,
        },
        {
          id: 'd4',
          type: 'FIELDING_ACTION',
          playerId: 'h2',
          position: '1B',
          action: 'out',
          success: true,
          runnerId: 'a1',
        },
        { id: 'a', type: 'DEFENSIVE_CREDIT', playerId: 'h1', credit: 'assist', runnerId: 'a1' },
        { id: 'p', type: 'DEFENSIVE_CREDIT', playerId: 'h2', credit: 'putout', runnerId: 'a1' },
      ],
    }),
  );
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((r) => r.playerId === 'h1')).toMatchObject({
    assists: 1,
    putouts: 0,
    errors: 0,
    fieldingAttempts: 2,
  });
  expect(rows.find((r) => r.playerId === 'h2')).toMatchObject({
    assists: 0,
    putouts: 1,
    errors: 0,
    fieldingAttempts: 2,
  });
});
it('안타 후 실책 추가 진루는 안타 루타를 늘리지 않고 별도 기록한다', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  r.add(
    single({
      outcomes: [{ playerId: 'a1', to: 2, action: 'advance' }],
      details: [
        {
          id: 'err',
          type: 'DEFENSIVE_ERROR',
          playerId: 'h1',
          errorType: 'throw-direction',
          note: '가상 악송구',
        },
        { id: 'adv', type: 'ERROR_ADVANCE', playerId: 'a1', from: 1, to: 2, errorId: 'err' },
      ],
    }),
  );
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((r) => r.playerId === 'a1')).toMatchObject({
    hits: 1,
    totalBases: 1,
    errorAdvanceBases: 1,
  });
  expect(rows.find((r) => r.playerId === 'h1')).toMatchObject({
    errors: 1,
    fieldingAttempts: 0,
    errorsByType: { 'throw-direction': 1 },
  });
});
it('야수선택은 안타가 아니며 타점은 판정 이벤트를 기록한 득점만 집계한다', () => {
  const r = record();
  r.hit();
  r.add({ type: 'START_PLAY' });
  r.add(
    single({
      result: 'fielders-choice',
      outcomes: [
        { playerId: 'a1', to: 'home', action: 'advance' },
        { playerId: 'a2', to: 1, action: 'advance' },
      ],
      details: [
        { id: 'fc', type: 'FIELDERS_CHOICE', targetRunnerId: 'a1' },
        { id: 'rbi', type: 'RBI', runnerId: 'a1' },
      ],
    }),
  );
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((r) => r.playerId === 'a2')).toMatchObject({
    atBats: 1,
    hits: 0,
    fieldersChoices: 1,
    rbi: 1,
  });
  expect(rows.find((r) => r.playerId === 'a1')?.runs).toBe(1);
});
it('존재하지 않는 실책 링크·RBI 중복·아웃 기여·FC 대상을 거절한다', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  expect(() => r.add(single({ details: [{ id: 'a', type: 'RBI', runnerId: 'a1' }] }))).toThrow(
    'RBI',
  );
  expect(() =>
    r.add(
      single({
        details: [
          { id: 'a', type: 'ERROR_ADVANCE', playerId: 'a1', from: 1, to: 2, errorId: 'missing' },
        ],
      }),
    ),
  ).toThrow('원인 실책');
  expect(() =>
    r.add(
      single({
        details: [
          { id: 'a', type: 'DEFENSIVE_CREDIT', playerId: 'h1', credit: 'putout', runnerId: 'a1' },
        ],
      }),
    ),
  ).toThrow('아웃 대상');
  expect(() => r.add(single({ result: 'fielders-choice', details: [] }))).toThrow('FC');
});
it('과거 수정 원본·이력 보존과 반복 재생: 타격·수비·주루·득점·RBI 재계산', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  const original = single({
    result: 'home-run',
    outcomes: [{ playerId: 'a1', to: 'home', action: 'advance' }],
    details: [{ id: 'rbi', type: 'RBI', runnerId: 'a1' }],
  });
  r.add(original);
  r.strikeout();
  const frozen = JSON.stringify(r.events);
  const replacement = single({
    result: 'out',
    outcomes: [{ playerId: 'a1', to: 'out', action: 'advance', outAt: 1, outReason: 'force' }],
    fielding: [{ playerId: 'h2', position: '1B', skill: 'C', success: true }],
    details: [
      { id: 'po', type: 'DEFENSIVE_CREDIT', playerId: 'h2', runnerId: 'a1', credit: 'putout' },
    ],
  });
  r.add({
    type: 'REVISE_PLAY',
    targetId: 'e2',
    reason: '기록 착오',
    author: '테스트',
    replacement,
  });
  expect(JSON.stringify(r.events.slice(0, -1))).toBe(frozen);
  expect(r.events[1].payload).toEqual(original);
  expect(effectiveEvents(r.events).find((e) => e.id === 'e2')?.payload).toEqual(replacement);
  const report = calculateStats(game, r.events, DEFAULT_POLICY);
  expect(report.rows.find((r) => r.playerId === 'a1')).toMatchObject({
    pa: 1,
    hits: 0,
    runs: 0,
    rbi: 0,
    runningOuts: 1,
    advances: 0,
  });
  expect(report.rows.find((r) => r.playerId === 'h2')).toMatchObject({
    putouts: 1,
    fieldingAttempts: 1,
  });
  expect(scoreboard(r.state()).total.away).toBe(0);
  expect(replayGame(game, r.events)).toEqual(r.state());
  expect(calculateStats(game, r.events, DEFAULT_POLICY)).toEqual(report);
  r.add({
    type: 'REVISE_PLAY',
    targetId: 'e2',
    reason: '재검토',
    author: '테스트',
    replacement: original,
  });
  expect(
    calculateStats(game, r.events, DEFAULT_POLICY).rows.find((r) => r.playerId === 'a1')?.rbi,
  ).toBe(1);
});
it('후속 주자 맥락을 깨는 과거 수정은 저장하지 않는다', () => {
  const r = record();
  r.hit();
  r.hit();
  const frozen = JSON.stringify(r.events);
  expect(() =>
    r.add({
      type: 'REVISE_PLAY',
      targetId: 'e2',
      reason: '잘못된 수정',
      author: '테스트',
      replacement: single({
        result: 'home-run',
        outcomes: [{ playerId: 'a1', to: 'home', action: 'advance' }],
      }),
    }),
  ).toThrow('모든 주자');
  expect(JSON.stringify(r.events)).toBe(frozen);
});
it('RULE02 롤백에는 RBI와 실책 추가 진루가 득점·주루에 남지 않는다', () => {
  const r = record();
  r.hit();
  r.strikeout();
  r.add({ type: 'START_PLAY' });
  r.add(
    single({
      result: 'out',
      outcomes: [
        { playerId: 'a1', to: 'home', action: 'advance' },
        { playerId: 'a3', to: 'out', action: 'advance', outReason: 'force', outAt: 1 },
      ],
      details: [
        {
          id: 'err',
          type: 'DEFENSIVE_ERROR',
          playerId: 'h1',
          errorType: 'throw-direction',
          note: '',
        },
        { id: 'adv', type: 'ERROR_ADVANCE', playerId: 'a1', from: 1, to: 'home', errorId: 'err' },
        { id: 'rbi', type: 'RBI', runnerId: 'a1' },
      ],
    }),
  );
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((r) => r.playerId === 'a3')?.rbi).toBe(0);
  expect(rows.find((r) => r.playerId === 'a1')).toMatchObject({ runs: 0, errorAdvanceBases: 0 });
  expect(r.state().bases.away).toEqual({ 1: 'a1' });
});
