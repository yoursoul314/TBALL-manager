import { assertAssessmentDayOpen, assessmentDayArchived } from '../domain/assessmentManagement';
import { prepareNewAssessmentDay, type ManagementMeta } from './management';
import type { Workspace } from '../domain/model';
import type { BattingAssessmentDay, BattingAssessmentSession } from '../domain/batting';
import { parseWorkspace } from '../data/schema';
import type { ChangeMeta } from './batting';
export function createAssessmentDay(
  data: Workspace,
  day: BattingAssessmentDay,
  meta: ManagementMeta = {
    id: crypto.randomUUID(),
    at: day.createdAt,
    actor: day.assessor,
    reason: '같은 날짜 새 평가 생성',
  },
): Workspace {
  if (!day.assessor.trim()) throw Error('등록된 평가자를 터치해 선택하세요');
  const next = prepareNewAssessmentDay(data, 'batting', day.date, meta);
  return parseWorkspace({
    ...next,
    battingDays: [...next.battingDays.filter((d) => d.date !== day.date), day],
  });
}
export function startDayAssessments(
  data: Workspace,
  date: string,
  playerIds: string[],
  meta: ChangeMeta,
): Workspace {
  assertAssessmentDayOpen(data, 'batting', date);
  const day = data.battingDays.find((d) => d.date === date);
  if (!day) throw new Error('평가 날짜와 공통 설정을 먼저 생성하세요');
  const ids = [...new Set(playerIds)];
  if (!ids.length) throw new Error('평가 학생을 선택하세요');
  if (ids.some((id) => !data.players.some((p) => p.id === id && !p.archivedAt)))
    throw new Error('등록된 학생만 평가할 수 있습니다');
  const sessions: BattingAssessmentSession[] = [];
  for (const [i, playerId] of ids.entries()) {
    const previous = data.battingSessions.filter((s) => s.playerId === playerId && s.date === date);
    if (previous.some((s) => s.status !== 'cancelled')) continue;
    sessions.push({
      ...day,
      id: meta.id + '-' + i,
      playerId,
      sessionNumber: 1 + Math.max(0, ...previous.map((s) => s.sessionNumber)),
      status: 'in-progress',
      zoneDefinitionVersion: data.battingSettings.currentZoneVersion,
      updatedAt: meta.at,
      createdAt: meta.at,
    });
  }
  if (!sessions.length) return data;
  return parseWorkspace({
    ...data,
    battingSessions: [...data.battingSessions, ...sessions],
    battingAudit: [
      ...data.battingAudit,
      ...sessions.map((s) => ({
        id: s.id + '-audit',
        changedAt: meta.at,
        changedBy: meta.actor,
        reason: meta.reason,
        entity: 'session' as const,
        originalId: s.id,
        before: null,
        after: structuredClone(s),
      })),
    ],
  });
}
export function assessmentDates(data: Workspace) {
  return [
    ...new Set([
      ...data.battingDays.map((d) => d.date),
      ...data.battingSessions.map((s) => s.date),
    ]),
  ]
    .filter((date) => !assessmentDayArchived(data, 'batting', date))
    .sort()
    .reverse();
}
