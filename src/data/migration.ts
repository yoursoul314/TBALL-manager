import type { Workspace } from '../domain/model';
import { captureLegacyEntry } from '../domain/roster';
import { parseWorkspace } from './schema';
import { migrateWorkspaceV4 } from './migrationV4';
export function migrateWorkspace(input: unknown, originalText?: string): Workspace {
  if (!input || typeof input !== 'object' || !('schemaVersion' in input))
    throw new Error('저장 데이터의 스키마 버전이 없습니다');
  if (input.schemaVersion === 6) return parseWorkspace(input);
  if (input.schemaVersion === 5)
    return parseWorkspace({
      ...input,
      schemaVersion: 6,
      migrationSource: { schemaVersion: 5, raw: originalText ?? JSON.stringify(input) },
    });
  const old = migrateWorkspaceV4(input, originalText);
  return parseWorkspace({
    ...old,
    schemaVersion: 6,
    ...(input.schemaVersion === 4
      ? { migrationSource: { schemaVersion: 4, raw: originalText ?? JSON.stringify(input) } }
      : {}),
    players: old.players.map((p) => ({
      ...p,
      grade: null,
      classroom: null,
      studentNumber: null,
      primaryPosition: null,
      secondaryPosition: null,
      note: '',
    })),
    games: old.games.map((g) => ({
      ...g,
      playedOn: g.createdAt.slice(0, 10),
      dateStatus: 'estimated',
      startTime: null,
      note: '',
      formation: 'TYPE1',
      entry: captureLegacyEntry(g, old),
    })),
  });
}
