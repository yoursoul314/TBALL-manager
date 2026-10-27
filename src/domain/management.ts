import type { Workspace } from './model';
import { setPlayerArchived, setTeamArchived } from './gameLibrary';
import { parseWorkspace } from '../data/schema';
import { replayGame } from '../engine/game';
export type ManagementKind = 'players' | 'teams';
export function archiveSelection(
  data: Workspace,
  kind: ManagementKind,
  ids: string[],
  archive: boolean,
  at: string,
): Workspace {
  if (!ids.length) throw new Error('항목을 선택하세요');
  return [...new Set(ids)].reduce(
    (next, id) =>
      kind === 'players'
        ? setPlayerArchived(next, id, archive, at)
        : setTeamArchived(next, id, archive, at),
    data,
  );
}
function containsId(value: unknown, ids: Set<string>, key = ''): boolean {
  const container = [
    'rosters',
    'lineups',
    'teamIds',
    'defense',
    'assignments',
    'bases',
    'assistIds',
  ].includes(key);
  if (typeof value === 'string')
    return (
      (container ||
        [
          'playerId',
          'originalId',
          'replacementId',
          'runnerId',
          'targetRunnerId',
          'batterId',
        ].includes(key)) &&
      ids.has(value)
    );
  if (Array.isArray(value)) return value.some((v) => containsId(v, ids, key));
  if (value && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => {
      if (key === 'positionsAtThrow' && ids.has(k)) return true;
      return containsId(
        v,
        ids,
        container && typeof v !== 'object' ? key : k === 'away' || k === 'home' ? key : k,
      );
    });
  return false;
}
export function planPermanentDeletion(data: Workspace, kind: ManagementKind, selected: string[]) {
  const ids = new Set(selected),
    rows = kind === 'players' ? data.players : data.teams;
  if (!ids.size || [...ids].some((id) => !rows.some((r) => r.id === id && r.archivedAt)))
    throw new Error('삭제된 명단의 항목만 완전삭제할 수 있습니다');
  const gameIds = new Set(
    data.games
      .filter((g) =>
        kind === 'teams'
          ? Object.values(g.teamIds).some((id) => ids.has(id))
          : [
              ...Object.values(g.rosters).flat(),
              ...Object.values(g.lineups).flat(),
              ...(g.entry
                ? [...g.entry.players.away, ...g.entry.players.home].map((p) => p.id)
                : []),
            ].some((id) => ids.has(id)) ||
            data.events.some((e) => e.gameId === g.id && containsId(e.payload, ids)),
      )
      .map((g) => g.id),
  );
  for (const g of data.games.filter((g) => gameIds.has(g.id)))
    if (
      replayGame(
        g,
        data.events.filter((e) => e.gameId === g.id),
      ).ball === 'live'
    )
      throw new Error('연결된 경기의 진행 중 플레이를 먼저 확정하세요');
  const sessionIds = new Set(
    kind === 'players'
      ? data.battingSessions.filter((s) => ids.has(s.playerId)).map((s) => s.id)
      : [],
  );
  const attempts = new Set(
    data.battingAttempts.filter((a) => sessionIds.has(a.sessionId)).map((a) => a.id),
  );
  const next: Workspace = {
    ...data,
    migrationSource: undefined,
    legacySource: undefined,
    players:
      kind === 'players'
        ? data.players.filter((p) => !ids.has(p.id))
        : data.players.map((p) => (p.teamId && ids.has(p.teamId) ? { ...p, teamId: null } : p)),
    teams: kind === 'teams' ? data.teams.filter((t) => !ids.has(t.id)) : data.teams,
    games: data.games.filter((g) => !gameIds.has(g.id)),
    events: data.events.filter((e) => !gameIds.has(e.gameId)),
    assessments:
      kind === 'players' ? data.assessments.filter((a) => !ids.has(a.playerId)) : data.assessments,
    defenseAssessments:
      kind === 'players'
        ? data.defenseAssessments.filter((a) => !ids.has(a.playerId))
        : data.defenseAssessments,
    defenseEvaluationChoices:
      kind === 'players'
        ? data.defenseEvaluationChoices.filter((c) => !ids.has(c.playerId))
        : data.defenseEvaluationChoices,
    battingSessions: data.battingSessions.filter((s) => !sessionIds.has(s.id)),
    battingAttempts: data.battingAttempts.filter((a) => !attempts.has(a.id)),
    battingAudit: data.battingAudit.filter((a) =>
      a.entity === 'session' ? !sessionIds.has(a.originalId) : !attempts.has(a.originalId),
    ),
    teamwork: data.teamwork.filter(
      (t) => !(kind === 'players' && ids.has(t.playerId)) && !(t.gameId && gameIds.has(t.gameId)),
    ),
    legacyTeamwork: data.legacyTeamwork.filter(
      (t) => !(kind === 'players' && ids.has(t.playerId)) && !(t.gameId && gameIds.has(t.gameId)),
    ),
    selections: data.selections.filter((s) =>
      kind === 'teams' ? !ids.has(s.teamId) : !s.assignments.some((a) => ids.has(a.playerId)),
    ),
  };
  return {
    workspace: parseWorkspace(next),
    photoIds: kind === 'players' ? [...ids] : [],
    counts: {
      entities: ids.size,
      games: gameIds.size,
      events: data.events.length - next.events.length,
      assessments: data.assessments.length - next.assessments.length,
      defenseAssessments: data.defenseAssessments.length - next.defenseAssessments.length,
      sessions: sessionIds.size,
      attempts: attempts.size,
      teamwork:
        data.teamwork.length +
        data.legacyTeamwork.length -
        next.teamwork.length -
        next.legacyTeamwork.length,
      selections: data.selections.length - next.selections.length,
    },
  };
}
