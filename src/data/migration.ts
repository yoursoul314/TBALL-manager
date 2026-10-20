import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
import { parseLegacyWorkspace } from './legacySchema';

/** Pure and idempotent; never fills unobserved values or mutates the source. */
export function migrateWorkspace(input: unknown, originalText?: string): Workspace {
  if (!input || typeof input !== 'object' || !('schemaVersion' in input))
    throw new Error('저장 데이터의 스키마 버전이 없습니다');
  if (input.schemaVersion === 2) return parseWorkspace(input);
  if (input.schemaVersion !== 1) throw new Error('지원하지 않는 스키마 버전');
  try {
    const legacy = parseLegacyWorkspace(input);
    return parseWorkspace({
      ...legacy,
      schemaVersion: 2,
      teamwork: [],
      legacyTeamwork: legacy.teamwork,
      legacySource: { schemaVersion: 1, raw: originalText ?? JSON.stringify(input) },
    });
  } catch (error) {
    throw new Error(
      'v1 이전 중단: 원본을 보존했습니다. 복구가 필요합니다. ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
