import { expect, it } from 'vitest';
import {
  balanceProfiles,
  createBalancedEntries,
  teamScoreSummary,
  type BalanceProfile,
} from './teamBalance';
import { createDemoWorkspace } from '../data/seed';
import type { MatchEntryDrafts } from '../domain/randomEntry';
import { ABILITIES } from '../config/positions';
import { blankAttempt, createBattingSession, recordBattingAttempt } from '../assessment/batting';
import { QUALITY_RUBRIC } from '../config/battingQuality';
import { saveDefenseAssessment } from '../assessment/defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC, type DefenseInput } from '../domain/defenseAssessment';
import { blankFungo } from '../domain/fungo';
import { saveFungo } from '../assessment/fungo';
const empty = (): MatchEntryDrafts => ({
  away: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
  home: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
});
const rng = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const at = '2026-11-16T01:00:00Z';
const meta = (id: string) => ({ id, at, actor: 'QA', reason: '검증' });

it('균형 교환에서 주장을 잠그고 주장 점수를 포함해 두 팀을 비교한다', () => {
  const players = createDemoWorkspace().players.slice(0, 20);
  const profiles = players.map((p, i) => ({
    id: p.id,
    batting: i < 10 ? 100 : 0,
    defense: i < 10 ? 100 : 0,
    note: '',
  }));
  const captains = { away: players[0].id, home: players[1].id };
  const selected = players.slice(2).map((p) => p.id);
  for (let seed = 1; seed <= 4; seed++) {
    const result = createBalancedEntries(players, selected, empty(), profiles, rng(seed), captains);
    for (const side of ['away', 'home'] as const) {
      expect(result[side].lineup).toContain(captains[side]);
      expect(result[side].lineup).toHaveLength(10);
      expect(teamScoreSummary(result[side].lineup, profiles).batting).toEqual({
        mean: 50,
        count: 10,
        missing: 0,
      });
    }
  }
});

