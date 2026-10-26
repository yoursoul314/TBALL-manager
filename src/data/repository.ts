import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
import { migrateWorkspace } from './migration';
export const LEGACY_STORAGE_KEY = 'tb-manager.workspace.v1';
export const V2_STORAGE_KEY = 'tb-manager.workspace.v2';
export const V3_STORAGE_KEY = 'tb-manager.workspace.v3';
export const V4_STORAGE_KEY = 'tb-manager.workspace.v4';
export const STORAGE_KEY = 'tb-manager.workspace.v5';
export interface WorkspaceRepository {
  load(): Workspace | null;
  save(workspace: Workspace, expectedRevision: number): Workspace;
}
/** Single-key atomic writes. Cross-tab transactional locking remains TODO. */
export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  load(): Workspace | null {
    const raw = this.storage.getItem(STORAGE_KEY);
    const legacyRaw = this.storage.getItem(LEGACY_STORAGE_KEY);
    const v4Raw = this.storage.getItem(V4_STORAGE_KEY);
    const v3Raw = this.storage.getItem(V3_STORAGE_KEY);
    const v2Raw = this.storage.getItem(V2_STORAGE_KEY);
    if (raw !== null) {
      const input = JSON.parse(raw);
      if (
        ('_legacyBaseline' in input && input._legacyBaseline !== legacyRaw) ||
        ('_v2Baseline' in input && input._v2Baseline !== v2Raw) ||
        ('_v3Baseline' in input && input._v3Baseline !== v3Raw) ||
        ('_v4Baseline' in input && input._v4Baseline !== v4Raw)
      )
        throw new Error(
          '구버전 탭의 데이터 변경이 감지되었습니다. 두 원본을 백업한 뒤 복구하세요.',
        );
      return parseWorkspace(input);
    }
    if (legacyRaw === null && v2Raw === null && v3Raw === null && v4Raw === null) return null;
    if (v2Raw !== null) {
      const v2 = JSON.parse(v2Raw);
      if ('_legacyBaseline' in v2 && v2._legacyBaseline !== legacyRaw)
        throw new Error('구버전 탭의 v1 변경이 있습니다. 원본을 복구하세요.');
    }
    if (v3Raw !== null) {
      const v3 = JSON.parse(v3Raw);
      if (
        ('_legacyBaseline' in v3 && v3._legacyBaseline !== legacyRaw) ||
        ('_v2Baseline' in v3 && v3._v2Baseline !== v2Raw)
      )
        throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    if (v4Raw !== null) {
      const v4 = JSON.parse(v4Raw);
      if (
        ('_legacyBaseline' in v4 && v4._legacyBaseline !== legacyRaw) ||
        ('_v2Baseline' in v4 && v4._v2Baseline !== v2Raw) ||
        ('_v3Baseline' in v4 && v4._v3Baseline !== v3Raw)
      )
        throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    const source = v4Raw ?? v3Raw ?? v2Raw ?? legacyRaw!;
    const migrated = migrateWorkspace(JSON.parse(source), source);
    // Atomic v5 write. Original v1/v2/v3/v4 keys remain untouched on success or failure.
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...migrated,
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
      }),
    );
    return migrated;
  }
  save(workspace: Workspace, expectedRevision: number) {
    const previous = this.load();
    if ((previous?.revision ?? 0) !== expectedRevision)
      throw new Error('다른 탭에서 기록이 변경되었습니다. JSON 백업 후 새로고침하세요.');
    const validated = parseWorkspace({ ...workspace, revision: expectedRevision + 1 });
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...validated,
        _legacyBaseline: this.storage.getItem(LEGACY_STORAGE_KEY),
        _v2Baseline: this.storage.getItem(V2_STORAGE_KEY),
        _v3Baseline: this.storage.getItem(V3_STORAGE_KEY),
        _v4Baseline: this.storage.getItem(V4_STORAGE_KEY),
      }),
    );
    return validated;
  }
  recoverySnapshot() {
    return JSON.stringify(
      {
        format: 'tb-manager-recovery',
        v1: this.storage.getItem(LEGACY_STORAGE_KEY),
        v2: this.storage.getItem(V2_STORAGE_KEY),
        v3: this.storage.getItem(V3_STORAGE_KEY),
        v4: this.storage.getItem(V4_STORAGE_KEY),
        v5: this.storage.getItem(STORAGE_KEY),
      },
      null,
      2,
    );
  }
}
export interface SyncCursor {
  serverRevision: number;
  lastEventId: string | null;
}
export interface SyncPort {
  push(events: Workspace['events'], expected: SyncCursor): Promise<SyncCursor>;
  pull(cursor: SyncCursor): Promise<{ events: Workspace['events']; cursor: SyncCursor }>;
}
// TODO: authenticated API, ACL, IndexedDB transactional outbox, single-writer lease.
export function serializeBackup(workspace: Workspace) {
  return JSON.stringify(
    {
      format: 'tb-manager-backup',
      version: 5,
      exportedAt: new Date().toISOString(),
      workspace: parseWorkspace(workspace),
    },
    null,
    2,
  );
}
export function readBackup(text: string) {
  if (text.length > 10_000_000) throw new Error('백업 파일은 10MB 이하여야 합니다');
  const value = JSON.parse(text);
  if (
    value?.format !== 'tb-manager-backup' ||
    ![1, 2, 3, 4, 5].includes(value.version) ||
    value.workspace?.schemaVersion !== value.version
  )
    throw new Error('지원하지 않는 백업 형식');
  return migrateWorkspace(value.workspace);
}
export function downloadFile(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
