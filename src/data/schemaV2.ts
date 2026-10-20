import { ERROR_LABELS, type ErrorType } from '../config/recording';
import { z } from 'zod';
import { ABILITIES, POSITIONS } from '../config/positions';
import { RULES_VERSION } from '../config/rules';
import { replayGame } from '../engine/game';
import type { Workspace } from '../domain/model';
import type { BattingData } from '../domain/batting';
type WorkspaceV2 = Omit<Workspace, keyof BattingData | 'schemaVersion' | 'migrationSource'> & {
  schemaVersion: 2;
};

const id = z.string().min(1).max(120);
const text = z.string().max(200);
const score = z.number().min(0).max(100);
const side = z.enum(['away', 'home']);
const base = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const abilityMap = z.partialRecord(z.enum(ABILITIES), score);
const mix = z
  .object({ skill: score, game: score })
  .refine((v) => v.skill + v.game === 100, '합계 100');
const decision = <T extends z.ZodType>(value: T) =>
  z.object({ status: z.enum(['TODO', 'confirmed']), value, note: z.string().max(2000) });
const policy = z.object({
  version: id,
  domainWeights: decision(
    z
      .object({ batting: score, defense: score, running: score, teamwork: score })
      .refine((v) => Object.values(v).reduce((a, b) => a + b, 0) === 100, '영역 합계 100'),
  ),
  battingMix: decision(mix),
  defenseMix: decision(mix),
  runningMix: z.object({ skill: z.literal(40), game: z.literal(60) }),
  conversion: decision(z.enum(['manual-0-100', 'table'])),
  sacrificeFly: decision(z.enum(['exclude-from-at-bats', 'include-in-at-bats'])),
  incompleteInnings: decision(z.enum(['include', 'exclude'])),
});