it.each([true, false])(
  '타격·수비가 같은 방향 또는 반대 방향으로 치우쳐도 두 평균을 함께 맞춘다 (%s)',
  (same) => {
    const players = createDemoWorkspace().players.slice(0, 20);
    const profiles = players.map((p, i) => ({
      id: p.id,
      batting: i < 10 ? 100 : 0,
      defense: same ? (i < 10 ? 100 : 0) : i < 10 ? 0 : 100,
      note: '',
    }));
    const result = createBalancedEntries(
      players,
      players.map((p) => p.id),
      empty(),
      profiles,
      rng(17),
    );
    for (const side of ['away', 'home'] as const) {
      const scores = teamScoreSummary(result[side].lineup, profiles);
      expect(scores.batting.mean).toBe(50);
      expect(scores.defense.mean).toBe(50);
    }
  },
);
it('미측정과 유효 0점을 구분하고 측정 인원을 고르게 분산한다', () => {
  const players = createDemoWorkspace().players.slice(0, 20);
  const profiles: BalanceProfile[] = players.map((p, i) => ({
    id: p.id,
    batting: i < 10 ? 0 : null,
    defense: i >= 10 ? 80 : null,
    note: '',
  }));
  const result = createBalancedEntries(
    players,
    players.map((p) => p.id),
    empty(),
    profiles,
    rng(9),
  );
  for (const side of ['away', 'home'] as const) {
    const s = teamScoreSummary(result[side].lineup, profiles);
    expect(s.batting).toEqual({ mean: 0, count: 5, missing: 5 });
    expect(s.defense).toEqual({ mean: 80, count: 5, missing: 5 });
  }
});
it('홀수 참가자·선발 각 10명·후보·10포지션 유일성과 원본 불변을 보장한다', () => {
  const data = createDemoWorkspace(),
    current = empty();
  data.players = data.players.slice(0, 23);
  data.battingSettings.scoreSource = 'legacy';
  const before = structuredClone({ data, current });
  const result = createBalancedEntries(
    data.players,
    data.players.map((p) => p.id),
    current,
    balanceProfiles(data, 'nine'),
    rng(50),
  );
  const ids = [...result.away.assigned, ...result.home.assigned];
  expect(ids).toHaveLength(23);
  expect(new Set(ids).size).toBe(23);
  expect(Math.abs(result.away.assigned.length - result.home.assigned.length)).toBe(1);
  for (const side of ['away', 'home'] as const) {
    expect(result[side].lineup).toHaveLength(10);
    expect(Object.values(result[side].defense).sort()).toEqual([...result[side].lineup].sort());
  }
  expect({ data, current }).toEqual(before);
});
it('자료 없음·잘못된 점수·인원 부족·결석은 초안을 바꾸지 않고 거절한다', () => {
  const players = createDemoWorkspace().players.slice(0, 20),
    current = empty(),
    ids = players.map((p) => p.id);
  const profiles: BalanceProfile[] = ids.map((id) => ({
    id,
    batting: null,
    defense: null,
    note: '',
  }));
  expect(() => createBalancedEntries(players, ids, current, profiles)).toThrow('유효 평가');
  profiles[0].batting = NaN;
  expect(() => createBalancedEntries(players, ids, current, profiles)).toThrow('평가 점수');
  profiles[0].batting = 100;
  expect(() => createBalancedEntries(players, ids.slice(0, 19), current, profiles)).toThrow('20명');
  current.away.status[ids[0]] = 'absent';
  const before = structuredClone(current);
  expect(() => createBalancedEntries(players, ids, current, profiles)).toThrow('결석');
  expect(current).toEqual(before);
});
it('상세 타격이 없으면 이전 수동 점수를 임의로 채우지 않는다', () => {
  const d = createDemoWorkspace();
  expect(balanceProfiles(d, 'nine')[0].batting).toBeNull();
  d.battingSettings.scoreSource = 'legacy';
  expect(balanceProfiles(d, 'nine')[0].batting).toBe(d.assessments[0].battingSkill);
  delete d.assessments[0].abilities.Q;
  expect(balanceProfiles(d, 'nine')[0].defense).toBeNull();
});
it('6단계 타격의 전체 유효 회차 누적 평균을 그대로 100점으로 사용한다', () => {
  let d = createDemoWorkspace();
  for (const [date, scores] of [
    ['2026-11-15', [5]],
    ['2026-11-16', [-1, -1, -1]],
  ] as const) {
    d = createBattingSession(
      d,
      {
        playerId: 'green-1',
        date,
        targetAttempts: 10,
        assessor: 'QA',
        purpose: '검증',
        note: '',
        rubricVersion: QUALITY_RUBRIC,
      },
      meta(date),
    );
    scores.forEach((score, i) => {
      d = recordBattingAttempt(
        d,
        date,
        i + 1,
        {
          ...blankAttempt(),
          qualityGrade: score === 5 ? 'barrel' : 'tee-miss',
          result: score === 5 ? 'fair' : 'miss',
          score,
        },
        meta(date + '-' + i),
      );
    });
  }
  expect(balanceProfiles(d, 'nine')[0].batting).toBe(25);
  expect(balanceProfiles(d, 'nine')[0].note).toContain('4회');
});
it('선택한 체크리스트 출처의 취소를 반영하고 수동 수비로 빈 항목을 채우지 않는다', () => {
  let d = createDemoWorkspace();
  const input: DefenseInput = {
    date: '2026-11-16',
    situation: 'combined',
    assessor: 'QA',
    note: '',
    error: null,
    rubric: { ...DEFAULT_DEFENSE_RUBRIC },
    observations: Object.fromEntries(
      ABILITIES.map((k) => [k, 'partial']),
    ) as DefenseInput['observations'],
  };
  const m = { id: 'd1', revisionId: 'r1', at, author: 'QA', reason: '검증' };
  d = saveDefenseAssessment(d, 'green-1', input, m);
  d.defenseEvaluationChoices.push({
    id: 'choice',
    playerId: 'green-1',
    source: 'checklist',
    changedAt: at,
    changedBy: 'QA',
  });
  expect(balanceProfiles(d, 'nine')[0].defense).toBe(50);
  d = saveDefenseAssessment(d, 'green-1', input, { ...m, revisionId: 'r2' }, 'd1', true);
  expect(balanceProfiles(d, 'nine')[0].defense).toBeNull();
});
it('펑고는 최근 유효 5항목을 환산하며 취소된 점수를 사용하지 않는다', () => {
  const input = {
    ...blankFungo('2026-11-16', 'QA'),
    mode: 'precise' as const,
    manual: { G: 5, F: 6, C: 7, T_acc: 8, T_pow: 9 },
  };
  const m = { id: 'f1', revisionId: 'r1', at, reason: '검증' };
  let d = saveFungo(createDemoWorkspace(), 'green-1', input, m);
  expect(balanceProfiles(d, 'fungo')[0].defense).toBe(70);
  expect(balanceProfiles(d, 'nine')[0].defense).not.toBe(70);
  d = saveFungo(d, 'green-1', input, { ...m, revisionId: 'r2' }, true);
  expect(balanceProfiles(d, 'fungo')[0].defense).toBeNull();
});
