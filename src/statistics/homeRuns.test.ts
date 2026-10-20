import { expect, it } from 'vitest';
import { record, game } from '../test/fixtures';
import { DEFAULT_POLICY } from '../config/evaluation';
import { calculateStats } from './calculate';
import { homeRunQualityLabel } from './homeRuns';
import type { EndPlayPayload, Quality, Strength } from '../domain/model';

it.each([
  ['ground', 'strong', '강한 땅볼형'],
  ['line', 'normal', '보통 강도의 직선타형'],
  ['fly', 'weak', '약한 뜬공형'],
] as [Quality, Strength, string][])(
  '홈런 %s/%s를 질별로 집계하며 안타·루타는 유지한다',
  (quality, strength, label) => {
    const r = record();
    r.add({ type: 'START_PLAY' });
    r.add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'home-run',
      quality,
      strength,
      direction: 'left',
      distance: 'far',
      fielding: [],
      outcomes: [{ playerId: 'a1', to: 'home', action: 'advance' }],
    });
    const row = calculateStats(game, r.events, DEFAULT_POLICY).rows[0];
    expect(row).toMatchObject({
      homeRuns: 1,
      hits: 1,
      totalBases: 4,
      runs: 1,
      homeRunQualities: { [quality + ':' + strength]: 1 },
    });
    expect(homeRunQualityLabel(quality + ':' + strength)).toBe(label);
    expect(calculateStats(game, r.events, DEFAULT_POLICY, 'selection').rows).toEqual([]);
  },
);

it('기존 강도 없는 홈런은 미기록으로 유지하고 수정·철회 시 원본에서 재집계한다', () => {
  const r = record();
  r.hit('home-run');
  const original = structuredClone(r.events[1]);
  const payload = original.payload as EndPlayPayload;
  expect(calculateStats(game, r.events, DEFAULT_POLICY).rows[0].homeRunQualities).toEqual({
    'line:unrecorded': 1,
  });
  expect(homeRunQualityLabel('line:unrecorded')).toBe('직선타형 · 강도 미기록');
  r.add({
    type: 'REVISE_PLAY',
    targetId: original.id,
    reason: '가상 타구 질 정정',
    author: '테스트',
    replacement: { ...payload, quality: 'fly', strength: 'strong' },
  });
  expect(calculateStats(game, r.events, DEFAULT_POLICY).rows[0].homeRunQualities).toEqual({
    'fly:strong': 1,
  });
  r.add({
    type: 'REVISE_PLAY',
    targetId: original.id,
    reason: '가상 안타 판정 정정',
    author: '테스트',
    replacement: {
      ...payload,
      result: 'single',
      outcomes: [{ playerId: 'a1', to: 1, action: 'advance' }],
    },
  });
  expect(calculateStats(game, r.events, DEFAULT_POLICY).rows[0]).toMatchObject({
    homeRuns: 0,
    homeRunQualities: {},
    hits: 1,
    totalBases: 1,
    runs: 0,
  });
  expect(r.events[1]).toEqual(original);
  r.add({ type: 'RETRACT', targetId: original.id, reason: '가상 기록 취소' });
  expect(calculateStats(game, r.events, DEFAULT_POLICY).rows).toEqual([]);
});
