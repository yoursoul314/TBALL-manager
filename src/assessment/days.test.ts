import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { createAssessmentDay, startDayAssessments, assessmentDates } from './days';
import { blankAttempt, recordBattingAttempt, reviseBattingSession } from './batting';
import { summarizeBatting } from './battingSummary';
import { calculateStats } from '../statistics/calculate';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V7_STORAGE_KEY,
  readBackup,
  serializeBackup,
} from '../data/repository';
import { resetWorkspace } from '../domain/reset';
const at = '2026-10-26T06:00:00.000Z';
const day = {
  date: '2026-10-26',
  targetAttempts: 2,
  assessor: 'QA',
  purpose: '가상 평가',
  note: '',
  createdAt: at,
};
const meta = { id: 'batch', at, actor: 'QA', reason: '일괄 시작' };
it('날짜만 생성·저장·재열기하고 선택 학생 세션을 한번에 만든다', () => {
  const store = new Map<string, string>();
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
  });
  let data = createAssessmentDay(createDemoWorkspace(), day);
  repo.save(data, 0);
  data = repo.load()!;
  expect(data.battingDays).toEqual([day]);
  expect(data.battingSessions).toEqual([]);
  data = startDayAssessments(data, day.date, ['green-1', 'orange-1', 'green-1'], meta);
  expect(data.battingSessions).toHaveLength(2);
  expect(data.battingAudit).toHaveLength(2);
  expect(data.battingAttempts).toEqual([]);
  expect(data.battingSessions.every((s) => s.targetAttempts === 2 && s.assessor === 'QA')).toBe(
    true,
  );
  expect(
    startDayAssessments(data, day.date, ['green-1', 'orange-1'], { ...meta, id: 'retry' }),
  ).toBe(data);
  expect(readBackup(serializeBackup(data))).toEqual(data);
});
it('동일 날짜 중복·삭제 학생·빈 선택은 모두 거절하고 원본을 유지한다', () => {
  const data = createAssessmentDay(createDemoWorkspace(), day);
  data.players[0].archivedAt = at;
  expect(() => createAssessmentDay(data, day)).toThrow('이미 등록');
  expect(() => startDayAssessments(data, day.date, [], meta)).toThrow('학생을 선택');
  expect(() => startDayAssessments(data, day.date, ['orange-1', 'green-1'], meta)).toThrow(
    '등록된 학생',
  );
  expect(data.battingSessions).toEqual([]);
});
it('날짜별 여러 학생 점수는 분리되며 취소 학생만 새 세션으로 재시작한다', () => {
  let data = startDayAssessments(
    createAssessmentDay(createDemoWorkspace(), day),
    day.date,
    ['green-1', 'orange-1'],
    meta,
  );
  const originalStats = calculateStats(data.games[0], data.events, data.policy);
  data = recordBattingAttempt(
    data,
    'batch-0',
    1,
    { ...blankAttempt(), result: 'fair', score: 8 },
    { ...meta, id: 'attempt-1' },
  );
  data = recordBattingAttempt(
    data,
    'batch-1',
    1,
    { ...blankAttempt(), result: 'fair', score: 6 },
    { ...meta, id: 'attempt-2' },
  );
  expect(summarizeBatting(data, 'green-1').score).toBe(80);
  expect(summarizeBatting(data, 'orange-1').score).toBe(60);
  expect(calculateStats(data.games[0], data.events, data.policy)).toEqual(originalStats);
  data = reviseBattingSession(data, 'batch-0', { status: 'cancelled' }, { ...meta, id: 'cancel' });
  const next = startDayAssessments(data, day.date, ['green-1', 'orange-1'], {
    ...meta,
    id: 'restart',
  });
  expect(next.battingSessions).toHaveLength(3);
  expect(next.battingSessions.at(-1)?.sessionNumber).toBe(2);
  expect(next.battingAttempts).toEqual(data.battingAttempts);
});
it('v7 원문·개인별 평가를 보존하고 v8 빈 날짜 목록으로 이전하며 구버전 충돌을 차단한다', () => {
  const original = createDemoWorkspace();
  const raw = JSON.stringify({ ...original, schemaVersion: 7, battingDays: undefined });
  const map = new Map([[V7_STORAGE_KEY, raw]]);
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  });
  const next = repo.load()!;
  expect(next.schemaVersion).toBe(11);
  expect(next.battingDays).toEqual([]);
  expect(next.players).toEqual(original.players);
  expect(next.games).toEqual(original.games);
  expect(map.get(V7_STORAGE_KEY)).toBe(raw);
  expect(next.migrationSource?.raw).toBe(raw);
  expect(map.has(STORAGE_KEY)).toBe(true);
  map.set(V7_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(next, next.revision)).toThrow('구버전');
});
it('기록 초기화는 평가 날짜도 정리하며 경기만 초기화는 날짜를 유지한다', () => {
  const data = createAssessmentDay(createDemoWorkspace(), day);
  expect(assessmentDates(data)).toEqual([day.date]);
  expect(resetWorkspace(data, 'games', at).battingDays).toEqual([day]);
  expect(resetWorkspace(data, 'evaluations', at).battingDays).toEqual([]);
});
