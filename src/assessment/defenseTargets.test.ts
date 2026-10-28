import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { createDefenseDay, setDefenseTarget, defenseProgress } from './defenseDays';
import {
  emptyDefenseObservations,
  saveDefenseAssessment,
  summarizeDefenseAssessments,
} from './defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import {
  LocalWorkspaceRepository,
  V10_STORAGE_KEY,
  STORAGE_KEY,
  readBackup,
  serializeBackup,
} from '../data/repository';
const date = '2026-10-27',
  at = '2026-10-27T01:00:00Z';
const input = {
  date,
  assessor: 'QA',
  situation: 'ground' as const,
  note: '',
  error: null,
  rubric: DEFAULT_DEFENSE_RUBRIC,
  observations: { ...emptyDefenseObservations(), G: 'success' as const },
};
const meta = (id: string) => ({
  id,
  revisionId: id + '-revision',
  at,
  author: 'QA',
  reason: '검증',
});
const day = {
  date,
  assessor: 'QA',
  purpose: '수비',
  note: '',
  playerIds: ['green-1', 'green-2'],
  createdAt: at,
};
it('v10 날짜 목표는 null로 이전하며 원문·사진 참조·평가·경기와 백업을 보존한다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 10, defenseDays: [day] };
  const raw = JSON.stringify(old),
    map = new Map([[V10_STORAGE_KEY, raw]]);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  const repo = new LocalWorkspaceRepository(storage),
    d = repo.load()!;
  expect(d.schemaVersion).toBe(13);
  expect(d.defenseDays[0].targetAttempts).toBeNull();
  expect(d.migrationSource?.raw).toBe(raw);
  expect(map.get(V10_STORAGE_KEY)).toBe(raw);
  for (const key of [
    'players',
    'games',
    'events',
    'assessments',
    'battingSessions',
    'battingAttempts',
    'selections',
  ] as const)
    expect(d[key]).toEqual(old[key]);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 10, workspace: old }))
      .defenseDays[0].targetAttempts,
  ).toBeNull();
  const next = repo.save(setDefenseTarget(d, date, 3), d.revision);
  expect(readBackup(serializeBackup(next))).toEqual(next);
  expect(repo.load()).toEqual(next);
  map.set(V10_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(next, next.revision)).toThrow('구버전');
  expect(JSON.parse(map.get(STORAGE_KEY)!).defenseDays[0].targetAttempts).toBe(3);
});
it('v10→v11 저장 실패는 원문을 덮어쓰거나 삭제하지 않는다', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 10 });
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => (k === V10_STORAGE_KEY ? raw : null),
    setItem: () => {
      throw Error('quota');
    },
  });
  expect(() => repo.load()).toThrow('quota');
  expect(JSON.parse(raw).schemaVersion).toBe(10);
});
it('목표·학생별 진행·정정·취소·복원·추가 회차가 점수 분모와 독립적이다', () => {
  let d = createDefenseDay(createDemoWorkspace(), { ...day, targetAttempts: 2 });
  d = saveDefenseAssessment(d, 'green-1', input, meta('one'));
  d = saveDefenseAssessment(
    d,
    'green-1',
    { ...input, observations: { ...emptyDefenseObservations(), G: 'not-offered' } },
    meta('two'),
  );
  expect(defenseProgress(d, 'green-1', date)).toEqual({ count: 2, target: 2, complete: true });
  expect(defenseProgress(d, 'green-2', date).count).toBe(0);
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G).toMatchObject({
    count: 1,
    score: 100,
    notOffered: 1,
  });
  expect(() => saveDefenseAssessment(d, 'green-1', input, meta('three'))).toThrow('완료');
  d = saveDefenseAssessment(
    d,
    'green-1',
    { ...input, observations: { ...input.observations, G: 'failure' } },
    meta('edit'),
    'one',
  );
  expect(defenseProgress(d, 'green-1', date).count).toBe(2);
  expect(d.defenseAssessments[0].revisions[0].observations.G).toBe('success');
  d = saveDefenseAssessment(d, 'green-1', input, meta('cancel'), 'one', true);
  expect(defenseProgress(d, 'green-1', date)).toEqual({ count: 1, target: 2, complete: false });
  d = saveDefenseAssessment(d, 'green-1', input, meta('three'));
  expect(() => saveDefenseAssessment(d, 'green-1', input, meta('restore'), 'one')).toThrow('완료');
  expect(() => setDefenseTarget(d, date, 1)).toThrow('이미 기록');
  for (const bad of [0, 1.5, 201, NaN]) expect(() => setDefenseTarget(d, date, bad)).toThrow();
  d = setDefenseTarget(d, date, 3);
  d = saveDefenseAssessment(d, 'green-1', input, meta('restore'), 'one');
  expect(defenseProgress(d, 'green-1', date).count).toBe(3);
  expect(d.defenseAssessments[0].revisions).toHaveLength(4);
});
