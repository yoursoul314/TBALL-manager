import type { EntryStatus, Player } from './model';
import type { Position } from '../config/positions';
export interface EntryDraft {
  loaded: boolean;
  assigned: string[];
  status: Record<string, EntryStatus>;
  lineup: string[];
  defense: Partial<Record<Position, string>>;
}
export function assignEntryBatch(
  draft: EntryDraft,
  selectedIds: string[],
  status: EntryStatus,
  players: Player[],
  otherAssigned: string[],
): EntryDraft {
  const ids = [...new Set(selectedIds)];
  if (!ids.length) throw new Error('배정할 학생을 선택하세요');
  for (const id of ids) {
    const p = players.find((p) => p.id === id);
    if (!p || p.archivedAt) throw new Error('등록된 학생만 배정할 수 있습니다');
    if (otherAssigned.includes(id)) throw new Error('상대 팀에 이미 편성된 학생입니다');
    if (!p.active && (status === 'starter' || status === 'reserve'))
      throw new Error('출전 불가 학생은 선발·후보에 배정할 수 없습니다');
  }
  const lineup =
    status === 'starter'
      ? [...new Set([...draft.lineup, ...ids])]
      : draft.lineup.filter((id) => !ids.includes(id));
  if (lineup.length > 10)
    throw new Error('선발은 10명까지입니다. 인원을 줄이거나 교체 후보로 배정하세요');
  return {
    ...draft,
    loaded: true,
    assigned: [...new Set([...draft.assigned, ...ids])],
    lineup,
    status: { ...draft.status, ...Object.fromEntries(ids.map((id) => [id, status])) },
    defense: Object.fromEntries(
      Object.entries(draft.defense).filter(([, id]) => lineup.includes(id!)),
    ),
  };
}
