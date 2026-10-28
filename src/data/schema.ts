import { fungoDaysSchema, fungoAssessmentsSchema } from './fungoSchema';
import { defenseAssessmentsSchema } from './defenseAssessmentSchema';
import { z } from 'zod';
import type { Workspace, GameEvent } from '../domain/model';
import { POSITIONS } from '../config/positions';
import { ERROR_LABELS, type ErrorType } from '../config/recording';
import { DEFENSE_ACTIONS } from '../domain/defense';
import { validateEntry } from '../domain/roster';
import { replayGame } from '../engine/game';
import { parseWorkspaceV4 } from './schemaV4';
export { battingSessionSchema, battingAttemptSchema, battingSettingsSchema } from './schemaV4';
const id = z.string().min(1).max(120);
const note = z.string().max(2000);
const extras = z.object({
  archivedAt: z.iso.datetime().nullable().optional(),
  archiveHistory: z
    .array(z.object({ action: z.enum(['archive', 'restore']), at: z.iso.datetime() }))
    .max(10000)
    .optional(),
  grade: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .nullable()
    .optional(),
  classroom: z.string().trim().max(30).nullable().optional(),
  studentNumber: z.number().int().min(1).max(999).nullable().optional(),
  pref1: z.enum(POSITIONS).nullable().optional(),
  pref2: z.enum(POSITIONS).nullable().optional(),
  primaryPosition: z.enum(POSITIONS).nullable().optional(),
  secondaryPosition: z.enum(POSITIONS).nullable().optional(),
  note: note.optional(),
});
export const playerSchema = extras.extend({
  id,
  teamId: id.nullable(),
  name: z.string().trim().min(1).max(200),
  number: z.number().int().min(0).max(999),
  active: z.boolean(),
});
const assignments = z.partialRecord(z.enum(POSITIONS), id);
const team = z.object({
  archivedAt: z.iso.datetime().nullable().optional(),
  archiveHistory: z
    .array(z.object({ action: z.enum(['archive', 'restore']), at: z.iso.datetime() }))
    .max(10000)
    .optional(),
  id,
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});
const entryPlayers = z
  .array(
    playerSchema.extend({
      status: z.enum(['starter', 'reserve', 'not-playing', 'absent', 'unavailable']),
    }),
  )
  .max(2000);
const gameExtra = z.object({
  archivedAt: z.iso.datetime().nullable().optional(),
  archiveHistory: z
    .array(z.object({ action: z.enum(['archive', 'restore']), at: z.iso.datetime() }))
    .max(10000)
    .optional(),
  playedOn: z.iso.date().nullable().optional(),
  dateStatus: z.enum(['confirmed', 'estimated', 'unset']).optional(),
  startTime: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
    .nullable()
    .optional(),
  note: note.optional(),
  formation: z.literal('TYPE1').optional(),
  entry: z
    .object({
      capturedAt: z.iso.datetime(),
      source: z.enum(['manager', 'legacy']),
      approvedBy: z.string().max(200).nullable(),
      teams: z.object({ away: team, home: team }),
      players: z.object({ away: entryPlayers, home: entryPlayers }),
      defense: z.object({ away: assignments, home: assignments }),
    })
    .optional(),
  dateHistory: z
    .array(
      z.object({
        before: z.iso.date().nullable(),
        after: z.iso.date(),
        changedAt: z.iso.datetime(),
        author: z.string().trim().min(1).max(200),
      }),
    )
    .max(1000)
    .optional(),
});
export const defenseSequenceSchema = z
  .array(
    z.object({
      id,
      playerId: id,
      position: z.enum(POSITIONS),
      action: z.enum(DEFENSE_ACTIONS),
      targetBase: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal('home')]).nullable(),
      runnerId: id.nullable(),
      catchSkill: z.enum(['G', 'F']).nullable(),
      errorType: z.enum(Object.keys(ERROR_LABELS) as [ErrorType, ...ErrorType[]]).nullable(),
      assistIds: z.array(id).max(10),
    }),
  )
  .max(100);
