import { expect, it } from 'vitest';
import {
  waterfallScore,
  recommendWaterfall,
  waterfallCandidates,
  type WaterfallCandidate,
} from './waterfall';
import { createDemoWorkspace } from '../data/seed';
import { positionScore } from './score';
import { defenseEvaluation } from './defense';
import { parseWorkspace } from '../data/schema';
import { approveLineup } from './manualLineup';
const candidate = (id = 'a', value = 8): WaterfallCandidate => ({
  player: { id, name: id },
  scores: { G: value, F: value, C: value, T_acc: value, T_pow: value },
  batting: value,
  pitcher: 72,
});
it('제공 공식 9자리 + P 원래 TYPE1 점수, 희망 가산점은 중복 가산하지 않음', () => {
  const c = candidate();
  c.player.pref1 = 'SS';
  c.player.pref2 = '1B';
  for (const p of ['SS', '3B', '1B', '2B', 'CF1', 'CF2', 'LF', 'RF', 'HP'] as const)
    expect(waterfallScore(c, p)).toEqual({
      base: 80,
      bonus: p === 'SS' ? 5 : p === '1B' ? 3 : 0,
      penalty: 0,
      score: p === 'SS' ? 85 : p === '1B' ? 83 : 80,
    });
  c.player.pref1 = 'P';
  expect(waterfallScore(c, 'P')).toEqual({ base: 72, bonus: 5, penalty: 0, score: 77 });
});
it('각 변수의 계수를 독립 확인', () => {
  const c = candidate();
  c.scores = { G: 7, F: 6, C: 8, T_acc: 9, T_pow: 4 };
  c.batting = 5;
  expect(waterfallScore(c, 'SS')?.base).toBe(65.5);
  expect(waterfallScore(c, '1B')?.base).toBe(74.5);
  expect(waterfallScore(c, '2B')?.base).toBe(73);
  expect(waterfallScore(c, 'CF1')?.base).toBe(59.5);
  expect(waterfallScore(c, 'RF')?.base).toBe(66.5);
  expect(waterfallScore(c, 'HP')?.base).toBe(72);
});
it('임계값 바로 아래 감점·경계 통과·중복 감점 금지·105점 보존', () => {
  const c = candidate('a', 10);
  c.player.pref1 = 'SS';
  expect(waterfallScore(c, 'SS')?.score).toBe(105);
  c.scores.G = 6.99;
  c.scores.T_acc = 6.99;
  expect(waterfallScore(c, 'SS')?.penalty).toBe(30);
  c.scores.G = 7;
  c.scores.T_acc = 7;
  expect(waterfallScore(c, 'SS')?.penalty).toBe(0);
  c.scores.C = 7.99;
  expect(waterfallScore(c, '1B')?.penalty).toBe(30);
  c.scores.C = 8;
  expect(waterfallScore(c, '1B')?.penalty).toBe(0);
  c.scores.F = 5.99;
  expect(waterfallScore(c, 'LF')?.penalty).toBe(20);
  c.scores.F = 6;
  expect(waterfallScore(c, 'LF')?.penalty).toBe(0);
});
it('미측정은 0점으로 채우지 않고 필요한 자리만 제외', () => {
  const c = candidate();
  c.scores.F = null;
  expect(waterfallScore(c, 'LF')).toBeNull();
  expect(waterfallScore(c, 'SS')).not.toBeNull();
  c.batting = null;
  expect(waterfallScore(c, 'RF')).toBeNull();
  c.pitcher = null;
  expect(waterfallScore(c, 'P')).toBeNull();
});
it('워터폴 순서·중복 방지·상위 내야 에이스 1B 보호·동점 재현성', () => {
  const c = Array.from({ length: 12 }, (_, i) =>
    candidate(String(i).padStart(2, '0'), i < 2 ? 10 : 8),
  );
  const r = recommendWaterfall(c),
    reverse = recommendWaterfall([...c].reverse());
  expect(reverse).toEqual(r);
  expect(r.assignments.map((a) => a.position)).toEqual([
    '1B',
    'SS',
    '3B',
    'CF1',
    'LF',
    'CF2',
    '2B',
    'RF',
    'HP',
    'P',
  ]);
  expect(new Set(r.assignments.map((a) => a.playerId)).size).toBe(10);
  expect(r.assignments.slice(0, 3).map((a) => a.playerId)).toEqual(['02', '00', '01']);
  expect(r.feedback.find((f) => f.position === 'SS')?.text).toContain('내야를 우선');
  expect(r.feedback[0].text).toContain('공동 3위');
});
it('후보 부족·중복·범위 오류 및 빈자리 명시', () => {
  expect(recommendWaterfall([]).vacancies).toHaveLength(10);
  expect(recommendWaterfall([candidate()]).assignments).toHaveLength(1);
  expect(() => recommendWaterfall([candidate(), candidate()])).toThrow('중복');
  const c = candidate();
  c.scores.T_pow = 11;
  expect(() => recommendWaterfall([c])).toThrow('범위');
});
it('기존 평가 P 연동 및 새 타격 없으면 B 미측정·추천은 승인 전 draft', () => {
  const d = createDemoWorkspace(),
    c = waterfallCandidates(d)[0];
  expect(c.batting).toBeNull();
  expect(c.pitcher).toBe(positionScore(defenseEvaluation(d, c.player.id).abilities, 'P'));
  const r = recommendWaterfall(
    d.players.slice(0, 10).map((p) => ({ ...candidate(p.id), player: p })),
  );
  const s = {
    id: 'w',
    teamId: d.teams[0].id,
    createdAt: '2026-10-27T01:00:00Z',
    policyVersion: 'fungo-waterfall-v1',
    sourceRevision: d.revision,
    assignments: r.assignments,
    method: 'waterfall' as const,
    waterfall: {
      version: 'fungo-waterfall-v1' as const,
      candidateIds: r.candidateIds,
      feedback: r.feedback,
    },
    status: 'draft' as const,
    approvedBy: null,
    approvedAt: null,
  };
  const saved = parseWorkspace({ ...d, selections: [s] });
  expect(saved.selections[0].status).toBe('draft');
  expect(approveLineup(saved, 'w', 'QA', '2026-10-27T02:00:00Z').selections[0].status).toBe(
    'approved',
  );
  const partial = parseWorkspace({
    ...d,
    selections: [
      {
        ...s,
        assignments: s.assignments.slice(0, 1),
        waterfall: { ...s.waterfall, feedback: s.waterfall.feedback.slice(0, 1) },
      },
    ],
  });
  expect(() => approveLineup(partial, 'w', 'QA', '2026-10-27T02:00:00Z')).toThrow('10명');
  expect(() =>
    parseWorkspace({
      ...saved,
      selections: [
        { ...s, assignments: [{ ...s.assignments[0], score: 0 }, ...s.assignments.slice(1)] },
      ],
    }),
  ).toThrow('불일치');
});
