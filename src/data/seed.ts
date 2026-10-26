import { emptyBattingData } from '../config/batting';
import { ABILITIES } from '../config/positions';
import { DEFAULT_POLICY } from '../config/evaluation';
import { RULES_VERSION } from '../config/rules';
import type { Workspace } from '../domain/model';
export function createDemoWorkspace(): Workspace {
  const now = new Date().toISOString();
  const teams = [
    { id: 'green', name: '그린 윙스', color: '#27795e' },
    { id: 'orange', name: '오렌지 스타즈', color: '#d77b46' },
  ];
  const players = teams.flatMap((team, ti) =>
    Array.from({ length: 12 }, (_, i) => ({
      id: team.id + '-' + (i + 1),
      teamId: team.id,
      name: '샘플 선수 ' + String(ti * 12 + i + 1).padStart(2, '0'),
      number: i + 1,
      active: true,
    })),
  );
  return {
    schemaVersion: 6,
    ...emptyBattingData(),
    revision: 0,
    teams,
    players,
    games: [
      {
        id: 'demo-game',
        name: '2학년 티볼 연습 경기',
        createdAt: now,
        innings: 3,
        rulesVersion: RULES_VERSION,
        teamIds: { away: 'green', home: 'orange' },
        rosters: {
          away: players.filter((p) => p.teamId === 'green').map((p) => p.id),
          home: players.filter((p) => p.teamId === 'orange').map((p) => p.id),
        },
        lineups: {
          away: players
            .filter((p) => p.teamId === 'green')
            .slice(0, 10)
            .map((p) => p.id),
          home: players
            .filter((p) => p.teamId === 'orange')
            .slice(0, 10)
            .map((p) => p.id),
        },
      },
    ],
    events: [],
    assessments: players.map((p, i) => ({
      id: 'sample-assessment-' + p.id,
      playerId: p.id,
      recordedAt: now,
      assessor: '가상 샘플 데이터',
      abilities: Object.fromEntries(ABILITIES.map((key, j) => [key, 50 + ((i * 7 + j * 11) % 45)])),
      battingSkill: 55 + ((i * 9) % 40),
      runningSkill: 55 + ((i * 11) % 40),
      rawMeasurements: [],
    })),
    teamwork: [],
    legacyTeamwork: [],
    selections: [],
    policy: structuredClone(DEFAULT_POLICY),
  };
}
