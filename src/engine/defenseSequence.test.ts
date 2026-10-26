import { expect, it } from 'vitest';
import { game, record } from '../test/fixtures';
import { projectDefenseSequence, assistCandidates } from './defenseSequence';
import { calculateStats } from '../statistics/calculate';
import { DEFAULT_POLICY } from '../config/evaluation';
import type { DefenseStep } from '../domain/defense';
import type { EndPlayPayload } from '../domain/model';
const step = (
  id: string,
  action: DefenseStep['action'],
  extra: Partial<DefenseStep> = {},
): DefenseStep => ({
  id,
  action,
  playerId: 'h1',
  position: 'SS',
  targetBase: null,
  runnerId: null,
  catchSkill: null,
  errorType: null,
  assistIds: [],
  ...extra,
});
const setup = () => {
  const r = record();
  r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '1B': 'h2', '2B': 'h3' } });
  r.add({ type: 'START_PLAY' });
  return r;
};
const chain = () => [
  step('g', 'ground-catch'),
  step('t', 'throw', { targetBase: 1 }),
  step('c', 'receive', { playerId: 'h2', position: '1B' }),
  step('o', 'force-out', {
    playerId: 'h2',
    position: '1B',
    targetBase: 1,
    runnerId: 'a1',
    assistIds: ['h1'],
  }),
];
const payload = (r: ReturnType<typeof record>, steps: DefenseStep[]): EndPlayPayload => {
  const p = projectDefenseSequence(r.state(), steps);
  return {
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: p.result ?? 'single',
    direction: null,
    quality: p.quality,
    fielding: p.fielding,
    details: p.details,
    outcomes: p.outcomes.length ? p.outcomes : [{ playerId: 'a1', to: 1, action: 'advance' }],
    defenseSequence: steps,
  };
};
it('유격수 땅볼·송구→1루수 포구·포스아웃이 타격/주루/PO/A/능력에 한 번씩 반영된다', () => {
  const r = setup();
  r.add(payload(r, chain()));
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((x) => x.playerId === 'a1')).toMatchObject({ pa: 1, hits: 0, runningOuts: 1 });
  expect(rows.find((x) => x.playerId === 'h1')).toMatchObject({
    assists: 1,
    putouts: 0,
    fieldingAttempts: 2,
    fieldingTypes: { G: 1, A: 1 },
  });
  expect(rows.find((x) => x.playerId === 'h2')).toMatchObject({
    putouts: 1,
    assists: 0,
    fieldingTypes: { C: 1, B: 1 },
  });
});
it('미배치 선수·중복 행동·미관찰 보살·주자 판정 불일치를 거절한다', () => {
  const r = setup();
  expect(() =>
    projectDefenseSequence(r.state(), [step('x', 'ground-catch', { playerId: 'h4' })]),
  ).toThrow('실제 수비');
  expect(() =>
    projectDefenseSequence(r.state(), [step('x', 'ground-catch'), step('x', 'throw')]),
  ).toThrow('ID 중복');
  expect(() =>
    projectDefenseSequence(r.state(), [
      step('o', 'force-out', { targetBase: 1, runnerId: 'a1', assistIds: ['h3'] }),
    ]),
  ).toThrow('연결된 송구');
  const p = payload(r, chain());
  p.outcomes[0].outReason = 'tag';
  expect(() => r.add(p)).toThrow('실제 주자 판정');
});
it('마지막 행동 취소 시 아웃·자살·보살이 제거되고 관찰은 보존된다', () => {
  const r = setup(),
    p = projectDefenseSequence(r.state(), chain().slice(0, -1));
  expect(p.outcomes).toEqual([]);
  expect(p.details.filter((d) => d.type === 'DEFENSIVE_CREDIT')).toEqual([]);
  expect(p.fielding).toHaveLength(3);
});
it('포구·송구 실패는 공식 실책 및 미관찰 능력과 구별된다', () => {
  const r = setup(),
    p = projectDefenseSequence(r.state(), [step('f', 'catch-fail'), step('t', 'bad-throw')]);
  expect(p.fielding).toEqual([{ playerId: 'h1', position: 'SS', skill: 'A', success: false }]);
  expect(p.details.some((d) => d.type === 'DEFENSIVE_ERROR')).toBe(false);
  const error = projectDefenseSequence(r.state(), [
    step('e', 'bad-throw', { errorType: 'throw-direction' }),
  ]);
  expect(error.details.filter((d) => d.type === 'DEFENSIVE_ERROR')).toHaveLength(1);
});
it('뜬공 포구 관찰만으로 아웃을 만들지 않고 명시적으로 연결한 타자만 아웃 처리한다', () => {
  const r = setup();
  expect(projectDefenseSequence(r.state(), [step('f', 'fly-catch')]).outcomes).toEqual([]);
  r.add(payload(r, [step('f', 'fly-catch', { runnerId: 'a1', targetBase: 1 })]));
  const row = calculateStats(game, r.events, DEFAULT_POLICY).rows.find((x) => x.playerId === 'a1');
  expect(row).toMatchObject({ pa: 1, hits: 0, runningOuts: 0 });
});
it('타자 아웃 원본을 수정하면 연결 기록과 통계를 재계산한다', () => {
  const r = setup(),
    original = r.events.length;
  r.add(payload(r, chain()));
  const source = structuredClone(r.events[original]);
  r.add({
    type: 'REVISE_PLAY',
    targetId: source.id,
    reason: '가상 판정 정정',
    author: '가상 감독',
    replacement: {
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'single',
      direction: null,
      quality: null,
      fielding: [],
      details: [],
      outcomes: [{ playerId: 'a1', to: 1, action: 'advance' }],
    },
  });
  expect(r.events[original]).toEqual(source);
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((x) => x.playerId === 'a1')).toMatchObject({ hits: 1, runningOuts: 0 });
  expect(rows.find((x) => x.playerId === 'h1')).toBeUndefined();
});
it('보살 제안은 직전 아웃 뒤의 동일 목표 송구만 사용한다', () => {
  const steps = chain();
  expect(assistCandidates(steps, 1, 'h2')).toEqual([]);
  steps.push(step('new', 'throw', { targetBase: 2 }));
  expect(assistCandidates(steps, 1, 'h2')).toEqual([]);
  expect(assistCandidates(steps, 2, 'h3')).toEqual(['h1']);
});

