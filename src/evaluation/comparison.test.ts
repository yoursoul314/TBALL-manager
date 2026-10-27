import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { comparisonRows, comparisonInsights, saveComparisonSelection } from './comparison';
import { saveDefenseAssessment, emptyDefenseObservations } from '../assessment/defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import { chooseDefenseEvaluation } from './defense';
const at = '2026-10-27T03:00:00.000Z';
it('다른 경기의 타율·장타율을 합계 타수로 재계산하고 미출전은 미측정으로 비교한다', () => {
  const d = createDemoWorkspace();
  const g = d.games[0];
  d.events = [
    {
      id: 's',
      gameId: g.id,
      schemaVersion: 3,
      sequence: 1,
      deviceId: 'QA',
      recordedAt: at,
      payload: { type: 'START_PLAY' },
    },
    {
      id: 'e',
      gameId: g.id,
      schemaVersion: 3,
      sequence: 2,
      deviceId: 'QA',
      recordedAt: at,
      payload: {
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'double',
        direction: 'left',
        quality: 'ground',
        fielding: [],
        outcomes: [{ playerId: 'green-1', to: 2, action: 'advance' }],
      },
    },
  ];
  d.games.push({ ...g, id: 'another-game' });
  d.events.push(
    ...d.events.map((e) => ({
      ...e,
      id: e.id + '-second',
      gameId: 'another-game',
      payload:
        e.payload.type === 'END_PLAY'
          ? {
              ...e.payload,
              result: 'home-run' as const,
              outcomes: [{ playerId: 'green-1', to: 'home' as const, action: 'advance' as const }],
            }
          : e.payload,
    })),
  );
  const rows = comparisonRows(d, ['green-1', 'green-2']);
  expect(rows[0].stats.atBats).toBe(2);
  expect(rows[0].stats.totalBases).toBe(6);
  expect(rows[0].metrics.find((m) => m.key === 'avg')?.value).toBe(1);
  expect(rows[0].metrics.find((m) => m.key === 'slg')?.value).toBe(3);
  expect(rows[1].metrics.find((m) => m.key === 'avg')?.value).toBeNull();
  expect(rows[0].batting.count).toBe(0);
});
it('관찰 수와 출처가 맞는 학생끼리만 근거를 비교하고 표본 부족·배점 차이는 보류한다', () => {
  let d = createDemoWorkspace();
  for (const [id, outcome] of [
    ['green-1', 'success'],
    ['green-2', 'failure'],
  ] as const) {
    d = saveDefenseAssessment(
      d,
      id,
      {
        date: '2026-10-27',
        assessor: 'QA',
        situation: 'ground',
        note: '',
        error: null,
        rubric: DEFAULT_DEFENSE_RUBRIC,
        observations: { ...emptyDefenseObservations(), G: outcome },
      },
      { id, revisionId: id + 'r', at, author: 'QA', reason: '기록' },
    );
    d = chooseDefenseEvaluation(d, {
      id: id + 'choice',
      playerId: id,
      source: 'checklist',
      changedAt: at,
      changedBy: 'QA',
    });
  }
  let rows = comparisonRows(d, ['green-1', 'green-2']);
  expect(comparisonInsights(rows[0], rows, 15).strengths).toEqual([]);
  expect(comparisonInsights(rows[0], rows, 1).strengths[0].metric.key).toBe('G');
  expect(comparisonInsights(rows[1], rows, 1).weaknesses[0].metric.key).toBe('G');
  d.defenseAssessments[1].revisions[0].rubric = { ...DEFAULT_DEFENSE_RUBRIC, success: 4 };
  rows = comparisonRows(d, ['green-1', 'green-2']);
  expect(comparisonInsights(rows[0], rows, 1).strengths).toEqual([]);
});
it('수동 능력 점수는 관찰 횟수를 만들어 비교하지 않고 검토 후보는 초안으로 보존한다', () => {
  const d = createDemoWorkspace(),
    rows = comparisonRows(d, ['green-1', 'green-2']);
  expect(comparisonInsights(rows[0], rows, 1).strengths).toEqual([]);
  const next = saveComparisonSelection(d, ['green-2', 'green-1', 'green-1'], '근거 검토', at);
  expect(next.comparisonSelection?.playerIds).toEqual(['green-2', 'green-1']);
  expect(next.comparisonSelection?.status).toBe('draft');
  expect(next.games).toEqual(d.games);
  expect(next.selections).toEqual(d.selections);
  expect(() => saveComparisonSelection(d, ['missing'], '', at)).toThrow('출전');
});
