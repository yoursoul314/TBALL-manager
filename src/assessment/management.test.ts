import { archiveSelection, planPermanentDeletion } from '../domain/management';
import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { createAssessmentDay, startDayAssessments, assessmentDates } from './days';
import {
  createDefenseDay,
  defenseDates,
  defenseProgress,
  defenseParticipants,
} from './defenseDays';
import { createBattingSession, recordBattingAttempt, blankAttempt } from './batting';
import {
  saveDefenseAssessment,
  emptyDefenseObservations,
  summarizeDefenseAssessments,
} from './defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import { blankFungo } from '../domain/fungo';
import { saveFungo, latestFungo, saveFungoDay, currentFungoRecord } from './fungo';
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
it('v12를 같은 키에서 원자적으로 v14 이전: 원문/평가/보관소 메타데이터 보존', () => {
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
  expect(next.schemaVersion).toBe(14);
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

it('삭제한 타격 날짜에 새 세션 생성: 원본·이전 설정 보존, 과거 점수 미복원', () => {
  const original = batting();
  const deleted = setAssessmentDateArchived(original, 'batting', date, true, m('delete'));
  const before = structuredClone(deleted);
  let d = createAssessmentDay(
    deleted,
    { ...original.battingDays[0], targetAttempts: 3, assessor: '새 평가자', purpose: '새 평가' },
    m('restart'),
  );
  expect(d.assessmentManagement.dayHistory.at(-1)?.restart).toEqual({
    kind: 'batting',
    day: original.battingDays[0],
    recordIds: original.battingSessions.map((s) => s.id),
  });
  expect(d.battingSessions).toEqual(deleted.battingSessions);
  expect(d.battingAttempts).toEqual(original.battingAttempts);
  d = startDayAssessments(d, date, ['green-1'], m('new'));
  expect(d.battingSessions.at(-1)?.sessionNumber).toBe(2);
  expect(d.battingSessions.at(-1)?.targetAttempts).toBe(3);
  expect(summarizeBatting(d, 'green-1').score).toBeNull();
  d = recordBattingAttempt(
    d,
    'new-0',
    1,
    { ...blankAttempt(), result: 'fair', score: 4 },
    m('new-a'),
  );
  expect(summarizeBatting(d, 'green-1').score).toBe(40);
  d = setAssessmentDateArchived(d, 'batting', date, true, m('new-delete'));
  d = setAssessmentDateArchived(d, 'batting', date, false, m('new-restore'));
  expect(summarizeBatting(d, 'green-1').score).toBe(40);
  expect(d.battingSessions[0].status).toBe('cancelled');
  d = setAssessmentRecordArchived(
    d,
    'batting',
    original.battingSessions[0].id,
    false,
    m('explicit-restore'),
  );
  expect(summarizeBatting(d, 'green-1').score).toBe(60);
  expect(readBackup(serializeBackup(d))).toEqual(d);
  expect(deleted).toEqual(before);
  expect(d.games).toEqual(original.games);
  expect(d.events).toEqual(original.events);
});
it('빈 날짜 삭제 후 새 설정 생성 및 반복 삭제·새 생성도 가능', () => {
  let d = createAssessmentDay(createDemoWorkspace(), {
    date,
    targetAttempts: 2,
    assessor: 'QA',
    purpose: '빈 날짜',
    note: '',
    createdAt: at,
  });
  for (let i = 0; i < 3; i++) {
    d = setAssessmentDateArchived(d, 'batting', date, true, m('del' + i));
    d = createAssessmentDay(d, { ...d.battingDays[0], targetAttempts: i + 3 }, m('restart' + i));
  }
  expect(d.battingDays).toHaveLength(1);
  expect(d.battingDays[0].targetAttempts).toBe(5);
  expect(d.assessmentManagement.dayHistory.filter((h) => h.restart)).toHaveLength(3);
  expect(d.battingSessions).toEqual([]);
});
it('모든 세션을 개별 삭제했어도 새 날짜 생성 가능; 남은 활성 기록은 중복 생성 차단', () => {
  let d = batting();
  d = setAssessmentRecordArchived(d, 'batting', d.battingSessions[0].id, true, m('del1'));
  expect(() => createAssessmentDay(d, d.battingDays[0], m('blocked'))).toThrow('이미 등록');
  d = setAssessmentRecordArchived(d, 'batting', d.battingSessions[1].id, true, m('del2'));
  d = createAssessmentDay(d, d.battingDays[0], m('restart'));
  expect(d.assessmentManagement.dayHistory.map((h) => h.archived)).toEqual([true, false]);
  expect(d.battingSessions.every((s) => s.status === 'cancelled')).toBe(true);
});
it('수비 새 날짜는 이전 학생/횟수/평균을 되살리지 않고 새 목표에 맞춰 진행', () => {
  const original = defense();
  const deleted = setAssessmentDateArchived(original, 'defense', date, true, m('delete'));
  let d = createDefenseDay(
    deleted,
    { ...original.defenseDays[0], targetAttempts: 1, playerIds: ['green-2'] },
    m('restart'),
  );
  expect(defenseParticipants(d, date).map((p) => p.id)).toEqual(['green-2']);
  expect(defenseProgress(d, 'green-1', date)).toEqual({ count: 0, target: 1, complete: false });
  expect(d.defenseAssessments).toEqual(deleted.defenseAssessments);
  expect(d.assessmentManagement.dayHistory.at(-1)?.restart?.day).toEqual(original.defenseDays[0]);
  d = saveDefenseAssessment(
    d,
    'green-2',
    {
      date,
      assessor: 'QA',
      situation: 'ground',
      observations: { ...emptyDefenseObservations(), G: 'partial' },
      error: null,
      note: '',
      rubric: DEFAULT_DEFENSE_RUBRIC,
    },
    { id: 'new', revisionId: 'new-v', at, author: 'QA', reason: '신규' },
  );
  expect(defenseProgress(d, 'green-2', date)).toEqual({ count: 1, target: 1, complete: true });
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBeNull();
  expect(summarizeDefenseAssessments(d, 'green-2').abilities.G.score).toBe(50);
  d = setAssessmentDateArchived(d, 'defense', date, true, m('delete2'));
  d = setAssessmentDateArchived(d, 'defense', date, false, m('restore2'));
  expect(d.defenseAssessments[0].revisions.at(-1)?.status).toBe('cancelled');
  expect(summarizeDefenseAssessments(d, 'green-2').abilities.G.count).toBe(1);
});
it('펑고 재생성은 새 ID로 저장하고 이전 취소 기록을 수정하지 않음; 중복 활성 복원 차단', () => {
  let d = saveFungoDay(
    createDemoWorkspace(),
    { date, assessor: 'QA', playerIds: ['green-1'] },
    m('day'),
  );
  const input = {
    ...blankFungo(date, 'QA'),
    mode: 'precise' as const,
    manual: { G: 8, F: 7, C: 9, T_acc: 8, T_pow: 7 },
  };
  d = saveFungo(d, 'green-1', input, { id: 'old', revisionId: 'old-v', at, reason: '신규' });
  d = setAssessmentDateArchived(d, 'fungo', date, true, m('delete'));
  const old = structuredClone(d.fungoAssessments[0]);
  d = saveFungoDay(d, { date, assessor: 'QA', playerIds: ['green-1'] }, m('restart'));
  expect(currentFungoRecord(d, 'green-1', date)).toBeUndefined();
  expect(latestFungo(d, 'green-1').scores.G).toBeNull();
  d = saveFungo(
    d,
    'green-1',
    { ...input, manual: { ...input.manual, G: 4 } },
    { id: 'new', revisionId: 'new-v', at, reason: '신규' },
  );
  expect(d.fungoAssessments).toHaveLength(2);
  expect(d.fungoAssessments[0]).toEqual(old);
  expect(currentFungoRecord(d, 'green-1', date)?.id).toBe('new');
  expect(latestFungo(d, 'green-1').scores.G).toBe(4);
  expect(() => setAssessmentRecordArchived(d, 'fungo', 'old', false, m('blocked'))).toThrow(
    '새 펑고',
  );
  d = setAssessmentDateArchived(d, 'fungo', date, true, m('delete2'));
  d = setAssessmentDateArchived(d, 'fungo', date, false, m('restore2'));
  expect(latestFungo(d, 'green-1').scores.G).toBe(4);
  expect(d.fungoAssessments[0]).toEqual(old);
  expect(readBackup(serializeBackup(d))).toEqual(d);
});
it('펑고 학생 변경은 활성 날짜에서 가능하고 새 날짜 중복/삭제 날짜 변경은 차단', () => {
  let d = saveFungoDay(
    createDemoWorkspace(),
    { date, assessor: 'QA', playerIds: ['green-1'] },
    m('day'),
  );
  expect(() => saveFungoDay(d, d.fungoDays[0], m('duplicate'))).toThrow('이미 등록');
  d = saveFungoDay(d, { ...d.fungoDays[0], playerIds: ['green-2'] }, m('edit'), true);
  expect(d.fungoDays[0].playerIds).toEqual(['green-2']);
  d = setAssessmentDateArchived(d, 'fungo', date, true, m('delete'));
  expect(() => saveFungoDay(d, d.fungoDays[0], m('edit2'), true)).toThrow('삭제한');
});
it('v13 백업·같은 저장키 이전은 삭제 이력·원문을 보존하고 재생성 설정을 재열기', () => {
  const old = {
    ...setAssessmentDateArchived(batting(), 'batting', date, true, m('delete')),
    schemaVersion: 13,
  };
  const raw = JSON.stringify(old);
  const rows = new Map([[STORAGE_KEY, raw]]);
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => rows.get(k) ?? null,
    setItem: (k, v) => {
      rows.set(k, v);
    },
  });
  const d = repo.load()!;
  expect(d.schemaVersion).toBe(14);
  expect(d.migrationSource).toEqual({ schemaVersion: 13, raw });
  expect(d.assessmentManagement).toEqual(old.assessmentManagement);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 13, workspace: old })),
  ).toEqual(d);
  const next = createAssessmentDay(d, d.battingDays[0], m('restart'));
  repo.save(next, d.revision);
  expect(repo.load()?.assessmentManagement).toEqual(next.assessmentManagement);
  expect(repo.load()?.battingAttempts).toEqual(old.battingAttempts);
});
it('v13 용량 부족 이전과 새 날짜 저장 실패는 원문 보존, 읽기 전용 백업 가능', () => {
  const old = {
    ...setAssessmentDateArchived(batting(), 'batting', date, true, m('delete')),
    schemaVersion: 13,
  };
  const raw = JSON.stringify(old),
    rows = new Map([[STORAGE_KEY, raw]]);
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => rows.get(k) ?? null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError');
    },
  });
  expect(() => repo.load()).toThrow();
  const d = repo.load(false)!;
  const next = createAssessmentDay(d, d.battingDays[0], m('restart'));
  expect(() => repo.save(next, d.revision)).toThrow();
  expect(rows.get(STORAGE_KEY)).toBe(raw);
  expect(readBackup(serializeBackup(d)).battingAttempts).toEqual(old.battingAttempts);
});