const detail = z.discriminatedUnion('type', [
  z.object({ id, type: z.literal('FIELDERS_CHOICE'), targetRunnerId: id }),
  z.object({ id, type: z.literal('RBI'), runnerId: id }),
  z.object({
    id,
    type: z.literal('DEFENSIVE_ERROR'),
    playerId: id,
    errorType: z.enum(Object.keys(ERROR_LABELS) as [ErrorType, ...ErrorType[]]),
    note: z.string().max(2000),
  }),
  z.object({
    id,
    type: z.literal('ERROR_ADVANCE'),
    playerId: id,
    from: z.union([z.literal(0), base]),
    to: z.union([base, z.literal('home')]),
    errorId: id,
  }),
  z.object({
    id,
    type: z.literal('FIELDING_ACTION'),
    playerId: id,
    position: z.enum(POSITIONS),
    action: z.enum(['receive', 'throw', 'base', 'out']),
    success: z.boolean(),
    runnerId: id.optional(),
  }),
  z.object({
    id,
    type: z.literal('DEFENSIVE_CREDIT'),
    playerId: id,
    credit: z.enum(['putout', 'assist']),
    runnerId: id,
  }),
]);
const endPlay = z.object({
  type: z.literal('END_PLAY'),
  endedBy: z.literal('umpire-time'),
  result: z.enum([
    'single',
    'double',
    'triple',
    'home-run',
    'out',
    'error',
    'fielders-choice',
    'sacrifice-fly',
  ]),
  outcomes: z
    .array(
      z.object({
        playerId: id,
        to: z.union([base, z.literal('home'), z.literal('out')]),
        action: z.enum(['advance', 'tag-up', 'overrun', 'hold', 'lead', 'steal', 'slide']),
        outReason: z
          .enum(['force', 'tag', 'fly', 'strikeout', 'lead', 'steal', 'slide'])
          .optional(),
        outAt: z.union([base, z.literal('home')]).optional(),
        intentToAdvance: z.boolean().optional(),
      }),
    )
    .max(4),
  direction: z.enum(['left', 'center', 'right']),
  quality: z.enum(['ground', 'line', 'fly']),
  fielding: z
    .array(
      z.object({
        playerId: id,
        skill: z.enum(ABILITIES),
        success: z.boolean(),
        position: z.enum(POSITIONS),
      }),
    )
    .max(100),
  distance: z.enum(['near', 'middle', 'far']).nullable().optional(),
  strength: z.enum(['strong', 'normal', 'weak']).nullable().optional(),
  details: z.array(detail).max(100).optional(),
  safetyAward: z
    .object({ positionsAtThrow: z.record(id, z.union([z.literal(0), base])) })
    .optional(),
});
const payload = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PITCH'), call: z.enum(['strike', 'foul']) }),
  z.object({ type: z.literal('START_PLAY') }),
  endPlay,
  z.object({
    type: z.literal('REVISE_PLAY'),
    targetId: id,
    reason: text.trim().min(1),
    author: text.trim().min(1),
    replacement: endPlay,
  }),
  z.object({
    type: z.literal('TEMP_RUNNER'),
    originalId: id,
    replacementId: id,
    approvedBy: text.min(1),
  }),
  z.object({ type: z.literal('SUBSTITUTE'), side, slot: z.number().int().min(0), playerId: id }),
  z.object({
    type: z.literal('DEFENSE'),
    side,
    assignments: z.partialRecord(z.enum(POSITIONS), id),
  }),
  z.object({
    type: z.literal('RUNNER_VIOLATION'),
    playerId: id,
    violation: z.enum(['lead', 'steal', 'slide']),
  }),
  z.object({ type: z.literal('FINISH_GAME'), reason: text.min(1) }),
  z.object({ type: z.literal('RETRACT'), targetId: id, reason: text.min(1) }),
]);
const workspaceSchema = z.object({
  schemaVersion: z.literal(2),
  legacySource: z.object({ schemaVersion: z.literal(1), raw: z.string() }).optional(),
  revision: z.number().int().min(0),
  teams: z
    .array(z.object({ id, name: text.min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }))
    .max(100),
  players: z
    .array(
      z.object({
        id,
        teamId: id,
        name: text.min(1),
        number: z.number().int().min(0).max(999),
        active: z.boolean(),
      }),
    )
    .max(2000),
  games: z
    .array(
      z.object({
        id,
        name: text.min(1),
        createdAt: z.iso.datetime(),
        innings: z.number().int().min(1).max(20),
        rulesVersion: z.literal(RULES_VERSION),
        teamIds: z.object({ away: id, home: id }),
        rosters: z.object({ away: z.array(id), home: z.array(id) }),
        lineups: z.object({ away: z.array(id), home: z.array(id) }),
      }),
    )
    .min(1)
    .max(1000),
  events: z
    .array(
      z.object({
        schemaVersion: z.union([z.literal(1), z.literal(2)]),
        id,
        gameId: id,
        sequence: z.number().int().min(1),
        deviceId: id,
        recordedAt: z.iso.datetime(),
        payload,
      }),
    )
    .max(100000),
  assessments: z
    .array(
      z.object({
        id,
        playerId: id,
        recordedAt: z.iso.datetime(),
        assessor: text,
        abilities: abilityMap,
        battingSkill: score.nullable(),
        runningSkill: score.nullable(),
        rawMeasurements: z.array(z.object({ metric: text, value: z.number(), unit: text })),
      }),
    )
    .max(10000),
  legacyTeamwork: z
    .array(
      z.object({
        id,
        playerId: id,
        gameId: id.nullable(),
        recordedAt: z.iso.datetime(),
        category: z.enum(['communication', 'support', 'responsibility', 'respect']),
        score: z.number().int().min(1).max(5),
        note: z.string().max(2000),
        observer: text,
      }),
    )
    .max(10000),

  teamwork: z
    .array(
      z
        .object({
          id,
          playerId: id,
          gameId: id.nullable(),
          recordedAt: z.iso.datetime(),
          category: z.enum([
            'communication',
            'coverBackup',
            'roleExecution',
            'teammateSupport',
            'teamTactics',
          ]),
          opportunity: z.enum(['offered', 'not-offered']),
          outcome: z.enum(['performed', 'partial', 'not-performed', 'unobserved']),
          note: z.string().max(2000),
          observer: text,
        })
        .refine(
          (o) => o.opportunity === 'offered' || o.outcome === 'unobserved',
          '기회 없음은 수행 미관찰로 기록하세요',
        ),
    )
    .max(10000),
  selections: z.array(
    z.object({
      id,
      teamId: id,
      createdAt: z.iso.datetime(),
      policyVersion: id,
      sourceRevision: z.number().int().min(0),
      assignments: z.array(z.object({ position: z.enum(POSITIONS), playerId: id, score })),
      status: z.enum(['draft', 'approved']),
      approvedBy: text.nullable(),
      approvedAt: z.iso.datetime().nullable(),
    }),
  ),
  policy,
});
export function parseWorkspaceV2(input: unknown): WorkspaceV2 {
  const data: WorkspaceV2 = workspaceSchema.parse(input);
  const require = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  for (const collection of [
    data.players,
    data.teams,
    data.games,
    data.events,
    data.assessments,
    [...data.teamwork, ...data.legacyTeamwork],
    data.selections,
  ]) {
    require(new Set(collection.map((x) => x.id)).size ===
      collection.length, '중복 식별자가 있습니다');
  }
  const player = new Map(data.players.map((p) => [p.id, p]));
  const teams = new Set(data.teams.map((t) => t.id));
  const games = new Set(data.games.map((g) => g.id));
  for (const p of data.players) require(teams.has(p.teamId), '선수의 소속 팀이 없습니다');
  for (const g of data.games) {
    for (const s of ['away', 'home'] as const) {
      require(teams.has(g.teamIds[s]), '경기의 팀이 없습니다');
      require(g.rosters[s].every(
        (id) => player.get(id)?.teamId === g.teamIds[s],
      ), '경기 명단의 선수 소속이 다릅니다');
    }
    replayGame(
      g,
      data.events.filter((e) => e.gameId === g.id),
    );
  }
  require(data.events.every((e) => games.has(e.gameId)), '이벤트의 경기가 없습니다');
  require(data.assessments.every((a) => player.has(a.playerId)), '평가의 선수가 없습니다');
  require([...data.teamwork, ...data.legacyTeamwork].every(
    (a) => player.has(a.playerId) && (!a.gameId || games.has(a.gameId)),
  ), '관찰 대상이 없습니다');
  for (const selection of data.selections) {
    require(teams.has(selection.teamId), '선발의 팀이 없습니다');
    require(selection.assignments.length === 10, 'TYPE1은 10포지션이 필요합니다');
    require(new Set(selection.assignments.map((a) => a.position)).size === 10, '포지션 중복');
    require(new Set(selection.assignments.map((a) => a.playerId)).size === 10, '선수 중복');
    require(selection.assignments.every(
      (a) => player.get(a.playerId)?.teamId === selection.teamId,
    ), '선발 팀 불일치');
    if (selection.status === 'approved')
      require(selection.approvedAt && selection.approvedBy, '승인 기록 누락');
  }
  return data;
}