it('마지막 타자의 연결된 1루 포스아웃은 기존 주자의 득점·진루를 취소한다', () => {
  const r = record();
  r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '1B': 'h2' } });
  r.hit();
  r.strikeout();
  r.add({ type: 'START_PLAY' });
  const steps = chain().map((s) => (s.runnerId ? { ...s, runnerId: 'a3' } : s)),
    p = payload(r, steps);
  p.outcomes.push({ playerId: 'a1', to: 'home', action: 'advance' });
  r.add(p);
  expect(r.state().bases.away).toEqual({ 1: 'a1' });
  expect(r.state().plays.at(-1)?.cancelledAdvances).toBe(true);
  expect(
    calculateStats(game, r.events, DEFAULT_POLICY).rows.find((r) => r.playerId === 'a1')?.runs,
  ).toBe(0);
});
it('야수선택으로 기존 주자만 아웃시키고 타자는 1루에 남긴다', () => {
  const r = record();
  r.add({ type: 'DEFENSE', side: 'home', assignments: { SS: 'h1', '2B': 'h3' } });
  r.hit();
  r.add({ type: 'START_PLAY' });
  const steps = [
    step('g', 'ground-catch'),
    step('fc', 'fielders-choice', { runnerId: 'a1' }),
    step('t', 'throw', { targetBase: 2 }),
    step('o', 'force-out', {
      playerId: 'h3',
      position: '2B',
      runnerId: 'a1',
      targetBase: 2,
      assistIds: ['h1'],
    }),
  ];
  const p = payload(r, steps);
  p.outcomes.push({ playerId: 'a2', to: 1, action: 'advance' });
  r.add(p);
  expect(r.state().bases.away).toEqual({ 1: 'a2' });
  expect(
    calculateStats(game, r.events, DEFAULT_POLICY).rows.find((r) => r.playerId === 'a2'),
  ).toMatchObject({ pa: 1, hits: 0, fieldersChoices: 1 });
});
it('안타 후 악송구 추가 진루는 안타·실책·주루 원인을 분리한다', () => {
  const r = setup(),
    steps = [step('e', 'bad-throw', { errorType: 'throw-direction' })],
    p = payload(r, steps);
  p.outcomes = [{ playerId: 'a1', to: 2, action: 'advance' }];
  p.details!.push({
    id: 'extra',
    type: 'ERROR_ADVANCE',
    playerId: 'a1',
    from: 1,
    to: 2,
    errorId: 'e:error',
  });
  p.safetyAward = { positionsAtThrow: { a1: 1 } };
  r.add(p);
  const rows = calculateStats(game, r.events, DEFAULT_POLICY).rows;
  expect(rows.find((r) => r.playerId === 'a1')).toMatchObject({
    hits: 1,
    totalBases: 1,
    errorAdvanceBases: 1,
  });
  expect(rows.find((r) => r.playerId === 'h1')).toMatchObject({
    errors: 1,
    fieldingAttempts: 1,
    fieldingSuccesses: 0,
  });
});
