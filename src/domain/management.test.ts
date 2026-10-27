import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { archiveSelection, planPermanentDeletion } from './management';
import { createAssessmentDay, startDayAssessments } from '../assessment/days';
import { blankAttempt, recordBattingAttempt } from '../assessment/batting';
import { parseWorkspace } from '../data/schema';
const at = '2026-10-26T06:00:00.000Z';
it('여러 선수 삭제·복원은 기록 원본과 학생 정보를 유지한다', () => {
  const d = createDemoWorkspace();
  const removed = archiveSelection(d, 'players', ['green-1', 'green-2'], true, at);
  expect(removed.players.filter((p) => p.archivedAt)).toHaveLength(2);
  expect(removed.games).toEqual(d.games);
  expect(removed.assessments).toEqual(d.assessments);
  expect(d.players.some((p) => p.archivedAt)).toBe(false);
  expect(
    archiveSelection(removed, 'players', ['green-1', 'green-2'], false, at).players.some(
      (p) => p.archivedAt,
    ),
  ).toBe(false);
});
it('선수 완전삭제는 연결된 경기 전체·평가·회차·감사만 정리하고 타 학생 평가를 보존한다', () => {
  let d = createAssessmentDay(createDemoWorkspace(), {
    date: '2026-10-26',
    assessor: 'QA',
    targetAttempts: 1,
    purpose: '가상',
    note: '',
    createdAt: at,
  });
  d = startDayAssessments(d, '2026-10-26', ['green-1', 'green-2'], {
    id: 'batch',
    at,
    actor: 'QA',
    reason: '신규',
  });
  d = recordBattingAttempt(
    d,
    'batch-0',
    1,
    { ...blankAttempt(), result: 'fair', score: 8 },
    { id: 'a', at, actor: 'QA', reason: '기록' },
  );
  d = archiveSelection(d, 'players', ['green-1'], true, at);
  const plan = planPermanentDeletion(d, 'players', ['green-1']);
  expect(plan.counts.games).toBe(1);
  expect(plan.counts.sessions).toBe(1);
  expect(plan.counts.attempts).toBe(1);
  expect(plan.workspace.games).toEqual([]);
  expect(plan.workspace.players).toHaveLength(23);
  expect(plan.workspace.assessments).toEqual(d.assessments.filter((a) => a.playerId !== 'green-1'));
  expect(plan.workspace.battingSessions[0].playerId).toBe('green-2');
  expect(plan.workspace.battingAudit).toHaveLength(1);
  expect(plan.photoIds).toEqual(['green-1']);
  expect(parseWorkspace(plan.workspace)).toEqual(plan.workspace);
  expect(d.players).toHaveLength(24);
});
it('팀 완전삭제는 경기와 팀만 제거하고 소속 학생은 공통 명단으로 보존한다', () => {
  const d = archiveSelection(createDemoWorkspace(), 'teams', ['green'], true, at);
  const plan = planPermanentDeletion(d, 'teams', ['green']);
  expect(plan.workspace.teams).toHaveLength(1);
  expect(plan.workspace.players).toHaveLength(24);
  expect(plan.workspace.players.slice(0, 12).every((p) => p.teamId === null)).toBe(true);
  expect(plan.workspace.assessments).toEqual(d.assessments);
  expect(plan.photoIds).toEqual([]);
  expect(plan.workspace.games).toEqual([]);
});
it('운영 중 항목 완전삭제를 차단하고 이름·메모 문자열을 연결 ID로 오인하지 않는다', () => {
  const d = createDemoWorkspace();
  expect(() => planPermanentDeletion(d, 'players', ['green-1'])).toThrow('삭제된 명단');
  d.players.push({
    id: 'unused',
    teamId: null,
    name: 'QA',
    number: 88,
    active: true,
    archivedAt: at,
  });
  d.games[0].id = 'unused';
  d.games[0].note = 'unused';
  d.games[0].name = 'unused';
  const plan = planPermanentDeletion(d, 'players', ['unused']);
  expect(plan.workspace.games).toEqual(d.games);
  expect(plan.counts.games).toBe(0);
});
