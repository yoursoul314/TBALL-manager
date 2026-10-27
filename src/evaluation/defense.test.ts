import { expect, it } from 'vitest';
import { ABILITIES } from '../config/positions';
import { createDemoWorkspace } from '../data/seed';
import { emptyDefenseObservations, saveDefenseAssessment } from '../assessment/defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC, type DefenseInput } from '../domain/defenseAssessment';
import { chooseDefenseEvaluation, defenseEvaluation } from './defense';
import { positionScore, recommendPositions } from './score';
const at = '2026-10-27T02:00:00.000Z';
const input = (): DefenseInput => ({
  date: '2026-10-27',
  situation: 'combined',
  assessor: 'QA',
  note: '',
  error: null,
  rubric: { ...DEFAULT_DEFENSE_RUBRIC },
  observations: emptyDefenseObservations(),
});
const choice = (source: 'manual' | 'checklist', id: string) => ({
  id,
  playerId: 'green-1',
  source,
  changedAt: at,
  changedBy: 'QA',
});
it('적용 전 수동 점수 보존·적용 후 9항목 체크 점수와 TYPE1 가중치 연동·수동 복귀', () => {
  let d = createDemoWorkspace();
  const manual = structuredClone(d.assessments),
    i = input();
  for (const k of ABILITIES) i.observations[k] = 'partial';
  i.observations.C = 'success';
  d = saveDefenseAssessment(d, 'green-1', i, {
    id: 'one',
    revisionId: 'r1',
    at,
    author: 'QA',
    reason: '기록',
  });
  expect(defenseEvaluation(d, 'green-1').abilities).toEqual(manual[0].abilities);
  d = chooseDefenseEvaluation(d, choice('checklist', 'c1'));
  const result = defenseEvaluation(d, 'green-1');
  expect(Object.keys(result.abilities)).toHaveLength(9);
  expect(result.abilities.C).toBe(100);
  expect(result.abilities.G).toBe(50);
  expect(positionScore(result.abilities, '1B')).toBe(65);
  const recommended = recommendPositions(
    d.players.map((p) => ({ playerId: p.id, abilities: defenseEvaluation(d, p.id).abilities })),
  );
  expect(recommended).not.toBeNull();
  d = chooseDefenseEvaluation(d, choice('manual', 'c2'));
  expect(defenseEvaluation(d, 'green-1').abilities).toEqual(manual[0].abilities);
  expect(d.assessments).toEqual(manual);
  expect(d.defenseEvaluationChoices).toHaveLength(2);
});
it('적용한 관찰을 정정·취소하면 기능 점수·적합도가 재계산되고 미측정을 기존 수동으로 채우지 않는다', () => {
  let d = createDemoWorkspace();
  const i = input();
  i.observations.G = 'success';
  d = saveDefenseAssessment(d, 'green-1', i, {
    id: 'one',
    revisionId: 'r1',
    at,
    author: 'QA',
    reason: '기록',
  });
  d = chooseDefenseEvaluation(d, choice('checklist', 'c1'));
  expect(defenseEvaluation(d, 'green-1').abilities).toEqual({ G: 100 });
  expect(positionScore(defenseEvaluation(d, 'green-1').abilities, 'SS')).toBeNull();
  i.observations.G = 'partial';
  d = saveDefenseAssessment(
    d,
    'green-1',
    i,
    { id: 'x', revisionId: 'r2', at, author: 'QA', reason: '정정' },
    'one',
  );
  expect(defenseEvaluation(d, 'green-1').abilities.G).toBe(50);
  d = saveDefenseAssessment(
    d,
    'green-1',
    i,
    { id: 'x', revisionId: 'r3', at, author: 'QA', reason: '취소' },
    'one',
    true,
  );
  expect(defenseEvaluation(d, 'green-1').abilities).toEqual({});
  expect(defenseEvaluation(d, 'green-1').source).toBe('checklist');
});
