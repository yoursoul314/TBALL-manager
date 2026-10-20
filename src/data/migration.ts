import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
import { parseWorkspaceV2 } from './schemaV2';
import { parseLegacyWorkspace } from './legacySchema';
import { emptyBattingData } from '../config/batting';
/** Preserve old source verbatim. Never invent attempts or mix legacy scores. */
export function migrateWorkspace(input: unknown, originalText?: string): Workspace {
  if (!input || typeof input !== 'object' || !('schemaVersion' in input))
    throw new Error('저장 데이터의 스키마 버전이 없습니다');
  if (input.schemaVersion === 4) return parseWorkspace(input);
  if (input.schemaVersion === 3)
    return parseWorkspace({
      ...parseWorkspace(input, true),
      schemaVersion: 4,
      migrationSource: { schemaVersion: 3, raw: originalText ?? JSON.stringify(input) },
    });
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2)
    throw new Error('지원하지 않는 스키마 버전');
  try {
    if (input.schemaVersion === 2)
      return parseWorkspace({
        ...parseWorkspaceV2(input),
        ...emptyBattingData(),
        schemaVersion: 4,
        migrationSource: { schemaVersion: 2, raw: originalText ?? JSON.stringify(input) },
      });
    const legacy = parseLegacyWorkspace(input);
    return parseWorkspace({
      ...legacy,
      ...emptyBattingData(),
      schemaVersion: 4,
      teamwork: [],
      legacyTeamwork: legacy.teamwork,
      legacySource: { schemaVersion: 1, raw: originalText ?? JSON.stringify(input) },
    });
  } catch (e) {
    throw new Error(
      `v${input.schemaVersion} 이전 중단: 원본을 보존했습니다. 복구가 필요합니다. ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
