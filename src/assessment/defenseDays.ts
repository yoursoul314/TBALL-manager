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
    .sort()
    .reverse();
}
export function createDefenseDay(data: Workspace, day: DefenseAssessmentDay) {
  if (data.defenseDays.some((d) => d.date === day.date))
    throw new Error('이미 생성한 수비 평가 날짜입니다');
  return parseWorkspace({ ...data, defenseDays: [...data.defenseDays, day] });
}
export function addDefenseParticipants(data: Workspace, date: string, ids: string[]) {
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
        .filter((r) => r.revisions.at(-1)!.date === date)
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
