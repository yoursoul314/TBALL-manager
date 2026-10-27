import { POSITIONS } from '../config/positions';
import type { Workspace } from './model';
import type { EntryDraft } from './entryBatch';

/** Import a reviewed snapshot, never rerun or promote a recommendation. */
export function applyApprovedEntry(
  data: Workspace,
  teamId: string,
  selectionId: string,
  draft: EntryDraft,
  otherAssigned: string[],
): EntryDraft {
  const selection = data.selections.find((s) => s.id === selectionId);
  if (!selection || selection.teamId !== teamId || selection.status !== 'approved')
    throw new Error('선택한 팀의 감독 승인 배치안을 선택하세요');
  if (!data.teams.some((t) => t.id === teamId && !t.archivedAt))
    throw new Error('운영 중인 팀을 선택하세요');
  const ids = selection.assignments.map((a) => a.playerId);
  if (
    ids.length !== 10 ||
    new Set(ids).size !== 10 ||
    POSITIONS.some((p) => selection.assignments.filter((a) => a.position === p).length !== 1)
  )
    throw new Error('10명과 TYPE1 10개 포지션이 모두 배치된 승인안이 필요합니다');
  for (const id of ids) {
    const player = data.players.find((p) => p.id === id);
    if (!player || player.archivedAt || !player.active)
      throw new Error(
        '승인안에 삭제되었거나 출전 불가인 학생이 있습니다. 배치안을 수정·승인하세요',
      );
    if (otherAssigned.includes(id))
      throw new Error('승인안의 학생이 상대 팀에 이미 편성되어 있습니다');
    if (['absent', 'unavailable'].includes(draft.status[id]))
      throw new Error('승인안에 이번 경기 결석·출전 불가 학생이 있습니다. 경기 상태를 확인하세요');
  }
  // Retain the manager's existing order where possible. New names follow TYPE1 order;
  // this is an editable provisional order, not a recommended batting order.
  const ordered = POSITIONS.map(
    (p) => selection.assignments.find((a) => a.position === p)!.playerId,
  );
  const lineup = [
    ...draft.lineup.filter((id) => ids.includes(id)),
    ...ordered.filter((id) => !draft.lineup.includes(id)),
  ];
  return {
    loaded: true,
    assigned: [...new Set([...draft.assigned, ...ids])],
    status: {
      ...Object.fromEntries(
        Object.entries(draft.status).map(([id, s]) => [
          id,
          s === 'starter' && !ids.includes(id) ? 'not-playing' : s,
        ]),
      ),
      ...Object.fromEntries(ids.map((id) => [id, 'starter' as const])),
    },
    lineup,
    defense: Object.fromEntries(selection.assignments.map((a) => [a.position, a.playerId])),
  };
}