const defenseDaySchema = z.object({
  date: z.iso.date(),
  targetAttempts: z.number().int().min(1).max(200).nullable().default(null),
  assessor: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(200),
  note,
  playerIds: z.array(id).max(2000),
  createdAt: z.iso.datetime(),
});
const battingDaySchema = z.object({
  rubricVersion: z.enum(['manual-ten-v1', 'quality-six-v1']).optional(),
  date: z.iso.date(),
  targetAttempts: z.number().int().min(1).max(200),
  assessor: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(200),
  note,
  createdAt: z.iso.datetime(),
});
export function parseWorkspace(input: unknown): Workspace {
  const header = z
    .object({
      schemaVersion: z.literal(14),
      assessmentManagement: z
        .object({
          assessors: z
            .array(
              z.object({
                id,
                name: z.string().trim().min(1).max(200),
                createdAt: z.iso.datetime(),
                archivedAt: z.iso.datetime().nullable(),
              }),
            )
            .max(1000),
          dayHistory: z
            .array(
              z.object({
                id,
                kind: z.enum(['batting', 'defense', 'fungo']),
                date: z.iso.date(),
                archived: z.boolean(),
                at: z.iso.datetime(),
                actor: z.string().trim().min(1).max(200),
                reason: note.min(1),
                affected: z.array(z.object({ id, revisionId: id })).max(100000),
                restart: z
                  .discriminatedUnion('kind', [
                    z.object({
                      kind: z.literal('batting'),
                      day: battingDaySchema.nullable(),
                      recordIds: z.array(id).max(100000),
                    }),
                    z.object({
                      kind: z.literal('defense'),
                      day: defenseDaySchema.nullable(),
                      recordIds: z.array(id).max(100000),
                    }),
                    z.object({
                      kind: z.literal('fungo'),
                      day: fungoDaysSchema.element.nullable(),
                      recordIds: z.array(id).max(100000),
                    }),
                  ])
                  .optional(),
              }),
            )
            .max(20000),
        })
        .default({ assessors: [], dayHistory: [] }),
      fungoDays: fungoDaysSchema.default([]),
      fungoAssessments: fungoAssessmentsSchema.default([]),
      defenseDays: z.array(defenseDaySchema).max(20000),
      comparisonSelection: z
        .object({
          playerIds: z.array(id).max(2000),
          note,
          updatedAt: z.iso.datetime(),
          status: z.literal('draft'),
        })
        .nullable(),
      defenseAssessments: defenseAssessmentsSchema.default([]),
      defenseEvaluationChoices: z
        .array(
          z.object({
            id,
            playerId: id,
            source: z.enum(['manual', 'checklist']),
            changedAt: z.iso.datetime(),
            changedBy: z.string().trim().min(1).max(200),
          }),
        )
        .max(100000)
        .default([]),
      battingDays: z.array(battingDaySchema).max(20000),
      lastReset: z
        .object({ at: z.iso.datetime(), scope: z.enum(['games', 'evaluations', 'records', 'all']) })
        .optional(),
      migrationSource: z
        .object({
          schemaVersion: z.union([
            z.literal(2),
            z.literal(3),
            z.literal(4),
            z.literal(5),
            z.literal(6),
            z.literal(7),
            z.literal(8),
            z.literal(9),
            z.literal(10),
            z.literal(11),
            z.literal(12),
            z.literal(13),
          ]),
          raw: z.string(),
        })
        .optional(),
      selections: z.array(
        z.object({
          id,
          teamId: id,
          createdAt: z.iso.datetime(),
          policyVersion: id,
          sourceRevision: z.number().int().min(0),
          assignments: z
            .array(
              z.object({
                position: z.enum(POSITIONS),
                playerId: id,
                score: z.number().min(-30).max(105).nullable(),
              }),
            )
            .max(10),
          method: z.enum(['automatic', 'manual', 'waterfall']).optional(),
          waterfall: z
            .object({
              version: z.literal('fungo-waterfall-v1'),
              candidateIds: z.array(id).max(2000),
              feedback: z
                .array(
                  z.object({
                    playerId: id,
                    position: z.enum(POSITIONS),
                    text: z.string().max(4000),
                    base: z.number().min(0).max(100),
                    bonus: z.union([z.literal(0), z.literal(3), z.literal(5)]),
                    penalty: z.union([z.literal(0), z.literal(20), z.literal(30)]),
                  }),
                )
                .max(10),
            })
            .optional(),
          editedFrom: id.optional(),
          status: z.enum(['draft', 'approved']),
          approvedBy: z.string().min(1).max(2000).nullable(),
          approvedAt: z.iso.datetime().nullable(),
        }),
      ),
      teams: z.array(z.unknown()),
      players: z.array(z.unknown()),
      games: z.array(z.unknown()),
      events: z.array(z.unknown()),
    })
    .parse(input);
  if (new Set(header.battingDays.map((d) => d.date)).size !== header.battingDays.length)
    throw new Error('평가 날짜 중복');
  const base = parseWorkspaceV4(
    { ...(input as object), schemaVersion: 4, migrationSource: undefined, selections: [] },
    false,
    true,
    true,
    true,
  );
  const players = header.players.map((p) => playerSchema.parse(p));
  const games = base.games.map((g, i) => ({ ...g, ...gameExtra.parse(header.games[i]) }));
  const events = base.events.map((e, i) => {
    const raw = header.events[i] as GameEvent;
    if (
      e.payload.type === 'END_PLAY' &&
      raw.payload.type === 'END_PLAY' &&
      raw.payload.defenseSequence !== undefined
    )
      return {
        ...e,
        payload: {
          ...e.payload,
          defenseSequence: defenseSequenceSchema.parse(raw.payload.defenseSequence),
        },
      };
    if (
      e.payload.type === 'REVISE_PLAY' &&
      raw.payload.type === 'REVISE_PLAY' &&
      raw.payload.replacement.defenseSequence !== undefined
    )
      return {
        ...e,
        payload: {
          ...e.payload,
          replacement: {
            ...e.payload.replacement,
            defenseSequence: defenseSequenceSchema.parse(raw.payload.replacement.defenseSequence),
          },
        },
      };
    return e;
  }) as GameEvent[];
  const registry = header.assessmentManagement;
  if (
    new Set(registry.assessors.map((a) => a.id)).size !== registry.assessors.length ||
    new Set(registry.assessors.map((a) => a.name)).size !== registry.assessors.length
  )
    throw Error('평가자 중복');
  if (new Set(registry.dayHistory.map((h) => h.id)).size !== registry.dayHistory.length)
    throw Error('평가 날짜 삭제 이력 중복');
  const deletedDates = new Map<string, boolean>();
  for (const h of registry.dayHistory) {
    const key = h.kind + '/' + h.date;
    if (
      (deletedDates.get(key) ?? false) === h.archived ||
      new Set(h.affected.map((r) => r.id)).size !== h.affected.length
    )
      throw Error('평가 날짜 삭제 이력 연결 오류');
    if (
      h.restart &&
      (h.archived ||
        h.affected.length ||
        h.restart.kind !== h.kind ||
        (h.restart.day && h.restart.day.date !== h.date) ||
        new Set(h.restart.recordIds).size !== h.restart.recordIds.length)
    )
      throw Error('평가 날짜 새 시작 이력 오류');
    deletedDates.set(key, h.archived);
  }
  for (const s of base.battingSessions)
    if (deletedDates.get('batting/' + s.date) && s.status !== 'cancelled')
      throw Error('삭제된 날짜의 활성 타격 세션');
  for (const [kind, rows] of [
    ['defense', header.defenseAssessments],
    ['fungo', header.fungoAssessments],
  ] as const)
    for (const r of rows) {
      const v = r.revisions.at(-1)!;
      if (deletedDates.get(kind + '/' + v.date) && v.status !== 'cancelled')
        throw Error('삭제된 날짜의 활성 수비 기록');
    }
  const ids = new Set(players.map((p) => p.id));
  for (const p of players)
    if (p.pref1 && p.pref1 === p.pref2) throw Error('1·2지망 포지션은 다르게 선택하세요');
  const fungoIds = new Set<string>(),
    fungoPairs = new Set<string>(),
    revisionIds = new Set<string>();
  if (new Set(header.fungoDays.map((d) => d.date)).size !== header.fungoDays.length)
    throw Error('펑고 평가 날짜 중복');
  for (const d of header.fungoDays)
    if (new Set(d.playerIds).size !== d.playerIds.length || d.playerIds.some((id) => !ids.has(id)))
      throw Error('펑고 평가 학생 오류');
  for (const r of header.fungoAssessments) {
    const pair = r.playerId + '/' + r.revisions[0].date;
    const active = r.revisions.at(-1)!.status === 'active';
    if (!ids.has(r.playerId) || fungoIds.has(r.id) || (active && fungoPairs.has(pair)))
      throw Error('펑고 기록 참조·중복 오류');
    fungoIds.add(r.id);
    if (active) fungoPairs.add(pair);
    for (const v of r.revisions) {
      if (revisionIds.has(v.id) || v.date !== r.revisions[0].date)
        throw Error('펑고 수정 이력 오류');
      revisionIds.add(v.id);
    }
  }
  const teamIds = new Set(header.teams.map((t) => team.parse(t).id));
  if (new Set(header.selections.map((s) => s.id)).size !== header.selections.length)
    throw new Error('배치안 ID 중복');
  for (const s of header.selections) {
    if (
      s.method !== 'waterfall' &&
      s.assignments.some((a) => a.score !== null && (a.score < 0 || a.score > 100))
    )
      throw Error('기존 배치 점수는 0~100');
    if (s.method === 'waterfall') {
      const w = s.waterfall;
      if (
        !w ||
        w.feedback.length !== s.assignments.length ||
        new Set(w.candidateIds).size !== w.candidateIds.length ||
        w.candidateIds.some((id) => !ids.has(id))
      )
        throw Error('워터폴 근거 누락');
      for (const a of s.assignments) {
        const f = w.feedback.filter((f) => f.playerId === a.playerId && f.position === a.position);
        if (
          f.length !== 1 ||
          !w.candidateIds.includes(a.playerId) ||
          a.score === null ||
          Math.abs(a.score - (f[0].base + f[0].bonus - f[0].penalty)) > 1e-8
        )
          throw Error('워터폴 점수 근거 불일치');
      }
    }

    if (!teamIds.has(s.teamId) || s.assignments.some((a) => !ids.has(a.playerId)))
      throw new Error('배치안 팀 또는 선수 없음');
    if (
      new Set(s.assignments.map((a) => a.position)).size !== s.assignments.length ||
      new Set(s.assignments.map((a) => a.playerId)).size !== s.assignments.length
    )
      throw new Error('배치안 포지션 또는 선수 중복');
    if (
      (!['manual', 'waterfall'].includes(s.method ?? 'automatic') || s.status === 'approved') &&
      s.assignments.length !== 10
    )
      throw new Error('TYPE1은 10포지션이 필요합니다');
    if (s.method !== 'manual' && s.assignments.some((a) => a.score === null))
      throw new Error('자동 추천은 측정 점수가 필요합니다');
    if (
      s.editedFrom &&
      !header.selections.some(
        (old) => old.id === s.editedFrom && old.teamId === s.teamId && old.id !== s.id,
      )
    )
      throw new Error('수동 배치의 이전 배치안 없음');
    if (s.status === 'approved' && (!s.approvedBy || !s.approvedAt))
      throw new Error('배치안 승인자와 시각이 필요합니다');
  }
  if (new Set(header.defenseDays.map((d) => d.date)).size !== header.defenseDays.length)
    throw new Error('수비 평가 날짜 중복');
  for (const list of [
    ...header.defenseDays.map((d) => d.playerIds),
    header.comparisonSelection?.playerIds ?? [],
  ])
    if (new Set(list).size !== list.length || list.some((id) => !ids.has(id)))
      throw new Error('수비 날짜·비교 후보 학생 중복 또는 없음');
  if (header.defenseAssessments.some((r) => !ids.has(r.playerId)))
    throw new Error('수비 평가 선수 없음');
  if (
    new Set(header.defenseEvaluationChoices.map((c) => c.id)).size !==
      header.defenseEvaluationChoices.length ||
    header.defenseEvaluationChoices.some((c) => !ids.has(c.playerId))
  )
    throw new Error('수비 점수 출처 선택 오류');
  for (const game of games) {
    validateEntry(game);
    if (
      game.entry &&
      [...game.entry.players.away, ...game.entry.players.home].some((p) => !ids.has(p.id))
    )
      throw new Error('엔트리 학생 ID 없음');
    if (!game.entry)
      for (const side of ['away', 'home'] as const)
        if (
          game.rosters[side].some(
            (id) => players.find((p) => p.id === id)?.teamId !== game.teamIds[side],
          )
        )
          throw new Error('과거 팀 스냅샷 없이 선수 소속을 바꿀 수 없습니다');
    if (game.dateStatus === 'confirmed' && !game.playedOn)
      throw new Error('확인한 경기 날짜가 없습니다');
    replayGame(
      game,
      events.filter((e) => e.gameId === game.id),
    );
  }
  return {
    ...base,
    schemaVersion: 14,
    assessmentManagement: header.assessmentManagement,
    selections: header.selections,
    fungoDays: header.fungoDays,
    fungoAssessments: header.fungoAssessments,
    defenseDays: header.defenseDays,
    comparisonSelection: header.comparisonSelection,
    battingDays: header.battingDays,
    defenseAssessments: header.defenseAssessments,
    defenseEvaluationChoices: header.defenseEvaluationChoices,
    lastReset: header.lastReset,
    migrationSource: header.migrationSource,
    teams: header.teams.map((t) => team.parse(t)),
    players,
    games,
    events,
  };
}
