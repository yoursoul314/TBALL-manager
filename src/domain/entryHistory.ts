import type { Side, Workspace } from './model';
import type { EntryCaptains, MatchEntryDrafts } from './randomEntry';
import { validateEntry } from './roster';

/** Copy the original starting entry, never replay or alter the source game. */
export function copyGameEntry(data: Workspace, gameId: string) {
  const game = data.games.find((g) => g.id === gameId && !g.archivedAt);
  if (!game) throw new Error('불러올 지난 경기를 선택하세요');
  if (
    game.teamIds.away === game.teamIds.home ||
    Object.values(game.teamIds).some((id) => !data.teams.some((t) => t.id === id && !t.archivedAt))
  )
    throw new Error('지난 경기의 팀이 삭제되어 있습니다. 팀을 복원한 뒤 불러오세요');
  validateEntry(game);
  const entries = {} as MatchEntryDrafts;
  const captains: EntryCaptains = {};
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const side of ['away', 'home'] as const) {
    const oldPlayers = game.entry?.players[side];
    const oldIds = oldPlayers?.map((p) => p.id) ?? game.rosters[side];
    const assigned: string[] = [],
      status: MatchEntryDrafts[Side]['status'] = {};
    for (const id of oldIds) {
      if (seen.has(id)) throw new Error('지난 경기의 선수 명단이 중복되었습니다');
      seen.add(id);
      const p = data.players.find((p) => p.id === id);
      if (!p || p.archivedAt) {
        warnings.push(`${oldPlayers?.find((p) => p.id === id)?.name ?? id}: 삭제되어 제외`);
        continue;
      }
      assigned.push(id);
      status[id] = !p.active
        ? 'unavailable'
        : (oldPlayers?.find((p) => p.id === id)?.status ??
          (game.lineups[side].includes(id) ? 'starter' : 'reserve'));
      if (!p.active) warnings.push(`${p.name}: 현재 출전 불가 · 선발 제외`);
    }
    const lineup = game.lineups[side].filter((id) => status[id] === 'starter');
    if (lineup.length > 10) throw new Error('지난 경기 선발이 10명을 초과합니다');
    entries[side] = {
      loaded: true,
      assigned,
      status,
      lineup,
      defense: Object.fromEntries(
        Object.entries(game.entry?.defense[side] ?? {}).filter(([, id]) => lineup.includes(id!)),
      ),
    };
    const captain = game.entry?.captains?.[side];
    if (captain && lineup.includes(captain)) captains[side] = captain;
    else if (captain)
      warnings.push(`${side === 'away' ? '선공' : '후공'} 주장: 출전 상태를 확인하고 다시 지정`);
    if (lineup.length !== 10)
      warnings.push(
        `${side === 'away' ? '선공' : '후공'} 선발 ${lineup.length}/10명 · 직접 보충 필요`,
      );
  }
  if (!game.entry?.captains)
    warnings.push('이 경기는 주장 정보가 저장되지 않았습니다. 직접 지정하세요');
  if (!game.entry) warnings.push('이전 경기의 수비 배치 정보가 없어 직접 배치해야 합니다');
  return { teams: { ...game.teamIds }, entries, captains, warnings };
}
