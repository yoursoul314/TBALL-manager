import type { Workspace } from './model';
import { replayGame } from '../engine/game';
import { DEFAULT_POLICY } from '../config/evaluation';
import { emptyBattingData } from '../config/batting';
export type ResetScope = 'games' | 'evaluations' | 'records' | 'all';
export const RESET_LABELS: Record<ResetScope, string> = {
  games: '경기 기록만',
  evaluations: '평가·팀워크만',
  records: '모든 기록 · 선수/팀/사진 유지',
  all: '전체 초기화 · 선수/팀/사진 포함',
};
export function resetWorkspace(data: Workspace, scope: ResetScope, at: string): Workspace {
  if (
    data.games.some(
      (g) =>
        replayGame(
          g,
          data.events.filter((e) => e.gameId === g.id),
        ).ball === 'live',
    )
  )
    throw new Error('진행 중인 플레이를 먼저 확정하거나 취소하세요');
  const games = scope !== 'evaluations',
    evaluation = scope !== 'games';
  const next: Workspace = {
    ...data,
    lastReset: { at, scope },
  };
  if (games) {
    next.games = [];
    next.events = [];
    next.teamwork = data.teamwork.filter((t) => !t.gameId);
    next.legacyTeamwork = data.legacyTeamwork.filter((t) => !t.gameId);
  }
  if (evaluation) {
    next.assessments = [];
    next.battingSessions = [];
    next.battingAttempts = [];
    next.battingAudit = [];
    next.teamwork = [];
    next.legacyTeamwork = [];
    next.selections = [];
  }
  if (scope === 'all') {
    next.migrationSource = undefined;
    next.legacySource = undefined;
    next.players = [];
    next.teams = [];
    next.policy = structuredClone(DEFAULT_POLICY);
    Object.assign(next, emptyBattingData());
  }
  return next;
}
