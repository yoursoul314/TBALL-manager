import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  applyDefenseDayScores,
  createDefenseDay,
  addDefenseParticipants,
  defenseParticipants,
  defenseDates,
} from './defenseDays';
import {
  saveDefenseAssessment,
  emptyDefenseObservations,
  summarizeDefenseAssessments,
} from './defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import {
  LocalWorkspaceRepository,
  V8_STORAGE_KEY,
  STORAGE_KEY,
  serializeBackup,
  readBackup,
} from '../data/repository';
import { resetWorkspace } from '../domain/reset';
import { archiveSelection, planPermanentDeletion } from '../domain/management';
const at = '2026-10-27T03:00:00.000Z',
  day = {
    date: '2026-10-27',
    assessor: 'QA',
    purpose: '수비',
    note: '',
    playerIds: [],
    createdAt: at,
  };
it('날짜 먼저 생성·복수 학생 순서 유지·중복 방지·유효하지 않은 학생 일괄 차단', () => {
  let d = createDefenseDay(createDemoWorkspace(), day);
  expect(defenseParticipants(d, day.date)).toEqual([]);
  expect(() => createDefenseDay(d, day)).toThrow('이미');
  d = addDefenseParticipants(d, day.date, ['green-2', 'green-1', 'green-2']);
  expect(defenseParticipants(d, day.date).map((p) => p.id)).toEqual(['green-2', 'green-1']);
  expect(() => addDefenseParticipants(d, day.date, ['green-3', 'missing'])).toThrow('등록');
  expect(d.defenseDays[0].playerIds).toHaveLength(2);
});
it('기존 개별 수비 날짜 조회 및 날짜별·누적 점수에서 유효 기회만 집계한다', () => {
  let d = createDemoWorkspace();
  for (let n = 0; n < 3; n++)
    d = saveDefenseAssessment(
      d,
      'green-1',
      {
        date: n === 0 ? '2026-10-26' : day.date,
        situation: 'ground',
        assessor: 'QA',
        note: '',
        error: null,
        rubric: DEFAULT_DEFENSE_RUBRIC,
        observations: { ...emptyDefenseObservations(), G: n === 0 ? 'success' : 'failure' },
      },
      { id: 'r' + n, revisionId: 'rev' + n, at, author: 'QA', reason: '기록' },
    );
  expect(defenseDates(d)).toEqual(['2026-10-27', '2026-10-26']);
  expect(defenseParticipants(d, day.date)[0].id).toBe('green-1');
  expect(summarizeDefenseAssessments(d, 'green-1', day.date).abilities.G.score).toBe(0);
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBeCloseTo(100 / 3);
});
it('v8 이전·백업·새로고침과 구버전 충돌 검증에서 원문과 수비 이력을 보존한다', () => {
  const current = createDemoWorkspace();
  const { defenseDays, comparisonSelection, ...rest } = current;
  void defenseDays;
  void comparisonSelection;
  const old = { ...rest, schemaVersion: 8 },
    raw = JSON.stringify(old),
    map = new Map([[V8_STORAGE_KEY, raw]]);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  const repo = new LocalWorkspaceRepository(storage),
    d = repo.load()!;
  expect(d.schemaVersion).toBe(14);
  expect(d.migrationSource?.raw).toBe(raw);
  expect(d.assessments).toEqual(old.assessments);
  expect(d.defenseDays).toEqual([]);
  expect(map.get(V8_STORAGE_KEY)).toBe(raw);
  const saved = repo.save(createDefenseDay(d, day), d.revision);
  expect(new LocalWorkspaceRepository(storage).load()).toEqual(saved);
  expect(readBackup(serializeBackup(saved))).toEqual(saved);
  expect(map.has(STORAGE_KEY)).toBe(true);
  map.set(V8_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(saved, saved.revision)).toThrow('구버전');
});
it('날짜 학생명단·후보 참조를 선수 완전삭제와 평가 초기화 범위에 맞게 정리한다', () => {
  let d = addDefenseParticipants(createDefenseDay(createDemoWorkspace(), day), day.date, [
    'green-1',
    'green-2',
  ]);
  d.comparisonSelection = {
    playerIds: ['green-1', 'green-2'],
    note: '',
    updatedAt: at,
    status: 'draft',
  };
  expect(resetWorkspace(d, 'games', at).defenseDays).toEqual(d.defenseDays);
  expect(resetWorkspace(d, 'evaluations', at).defenseDays).toEqual([]);
  d = archiveSelection(d, 'players', ['green-1'], true, at);
  const next = planPermanentDeletion(d, 'players', ['green-1']).workspace;
  expect(next.defenseDays[0].playerIds).toEqual(['green-2']);
  expect(next.comparisonSelection?.playerIds).toEqual(['green-2']);
});

it('날짜의 유효 관찰 학생만 누적 체크 출처로 일괄 적용한다', () => {
  let d = addDefenseParticipants(createDefenseDay(createDemoWorkspace(), day), day.date, [
    'green-1',
    'green-2',
  ]);
  d = saveDefenseAssessment(
    d,
    'green-1',
    {
      date: day.date,
      situation: 'ground',
      assessor: 'QA',
      note: '',
      error: null,
      rubric: DEFAULT_DEFENSE_RUBRIC,
      observations: { ...emptyDefenseObservations(), G: 'success' },
    },
    { id: 'one', revisionId: 'r1', at, author: 'QA', reason: '기록' },
  );
  const next = applyDefenseDayScores(d, day.date, 'QA', at, 'source');
  expect(next.defenseEvaluationChoices.map((c) => c.playerId)).toEqual(['green-1']);
  expect(next.assessments).toEqual(d.assessments);
});
