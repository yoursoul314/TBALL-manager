import type { Workspace } from '../domain/model';
import type { AssessmentKind, AssessmentRecordKind } from '../domain/assessmentManagement';
import { assessmentDayArchived, assertAssessmentDayOpen } from '../domain/assessmentManagement';
import { parseWorkspace } from '../data/schema';
export type ManagementMeta = { id: string; at: string; actor: string; reason: string };
export function registerAssessor(data: Workspace, name: string, id: string, at: string) {
  name = name.trim();
  if (!name) throw Error('평가자 이름 또는 별칭을 입력하세요');
  if (data.assessmentManagement.assessors.some((a) => a.name === name))
    throw Error('이미 등록된 평가자입니다. 사용 중지된 이름은 복원하세요');
  return parseWorkspace({
    ...data,
    assessmentManagement: {
      ...data.assessmentManagement,
      assessors: [
        ...data.assessmentManagement.assessors,
        { id, name, createdAt: at, archivedAt: null },
      ],
    },
  });
}
export function setAssessorArchived(data: Workspace, id: string, archived: boolean, at: string) {
  if (!data.assessmentManagement.assessors.some((a) => a.id === id))
    throw Error('평가자가 없습니다');
  return parseWorkspace({
    ...data,
    assessmentManagement: {
      ...data.assessmentManagement,
      assessors: data.assessmentManagement.assessors.map((a) =>
        a.id === id ? { ...a, archivedAt: archived ? at : null } : a,
      ),
    },
  });
}
export function assessmentRecords(data: Workspace, kind: AssessmentRecordKind) {
  if (kind === 'batting')
    return data.battingSessions.map((r) => ({
      id: r.id,
      date: r.date,
      playerId: r.playerId,
      archived: r.status === 'cancelled',
      label: r.sessionNumber + '차 세션',
      revisionId: data.battingAudit
        .filter((a) => a.entity === 'session' && a.originalId === r.id)
        .at(-1)!.id,
    }));
  if (kind === 'batting-attempt')
    return data.battingAttempts.map((r) => {
      const s = data.battingSessions.find((s) => s.id === r.sessionId)!;
      return {
        id: r.id,
        date: s.date,
        playerId: s.playerId,
        archived: r.status === 'cancelled',
        label: s.sessionNumber + '차 · ' + r.attemptNumber + '회차',
        revisionId: data.battingAudit
          .filter((a) => a.entity === 'attempt' && a.originalId === r.id)
          .at(-1)!.id,
      };
    });
  if (kind === 'defense')
    return data.defenseAssessments.map((r) => {
      const v = r.revisions.at(-1)!;
      return {
        id: r.id,
        date: v.date,
        playerId: r.playerId,
        archived: v.status === 'cancelled',
        label: '수비 상황 · ' + v.situation,
        revisionId: v.id,
      };
    });
  return data.fungoAssessments.map((r) => {
    const v = r.revisions.at(-1)!;
    return {
      id: r.id,
      date: v.date,
      playerId: r.playerId,
      archived: v.status === 'cancelled',
      label: '펑고 5변수',
      revisionId: v.id,
    };
  });
}
function changeRecord(
  data: Workspace,
  kind: AssessmentRecordKind,
  id: string,
  archived: boolean,
  m: ManagementMeta,
): Workspace {
  const r = assessmentRecords(data, kind).find((r) => r.id === id);
  if (!r) throw Error('평가 기록이 없습니다');
  if (r.archived === archived) throw Error('이미 처리된 기록입니다');
  if (kind === 'batting') {
    const before = data.battingSessions.find((s) => s.id === id)!;
    const last = data.battingAudit
      .filter((a) => a.entity === 'session' && a.originalId === id)
      .at(-1)!;
    const previous = last.entity === 'session' ? last.before?.status : undefined;
    const after = {
      ...before,
      status: archived
        ? ('cancelled' as const)
        : previous === 'completed'
          ? ('completed' as const)
          : ('in-progress' as const),
      updatedAt: m.at,
    };
    return {
      ...data,
      battingSessions: data.battingSessions.map((s) => (s.id === id ? after : s)),
      battingAudit: [
        ...data.battingAudit,
        {
          id: m.id,
          entity: 'session',
          originalId: id,
          before: structuredClone(before),
          after: structuredClone(after),
          changedAt: m.at,
          changedBy: m.actor,
          reason: m.reason,
        },
      ],
    };
  }
  if (kind === 'batting-attempt') {
    const before = data.battingAttempts.find((s) => s.id === id)!;
    const after = {
      ...before,
      status: archived ? ('cancelled' as const) : ('active' as const),
      updatedAt: m.at,
    };
    return {
      ...data,
      battingAttempts: data.battingAttempts.map((s) => (s.id === id ? after : s)),
      battingAudit: [
        ...data.battingAudit,
        {
          id: m.id,
          entity: 'attempt',
          originalId: id,
          before: structuredClone(before),
          after: structuredClone(after),
          changedAt: m.at,
          changedBy: m.actor,
          reason: m.reason,
        },
      ],
    };
  }
  if (kind === 'defense')
    return {
      ...data,
      defenseAssessments: data.defenseAssessments.map((r) =>
        r.id === id
          ? {
              ...r,
              revisions: [
                ...r.revisions,
                {
                  ...structuredClone(r.revisions.at(-1)!),
                  id: m.id,
                  status: archived ? 'cancelled' : 'active',
                  changedAt: m.at,
                  changedBy: m.actor,
                  reason: m.reason,
                },
              ],
            }
          : r,
      ),
    };
  return {
    ...data,
    fungoAssessments: data.fungoAssessments.map((r) =>
      r.id === id
        ? {
            ...r,
            revisions: [
              ...r.revisions,
              {
                ...structuredClone(r.revisions.at(-1)!),
                id: m.id,
                status: archived ? 'cancelled' : 'active',
                at: m.at,
                by: m.actor,
                reason: m.reason,
              },
            ],
          }
        : r,
    ),
  };
}
export function setAssessmentRecordArchived(
  data: Workspace,
  kind: AssessmentRecordKind,
  id: string,
  archived: boolean,
  m: ManagementMeta,
) {
  const row = assessmentRecords(data, kind).find((r) => r.id === id);
  if (!row) throw Error('평가 기록이 없습니다');
  assertAssessmentDayOpen(data, kind === 'batting-attempt' ? 'batting' : kind, row.date);
  if (kind === 'batting-attempt' && !archived) {
    const a = data.battingAttempts.find((a) => a.id === id)!;
    if (data.battingSessions.find((s) => s.id === a.sessionId)?.status === 'cancelled')
      throw Error('삭제된 세션을 먼저 복원하세요');
  }
  if (kind === 'defense' && !archived) {
    const target = data.defenseDays.find((d) => d.date === row.date)?.targetAttempts;
    const count = assessmentRecords(data, 'defense').filter(
      (r) => r.date === row.date && r.playerId === row.playerId && !r.archived,
    ).length;
    if (target != null && count >= target)
      throw Error('설정한 수비 횟수를 초과합니다. 횟수를 늘린 후 복원하세요');
  }
  return parseWorkspace(changeRecord(data, kind, id, archived, m));
}
export function setAssessmentDateArchived(
  data: Workspace,
  kind: AssessmentKind,
  date: string,
  archived: boolean,
  m: ManagementMeta,
) {
  if (assessmentDayArchived(data, kind, date) === archived)
    throw Error('이미 처리된 평가 날짜입니다');
  const days =
    kind === 'batting' ? data.battingDays : kind === 'defense' ? data.defenseDays : data.fungoDays;
  const rows = assessmentRecords(data, kind).filter((r) => r.date === date);
  if (!days.some((d) => d.date === date) && !rows.length) throw Error('평가 날짜가 없습니다');
  const old = data.assessmentManagement.dayHistory
    .filter((h) => h.kind === kind && h.date === date)
    .at(-1);
  const affected = archived
    ? rows.filter((r) => !r.archived).map((r) => ({ id: r.id, revisionId: r.revisionId }))
    : old!.affected;
  let next = data;
  for (const [i, r] of affected.entries()) {
    const current = rows.find((v) => v.id === r.id);
    if (!current) continue; // Explicit permanent deletion cannot be undone by date restoration.
    if (!archived && (!current.archived || current.revisionId !== r.revisionId))
      throw Error('삭제 후 변경된 기록이 있습니다. 개별 기록을 확인하세요');
    next = changeRecord(next, kind, r.id, archived, { ...m, id: m.id + '-' + i });
  }
  return parseWorkspace({
    ...next,
    assessmentManagement: {
      ...next.assessmentManagement,
      dayHistory: [
        ...next.assessmentManagement.dayHistory,
        {
          ...m,
          kind,
          date,
          archived,
          affected: affected.map((r, i) => ({ id: r.id, revisionId: m.id + '-' + i })),
        },
      ],
    },
  });
}
