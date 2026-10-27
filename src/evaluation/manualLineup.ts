import type { Workspace, Selection } from '../domain/model';
import { POSITIONS, type Position } from '../config/positions';
import { defenseEvaluation } from './defense';
import { positionScore } from './score';
import { parseWorkspace } from '../data/schema';
export type Placement = Partial<Record<Position, string>>;
export function placePlayer(current: Placement, position: Position, playerId: string): Placement {
  const next = { ...current },
    previous = POSITIONS.find((p) => p !== position && next[p] === playerId),
    displaced = next[position];
  if (previous) {
    if (displaced) next[previous] = displaced;
    else delete next[previous];
  }
  if (playerId) next[position] = playerId;
  else delete next[position];
  return next;
}
export function placementAssignments(
  data: Workspace,
  placement: Placement,
): Selection['assignments'] {
  return POSITIONS.flatMap((position) =>
    placement[position]
      ? [
          {
            position,
            playerId: placement[position]!,
            score: positionScore(defenseEvaluation(data, placement[position]!).abilities, position),
          },
        ]
      : [],
  );
}
export function saveManualLineup(
  data: Workspace,
  teamId: string,
  placement: Placement,
  id: string,
  at: string,
  editedFrom?: string,
) {
  if (!data.teams.some((t) => t.id === teamId && !t.archivedAt))
    throw new Error('운영 팀을 선택하세요');
  const assignments = placementAssignments(data, placement);
  if (!assignments.length) throw new Error('한 명 이상 배치하세요');
  if (
    assignments.some(
      (a) => !data.players.some((p) => p.id === a.playerId && p.active && !p.archivedAt),
    )
  )
    throw new Error('출전 가능한 등록 학생만 배치하세요');
  return parseWorkspace({
    ...data,
    selections: [
      ...data.selections,
      {
        id,
        teamId,
        createdAt: at,
        policyVersion: data.policy.version,
        sourceRevision: data.revision + 1,
        assignments,
        method: 'manual',
        ...(editedFrom ? { editedFrom } : {}),
        status: 'draft',
        approvedBy: null,
        approvedAt: null,
      },
    ],
  });
}
export function approveLineup(data: Workspace, id: string, author: string, at: string) {
  const selected = data.selections.find((s) => s.id === id);
  if (!selected || selected.sourceRevision !== data.revision)
    throw new Error('데이터가 변경되어 배치안을 다시 저장해야 합니다');
  if (!author.trim() || selected.assignments.length !== 10)
    throw new Error('10명 배치와 승인 감독을 확인하세요');
  if (
    selected.assignments.some(
      (a) => !data.players.some((p) => p.id === a.playerId && p.active && !p.archivedAt),
    )
  )
    throw new Error('출전 불가 또는 삭제된 선수가 있습니다');
  return parseWorkspace({
    ...data,
    selections: data.selections.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'approved',
            approvedBy: author,
            approvedAt: at,
            sourceRevision: data.revision + 1,
          }
        : s,
    ),
  });
}
