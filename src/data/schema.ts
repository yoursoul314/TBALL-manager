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
  grade: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .nullable()
    .optional(),
  classroom: z.string().trim().max(30).nullable().optional(),
  studentNumber: z.number().int().min(1).max(999).nullable().optional(),
  primaryPosition: z.enum(POSITIONS).nullable().optional(),
  secondaryPosition: z.enum(POSITIONS).nullable().optional(),
  note: note.optional(),
});
export const playerSchema = extras.extend({
  id,
  teamId: id,
  name: z.string().trim().min(1).max(200),
  number: z.number().int().min(0).max(999),
  active: z.boolean(),
});
const assignments = z.partialRecord(z.enum(POSITIONS), id);
const team = z.object({
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
export function parseWorkspace(input: unknown): Workspace {
  const header = z
    .object({
      schemaVersion: z.literal(5),
      migrationSource: z
        .object({
          schemaVersion: z.union([z.literal(2), z.literal(3), z.literal(4)]),
          raw: z.string(),
        })
        .optional(),
      players: z.array(z.unknown()),
      games: z.array(z.unknown()),
      events: z.array(z.unknown()),
    })
    .parse(input);
  const base = parseWorkspaceV4(
    { ...(input as object), schemaVersion: 4, migrationSource: undefined },
    false,
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
  const ids = new Set(players.map((p) => p.id));
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
    schemaVersion: 5,
    migrationSource: header.migrationSource,
    players,
    games,
    events,
  };
}