it('기존 활성 평가에 공통 날짜 설정이 없으면 기록을 보존하며 설정만 추가', () => {
  const b = batting(),
    d = defense();
  expect(createAssessmentDay({ ...b, battingDays: [] }, b.battingDays[0]).battingSessions).toEqual(
    b.battingSessions,
  );
  expect(createDefenseDay({ ...d, defenseDays: [] }, d.defenseDays[0]).defenseAssessments).toEqual(
    d.defenseAssessments,
  );
});
it('학생 완전삭제는 이전 날짜 설정의 학생 ID도 제거하고 다른 학생은 유지', () => {
  let d = defense();
  d = setAssessmentDateArchived(d, 'defense', date, true, m('delete'));
  d = createDefenseDay(d, { ...d.defenseDays[0], playerIds: ['green-2'] }, m('restart'));
  d = archiveSelection(d, 'players', ['green-1'], true, at);
  const result = planPermanentDeletion(d, 'players', ['green-1']).workspace;
  const snapshot = result.assessmentManagement.dayHistory.at(-1)?.restart;
  expect(snapshot?.kind).toBe('defense');
  if (snapshot?.kind === 'defense') expect(snapshot.day?.playerIds).toEqual([]);
  expect(result.defenseDays[0].playerIds).toEqual(['green-2']);
  expect(result.defenseAssessments).toEqual([]);
});
it('새 시작 이력의 종류·날짜·중복 ID 위변조는 백업 검증에서 차단', () => {
  const deleted = setAssessmentDateArchived(batting(), 'batting', date, true, m('del'));
  const d = createAssessmentDay(deleted, deleted.battingDays[0], m('restart'));
  const bad = structuredClone(d);
  bad.assessmentManagement.dayHistory.at(-1)!.restart!.day!.date = '2026-10-29';
  expect(() => parseWorkspace(bad)).toThrow('새 시작 이력');
});
