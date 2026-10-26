import type { Workspace } from './model';
import { replayGame } from '../engine/game';
export const activeGames = (data: Workspace) => data.games.filter((g) => !g.archivedAt);
export function setGameArchived(
  data: Workspace,
  id: string,
  archived: boolean,
  at: string,
): Workspace {
  const game = data.games.find((g) => g.id === id);
  if (!game) throw new Error('경기를 찾을 수 없습니다');
  if (Boolean(game.archivedAt) === archived) return data;
  if (
    replayGame(
      game,
      data.events.filter((e) => e.gameId === id),
    ).ball === 'live'
  )
    throw new Error('플레이를 확정하거나 직전 입력을 취소한 뒤 삭제하세요');
  return {
    ...data,
    games: data.games.map((g) =>
      g.id === id
        ? {
            ...g,
            archivedAt: archived ? at : null,
            archiveHistory: [
              ...(g.archiveHistory ?? []),
              { action: archived ? 'archive' : 'restore', at },
            ],
          }
        : g,
    ),
  };
}

export const activeTeams = (data: Workspace) => data.teams.filter((t) => !t.archivedAt);
export function setTeamArchived(
  data: Workspace,
  id: string,
  archived: boolean,
  at: string,
): Workspace {
  const team = data.teams.find((t) => t.id === id);
  if (!team) throw new Error('팀을 찾을 수 없습니다');
  if (Boolean(team.archivedAt) === archived) return data;
  if (
    archived &&
    data.games.some(
      (g) =>
        Object.values(g.teamIds).includes(id) &&
        replayGame(
          g,
          data.events.filter((e) => e.gameId === g.id),
        ).ball === 'live',
    )
  )
    throw new Error('진행 중인 플레이를 먼저 확정하세요');
  return {
    ...data,
    teams: data.teams.map((t) =>
      t.id === id
        ? {
            ...t,
            archivedAt: archived ? at : null,
            archiveHistory: [
              ...(t.archiveHistory ?? []),
              { action: archived ? 'archive' : 'restore', at },
            ],
          }
        : t,
    ),
  };
}

export const activePlayers = (data: Workspace) => data.players.filter((p) => !p.archivedAt);
export function setPlayerArchived(
  data: Workspace,
  id: string,
  archived: boolean,
  at: string,
): Workspace {
  const player = data.players.find((p) => p.id === id);
  if (!player) throw new Error('선수를 찾을 수 없습니다');
  if (Boolean(player.archivedAt) === archived) return data;
  if (
    archived &&
    data.games.some(
      (g) =>
        Object.values(g.rosters).some((ids) => ids.includes(id)) &&
        replayGame(
          g,
          data.events.filter((e) => e.gameId === g.id),
        ).ball === 'live',
    )
  )
    throw new Error('진행 중인 플레이를 먼저 확정하세요');
  return {
    ...data,
    players: data.players.map((p) =>
      p.id === id
        ? {
            ...p,
            archivedAt: archived ? at : null,
            archiveHistory: [
              ...(p.archiveHistory ?? []),
              { action: archived ? 'archive' : 'restore', at },
            ],
          }
        : p,
    ),
  };
}
