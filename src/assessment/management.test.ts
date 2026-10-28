import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { createAssessmentDay, startDayAssessments, assessmentDates } from './days';
import { createDefenseDay, defenseDates } from './defenseDays';
import { createBattingSession, recordBattingAttempt, blankAttempt } from './batting';
import {
  saveDefenseAssessment,
  emptyDefenseObservations,
  summarizeDefenseAssessments,
} from './defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import { blankFungo } from '../domain/fungo';
import { saveFungo, latestFungo } from './fungo';
import { summarizeBatting } from './battingSummary';
import {
  registerAssessor,
  setAssessorArchived,
  setAssessmentDateArchived,
  setAssessmentRecordArchived,
} from './management';
import { migrateWorkspace } from '../data/migration';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  serializeBackup,
  readBackup,
} from '../data/repository';
import { resetWorkspace } from '../domain/reset';
import { parseWorkspace } from '../data/schema';
const date = '2026-10-28',
  at = '2026-10-28T01:00:00Z';
const m = (id: string) => ({ id, at, actor: 'QA', reason: id });
function batting() {
  let d = createAssessmentDay(createDemoWorkspace(), {
    date,
    targetAttempts: 2,
    assessor: 'QA',
    purpose: '삭제 검증',
    note: '',
    createdAt: at,
  });
  d = startDayAssessments(d, date, ['green-1', 'green-2'], m('start'));
  for (const [i, s] of d.battingSessions.entries())
    d = recordBattingAttempt(
      d,
      s.id,
      1,
      { ...blankAttempt(), result: 'fair', score: i ? 6 : 8 },
      m('a' + i),
    );
  return d;
}
function defense() {
  let d = createDefenseDay(createDemoWorkspace(), {
    date,
    assessor: 'QA',
    purpose: '수비',
    note: '',
    playerIds: ['green-1'],
    createdAt: at,
    targetAttempts: 2,
  });
  for (let i = 0; i < 2; i++)
    d = saveDefenseAssessment(
      d,
      'green-1',
      {
        date,
        assessor: 'QA',
        situation: 'ground',
        observations: { ...emptyDefenseObservations(), G: i ? 'partial' : 'success' },
        error: null,
        note: '',
        rubric: DEFAULT_DEFENSE_RUBRIC,
      },
      { id: 'r' + i, revisionId: 'v' + i, at, author: 'QA', reason: '신규' },
    );
  return d;
}
it('평가자 등록/중복 차단/사용 중지·복원은 과거 평가 이름을 변경하지 않음', () => {
  const base = batting();
  let d = registerAssessor(base, ' QA ', 'p', at);
  expect(() => registerAssessor(d, 'QA', 'p2', at)).toThrow('이미');
  d = setAssessorArchived(d, 'p', true, at);
  expect(d.assessmentManagement.assessors[0].archivedAt).toBe(at);
  expect(d.battingSessions).toEqual(base.battingSessions);
  d = setAssessorArchived(d, 'p', false, at);
  expect(d.assessmentManagement.assessors[0].archivedAt).toBeNull();
  expect(readBackup(serializeBackup(d))).toEqual(d);
});
it('타격 날짜 삭제·복원은 평균을 재계산하며 이전 개별 취소는 복원하지 않음', () => {
  let d = batting();
  const second = d.battingSessions[1].id;
  d = setAssessmentRecordArchived(d, 'batting', second, true, m('predelete'));
  const original = d.battingAttempts;
  d = setAssessmentDateArchived(d, 'batting', date, true, m('date-delete'));
  expect(assessmentDates(d)).not.toContain(date);
  expect(summarizeBatting(d, 'green-1').count).toBe(0);
  expect(d.battingAttempts).toEqual(original);
  expect(() => setAssessmentDateArchived(d, 'batting', date, true, m('again'))).toThrow('이미');
  d = setAssessmentDateArchived(d, 'batting', date, false, m('restore'));
  expect(summarizeBatting(d, 'green-1').score).toBe(80);
  expect(d.battingSessions.find((s) => s.id === second)!.status).toBe('cancelled');
  expect(d.games).toEqual(
    createDemoWorkspace().games.map((g) => ({ ...g, createdAt: d.games[0].createdAt })),
  );
  expect(d.events).toEqual([]);
});
it('빈 날짜도 삭제/복원되며 삭제 날짜에 새 기록/세션 추가를 차단', () => {
  let d = createAssessmentDay(createDemoWorkspace(), {
    date,
    targetAttempts: 10,
    assessor: 'QA',
    purpose: '빈 날짜',
    note: '',
    createdAt: at,
  });
  d = setAssessmentDateArchived(d, 'batting', date, true, m('delete'));
  expect(() => startDayAssessments(d, date, ['green-1'], m('new'))).toThrow('복원');
  expect(() =>
    createBattingSession(
      d,
      { date, playerId: 'green-1', targetAttempts: 1, assessor: 'QA', purpose: 'a', note: '' },
      m('s'),
    ),
  ).toThrow('복원');
  d = setAssessmentDateArchived(d, 'batting', date, false, m('restore'));
  expect(assessmentDates(d)).toContain(date);
});
it('개별 타격 회차 삭제·복원은 동일 ID/원본 감사 보존·분모 재계산', () => {
  let d = batting(),
    before = d.battingAttempts[0];
  d = setAssessmentRecordArchived(d, 'batting-attempt', before.id, true, m('delete-a'));
  expect(summarizeBatting(d, 'green-1').score).toBeNull();
  expect(d.battingAudit.at(-1)!.before).toEqual(before);
  d = setAssessmentRecordArchived(d, 'batting-attempt', before.id, false, m('restore-a'));
  expect(summarizeBatting(d, 'green-1').score).toBe(80);
  expect(d.battingAttempts[0].id).toBe(before.id);
});
it('수비 날짜 전체 삭제·복원은 9능력 점수와 최초 관찰 원문 보존', () => {
  let d = defense();
  const first = structuredClone(d.defenseAssessments);
  d = setAssessmentRecordArchived(d, 'defense', 'r1', true, m('predelete'));
  d = setAssessmentDateArchived(d, 'defense', date, true, m('delete'));
  expect(defenseDates(d)).not.toContain(date);
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBeNull();
  expect(d.defenseAssessments[0].revisions[0]).toEqual(first[0].revisions[0]);
  d = setAssessmentDateArchived(d, 'defense', date, false, m('restore'));
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBe(100);
  expect(d.defenseAssessments[1].revisions.at(-1)!.status).toBe('cancelled');
});
it('수비 개별 복원은 목표 횟수 초과를 차단', () => {
  let d = defense();
  d = setAssessmentRecordArchived(d, 'defense', 'r1', true, m('del'));
  d = { ...d, defenseDays: d.defenseDays.map((x) => ({ ...x, targetAttempts: 1 })) };
  expect(() => setAssessmentRecordArchived(d, 'defense', 'r1', false, m('restore'))).toThrow(
    '횟수',
  );
});
it('펑고 날짜 삭제·복원은 추천 입력값 재계산과 원본5구 유지', () => {
  let d = createDemoWorkspace();
  d.fungoDays = [{ date, assessor: 'QA', playerIds: ['green-1'] }];
  const input = {
    ...blankFungo(date, 'QA'),
    mode: 'precise' as const,
    manual: { G: 8, F: 7, C: 9, T_acc: 8, T_pow: 7 },
  };
  d = saveFungo(d, 'green-1', input, { id: 'f', revisionId: 'f0', at, reason: '최초' });
  d = setAssessmentDateArchived(d, 'fungo', date, true, m('delete'));
  expect(latestFungo(d, 'green-1').scores.G).toBeNull();
  expect(() =>
    saveFungo(d, 'green-1', input, { id: 'f', revisionId: 'f1', at, reason: '복원' }),
  ).toThrow('복원');
  d = setAssessmentDateArchived(d, 'fungo', date, false, m('restore'));
  expect(latestFungo(d, 'green-1').scores.G).toBe(8);
  expect(d.fungoAssessments[0].revisions).toHaveLength(3);
});
it('v12를 같은 키에서 원자적으로 v13 이전: 원문/평가/보관소 메타데이터 보존', () => {
  const old = { ...batting(), schemaVersion: 12, _storageArchiveId: 'kept' };
  const raw = JSON.stringify(old);
  const rows = new Map([[STORAGE_KEY, raw]]),
    storage = {
      getItem: (k: string) => rows.get(k) ?? null,
      setItem: (k: string, v: string) => {
        rows.set(k, v);
      },
    };
  const repo = new LocalWorkspaceRepository(storage);
  const next = repo.load()!;
  expect(next.schemaVersion).toBe(13);
  expect(next.migrationSource).toEqual({ schemaVersion: 12, raw });
  expect(next.battingAttempts).toEqual(old.battingAttempts);
  expect(next.assessmentManagement.assessors).toEqual([]);
  expect(repo.hasStorageArchive()).toBe(true);
  expect(repo.load()).toEqual(next);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 12, workspace: old }))
      .battingSessions,
  ).toEqual(old.battingSessions);
});
it('v12 저장 실패는 원문을 그대로 유지하며 읽기 전용 이전과 백업 가능', () => {
  const raw = JSON.stringify({ ...batting(), schemaVersion: 12 });
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => (k === STORAGE_KEY ? raw : null),
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  });
  expect(() => repo.load()).toThrow();
  expect(repo.load(false)!.migrationSource!.raw).toBe(raw);
  expect(readBackup(serializeBackup(repo.load(false)!)).battingAttempts).toEqual(
    batting().battingAttempts.map((a) => ({ ...a })),
  );
});
it('기록 초기화는 평가자 유지, 전체 초기화는 평가자도 삭제', () => {
  let d = registerAssessor(batting(), 'QA', 'p', at);
  d = setAssessmentDateArchived(d, 'batting', date, true, m('del'));
  const records = resetWorkspace(d, 'evaluations', at);
  expect(records.assessmentManagement.dayHistory).toEqual([]);
  expect(records.assessmentManagement.assessors).toHaveLength(1);
  expect(resetWorkspace(d, 'all', at).assessmentManagement.assessors).toEqual([]);
});
it('이전 백업에는 새 평가자를 임의 생성하지 않고 중복 레지스트리는 검증 차단', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 12 };
  delete (old as Partial<typeof old>).assessmentManagement;
  const migrated = migrateWorkspace(old);
  expect(migrated.assessmentManagement).toEqual({ assessors: [], dayHistory: [] });
  const d = registerAssessor(migrated, 'QA', 'a', at);
  expect(() =>
    parseWorkspace({
      ...d,
      assessmentManagement: {
        ...d.assessmentManagement,
        assessors: [...d.assessmentManagement.assessors, ...d.assessmentManagement.assessors],
      },
    }),
  ).toThrow('중복');
});
