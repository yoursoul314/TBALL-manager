import type { EntryStatus, Game, Player, Side, Workspace } from './model';
import { POSITIONS } from '../config/positions';
export const ENTRY_LABELS: Record<EntryStatus, string> = {
  starter: '선발',
  reserve: '교체 후보',
  'not-playing': '미출전',
  absent: '결석',
  unavailable: '부상·출전 불가',
};
export function localDate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
export function gradeLabel(p: Player) {
  return p.grade ? p.grade + '학년' + (p.classroom ? ' ' + p.classroom + '반' : '') : '학년 미설정';
}
export function gamePlayers(game: Game, data: Pick<Workspace, 'players'>): Player[] {
  if (!game.entry) return data.players;
  const snapshots = [...game.entry.players.away, ...game.entry.players.home];
  return [...snapshots, ...data.players.filter((p) => !snapshots.some((s) => s.id === p.id))];
}
export function gameTeamName(game: Game, data: Pick<Workspace, 'teams'>, side: Side) {
  return (
    game.entry?.teams[side].name ??
    data.teams.find((t) => t.id === game.teamIds[side])?.name ??
    side
  );
}
export function captureLegacyEntry(
  game: Game,
  data: Pick<Workspace, 'players' | 'teams'>,
): Game['entry'] {
  return {
    capturedAt: game.createdAt,
    source: 'legacy',
    approvedBy: null,
    teams: {
      away: { ...data.teams.find((t) => t.id === game.teamIds.away)! },
      home: { ...data.teams.find((t) => t.id === game.teamIds.home)! },
    },
    defense: { away: {}, home: {} },
    players: Object.fromEntries(
      (['away', 'home'] as const).map((side) => [
        side,
        game.rosters[side].map((id) => ({
          ...data.players.find((p) => p.id === id)!,
          status: game.lineups[side].includes(id) ? 'starter' : 'reserve',
        })),
      ]),
    ) as NonNullable<Game['entry']>['players'],
  };
}
export function validateEntry(game: Game) {
  const entry = game.entry;
  if (!entry) return;
  const require = (ok: unknown, message: string) => {
    if (!ok) throw new Error(message);
  };
  const all = [...entry.players.away, ...entry.players.home];
  require(new Set(all.map((p) => p.id)).size === all.length, '경기 엔트리 선수 중복');
  for (const side of ['away', 'home'] as const) {
    const ps = entry.players[side];
    require(entry.teams[side].id === game.teamIds[side], '경기 팀 스냅샷 불일치');
    require(ps.every((p) => p.teamId === game.teamIds[side]), '엔트리 당시 팀 불일치');
    const roster = ps
      .filter((p) => p.status === 'starter' || p.status === 'reserve')
      .map((p) => p.id);
    const starters = ps.filter((p) => p.status === 'starter').map((p) => p.id);
    require(roster.length === game.rosters[side].length &&
      roster.every((id) => game.rosters[side].includes(id)), '경기 등록 명단과 상태 불일치');
    require(starters.length === game.lineups[side].length &&
      starters.every((id) => game.lineups[side].includes(id)), '선발 명단과 타순 불일치');
    if (entry.source === 'manager') {
      require(starters.length === 10, '새 경기 선발은 팀당 10명입니다');
      require(entry.approvedBy?.trim(), '엔트리 확인 감독이 필요합니다');
      require(ps
        .filter((p) => roster.includes(p.id))
        .every((p) => p.active), '출전 불가 선수를 엔트리에 넣을 수 없습니다');
    }
    const assignments = entry.defense[side];
    require(Object.keys(assignments).every((p) =>
      POSITIONS.includes(p as (typeof POSITIONS)[number]),
    ), '수비 포지션 오류');
    const ids = Object.values(assignments);
    require(new Set(ids).size === ids.length &&
      ids.every((id) => starters.includes(id)), '수비 배치는 중복 없는 선발 선수만 가능합니다');
  }
}
