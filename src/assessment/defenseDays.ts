import { assertAssessmentDayOpen, assessmentDayArchived } from '../domain/assessmentManagement';
import { prepareNewAssessmentDay, type ManagementMeta } from './management';
import { summarizeDefenseAssessments } from './defenseChecklist';
import type { Workspace } from '../domain/model';
import type { DefenseAssessmentDay } from '../domain/defenseAssessment';
import { parseWorkspace } from '../data/schema';
export function defenseDates(data: Workspace) {
  return [
    ...new Set([
      ...data.defenseDays.map((d) => d.date),
      ...data.defenseAssessments.map((r) => r.revisions.at(-1)!.date),
    ]),
  ]
    .filter((date) => !assessmentDayArchived(data, 'defense', date))
    .sort()
    .reverse();
}
export function createDefenseDay(
  data: Workspace,
  day: Omit<DefenseAssessmentDay, 'targetAttempts'> & { targetAttempts?: number | null },
  meta: ManagementMeta = {
    id: crypto.randomUUID(),
    at: day.createdAt,
    actor: day.assessor,
    reason: '같은 날짜 새 평가 생성',
  },
) {
  if (!day.assessor.trim()) throw Error('등록된 평가자를 터치해 선택하세요');
  const prepared = prepareNewAssessmentDay(data, 'defense', day.date, meta);
  const next = parseWorkspace({
    ...prepared,
    defenseDays: [...prepared.defenseDays.filter((d) => d.date !== day.date), day],
  });
  return setDefenseTarget(next, day.date, day.targetAttempts ?? null);
}
export function addDefenseParticipants(data: Workspace, date: string, ids: string[]) {
  assertAssessmentDayOpen(data, 'defense', date);
  const day = data.defenseDays.find((d) => d.date === date);
  if (!day) throw new Error('수비 평가 날짜를 먼저 생성하세요');
  if (!ids.length || ids.some((id) => !data.players.some((p) => p.id === id && !p.archivedAt)))
    throw new Error('등록된 평가 학생을 선택하세요');
  return parseWorkspace({
    ...data,
    defenseDays: data.defenseDays.map((d) =>
      d.date === date ? { ...d, playerIds: [...new Set([...d.playerIds, ...ids])] } : d,
    ),
  });
}
export function defenseParticipants(data: Workspace, date: string) {
  const ids = [
    ...new Set([
      ...(data.defenseDays.find((d) => d.date === date)?.playerIds ?? []),
      ...data.defenseAssessments
        .filter((r) => r.revisions.at(-1)!.date === date && r.revisions.at(-1)!.status === 'active')
        .map((r) => r.playerId),
    ]),
  ];
  return ids.flatMap((id) => {
    const p = data.players.find((p) => p.id === id && !p.archivedAt);
    return p ? [p] : [];
  });
}

export function applyDefenseDayScores(
  data: Workspace,
  date: string,
  author: string,
  at: string,
  id: string,
) {
  const players = defenseParticipants(data, date).filter((p) =>
    Object.values(summarizeDefenseAssessments(data, p.id, date).abilities).some((a) => a.count > 0),
  );
  if (!players.length) throw new Error('해당 날짜에 점수로 환산할 수비 관찰이 없습니다');
  return parseWorkspace({
    ...data,
    defenseEvaluationChoices: [
      ...data.defenseEvaluationChoices,
      ...players.map((p, i) => ({
        id: id + '-' + i,
        playerId: p.id,
        source: 'checklist' as const,
        changedAt: at,
        changedBy: author,
      })),
    ],
  });
}

/** Changing the plan never creates observations or removes completed rounds. */
export function setDefenseTarget(data: Workspace, date: string, targetAttempts: number | null) {
  assertAssessmentDayOpen(data, 'defense', date);
  if (!data.defenseDays.some((d) => d.date === date))
    throw new Error('수비 평가 날짜를 먼저 생성하세요');
  const counts = new Map<string, number>();
  for (const r of data.defenseAssessments) {
    const v = r.revisions.at(-1)!;
    if (v.date === date && v.status === 'active')
      counts.set(r.playerId, (counts.get(r.playerId) ?? 0) + 1);
  }
  if (targetAttempts !== null && [...counts.values()].some((n) => n > targetAttempts))
    throw new Error('이미 기록한 학생의 횟수보다 적게 설정할 수 없습니다. 기존 기록은 유지됩니다.');
  return parseWorkspace({
    ...data,
    defenseDays: data.defenseDays.map((d) => (d.date === date ? { ...d, targetAttempts } : d)),
  });
}
export function defenseProgress(data: Workspace, playerId: string, date: string) {
  const count = data.defenseAssessments.filter(
    (r) =>
      r.playerId === playerId &&
      r.revisions.at(-1)!.date === date &&
      r.revisions.at(-1)!.status === 'active',
  ).length;
  const target = data.defenseDays.find((d) => d.date === date)?.targetAttempts ?? null;
  return { count, target, complete: target !== null && count >= target };
}
