import { LAST_ASSESSOR_KEY } from './assessmentPreferences';
import {
  recoverBrowserStorage,
  pendingStorageMove,
  storedArchiveId,
  RECOVERY_PENDING,
  moveMarker,
} from './recoverStorage';
import {
  withRecoveryLock,
  recoveryArchiveStore,
  type RecoveryArchiveStore,
} from './recoveryArchive';
import { decodeStorageText, writeStorageText, MAX_BACKUP_BYTES } from './storageCodec';
import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
import { migrateWorkspace } from './migration';
export const LEGACY_STORAGE_KEY = 'tb-manager.workspace.v1';
export const V2_STORAGE_KEY = 'tb-manager.workspace.v2';
export const V3_STORAGE_KEY = 'tb-manager.workspace.v3';
export const V4_STORAGE_KEY = 'tb-manager.workspace.v4';
export const V5_STORAGE_KEY = 'tb-manager.workspace.v5';
export const V6_STORAGE_KEY = 'tb-manager.workspace.v6';
export const V7_STORAGE_KEY = 'tb-manager.workspace.v7';
export const V8_STORAGE_KEY = 'tb-manager.workspace.v8';
export const V9_STORAGE_KEY = 'tb-manager.workspace.v9';
export const V10_STORAGE_KEY = 'tb-manager.workspace.v10';
export const V11_STORAGE_KEY = 'tb-manager.workspace.v11';
export const STORAGE_KEY = 'tb-manager.workspace.v12';
export interface WorkspaceRepository {
  load(): Workspace | null;
  save(workspace: Workspace, expectedRevision: number): Workspace;
}
/** Single-key atomic writes. Cross-tab transactional locking remains TODO. */
export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>,
    private archives: RecoveryArchiveStore = recoveryArchiveStore,
  ) {}
  load(persistMigration = true): Workspace | null {
    if (pendingStorageMove(this.storage)) throw Error(RECOVERY_PENDING);
    const raw = this.storage.getItem(STORAGE_KEY);
    const legacyRaw = this.storage.getItem(LEGACY_STORAGE_KEY);
    const v11Raw = this.storage.getItem(V11_STORAGE_KEY);
    const v10Raw = this.storage.getItem(V10_STORAGE_KEY);
    const v9Raw = this.storage.getItem(V9_STORAGE_KEY);
    const v8Raw = this.storage.getItem(V8_STORAGE_KEY);
    const v7Raw = this.storage.getItem(V7_STORAGE_KEY);
    const v6Raw = this.storage.getItem(V6_STORAGE_KEY);
    const v5Raw = this.storage.getItem(V5_STORAGE_KEY);
    const v4Raw = this.storage.getItem(V4_STORAGE_KEY);
    const v3Raw = this.storage.getItem(V3_STORAGE_KEY);
    const v2Raw = this.storage.getItem(V2_STORAGE_KEY);
    if (raw !== null) {
      const input = JSON.parse(decodeStorageText(raw));
      if (
        ('_legacyBaseline' in input && input._legacyBaseline !== legacyRaw) ||
        ('_v2Baseline' in input && input._v2Baseline !== v2Raw) ||
        ('_v3Baseline' in input && input._v3Baseline !== v3Raw) ||
        ('_v4Baseline' in input && input._v4Baseline !== v4Raw) ||
        ('_v5Baseline' in input && input._v5Baseline !== v5Raw) ||
        ('_v6Baseline' in input && input._v6Baseline !== v6Raw) ||
        ('_v7Baseline' in input && input._v7Baseline !== v7Raw) ||
        ('_v8Baseline' in input && input._v8Baseline !== v8Raw) ||
        ('_v9Baseline' in input && input._v9Baseline !== v9Raw) ||
        ('_v10Baseline' in input && input._v10Baseline !== v10Raw) ||
        ('_v11Baseline' in input && input._v11Baseline !== v11Raw)
      )
        throw new Error(
          '구버전 탭의 데이터 변경이 감지되었습니다. 두 원본을 백업한 뒤 복구하세요.',
        );
      const current =
        input.schemaVersion === 12 ? migrateWorkspace(input, raw) : parseWorkspace(input);
      if (input.schemaVersion === 12 && persistMigration)
        writeStorageText(this.storage, STORAGE_KEY, JSON.stringify({ ...input, ...current }));
      return current;
    }
    if (
      legacyRaw === null &&
      v2Raw === null &&
      v3Raw === null &&
      v4Raw === null &&
      v5Raw === null &&
      v6Raw === null &&
      v7Raw === null &&
      v8Raw === null &&
      v9Raw === null &&
      v10Raw === null &&
      v11Raw === null
    )
      return null;
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
    if (v5Raw !== null) {
      const v5 = JSON.parse(v5Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
      })) {
        if (key in v5 && v5[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
      }
    }
    if (v6Raw !== null) {
      const v6 = JSON.parse(v6Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
      })) {
        if (key in v6 && v6[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
      }
    }
    if (v7Raw !== null) {
      const v7 = JSON.parse(v7Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
      })) {
        if (key in v7 && v7[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
      }
    }
    if (v8Raw !== null) {
      const v8 = JSON.parse(v8Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
        _v7Baseline: v7Raw,
      }))
        if (key in v8 && v8[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    if (v9Raw !== null) {
      const v9 = JSON.parse(v9Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
        _v7Baseline: v7Raw,
        _v8Baseline: v8Raw,
      }))
        if (key in v9 && v9[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    if (v10Raw !== null) {
      const v10 = JSON.parse(v10Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
        _v7Baseline: v7Raw,
        _v8Baseline: v8Raw,
        _v9Baseline: v9Raw,
      }))
        if (key in v10 && v10[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    if (v11Raw !== null) {
      const v11 = JSON.parse(v11Raw);
      for (const [key, value] of Object.entries({
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
        _v7Baseline: v7Raw,
        _v8Baseline: v8Raw,
        _v9Baseline: v9Raw,
        _v10Baseline: v10Raw,
      }))
        if (key in v11 && v11[key] !== value)
          throw new Error('구버전 탭의 변경이 있습니다. 모든 원본을 복구하세요.');
    }
    const source =
      v11Raw ??
      v10Raw ??
      v9Raw ??
      v8Raw ??
      v7Raw ??
      v6Raw ??
      v5Raw ??
      v4Raw ??
      v3Raw ??
      v2Raw ??
      legacyRaw!;
    const migrated = migrateWorkspace(JSON.parse(source), source);
    if (!persistMigration) return migrated;
    // Atomic v12 write. Original v1/v2/v3/v4/v5/v6/v7/v8/v9/v10/v11 keys remain untouched on success or failure.
    writeStorageText(
      this.storage,
      STORAGE_KEY,
      JSON.stringify({
        ...migrated,
        _legacyBaseline: legacyRaw,
        _v2Baseline: v2Raw,
        _v3Baseline: v3Raw,
        _v4Baseline: v4Raw,
        _v5Baseline: v5Raw,
        _v6Baseline: v6Raw,
        _v7Baseline: v7Raw,
        _v8Baseline: v8Raw,
        _v9Baseline: v9Raw,
        _v10Baseline: v10Raw,
        _v11Baseline: v11Raw,
      }),
    );
    return migrated;
  }
  save(workspace: Workspace, expectedRevision: number) {
    const previous = this.load();
    if ((previous?.revision ?? 0) !== expectedRevision)
      throw new Error('다른 탭에서 기록이 변경되었습니다. JSON 백업 후 새로고침하세요.');
    const validated = parseWorkspace({ ...workspace, revision: expectedRevision + 1 });
    writeStorageText(
      this.storage,
      STORAGE_KEY,
      JSON.stringify({
        ...validated,
        _storageArchiveId: storedArchiveId(this.storage),
        _archiveCleanupPending: this.hasPendingArchiveCleanup() ? true : undefined,
        _legacyBaseline: this.storage.getItem(LEGACY_STORAGE_KEY),
        _v2Baseline: this.storage.getItem(V2_STORAGE_KEY),
        _v3Baseline: this.storage.getItem(V3_STORAGE_KEY),
        _v4Baseline: this.storage.getItem(V4_STORAGE_KEY),
        _v5Baseline: this.storage.getItem(V5_STORAGE_KEY),
        _v6Baseline: this.storage.getItem(V6_STORAGE_KEY),
        _v7Baseline: this.storage.getItem(V7_STORAGE_KEY),
        _v8Baseline: this.storage.getItem(V8_STORAGE_KEY),
        _v9Baseline: this.storage.getItem(V9_STORAGE_KEY),
        _v10Baseline: this.storage.getItem(V10_STORAGE_KEY),
        _v11Baseline: this.storage.getItem(V11_STORAGE_KEY),
      }),
    );
    return validated;
  }
  resetAll(workspace: Workspace, expectedRevision: number) {
    if (!this.storage.removeItem) throw new Error('전체 초기화를 지원하지 않는 저장소입니다');
    const archiveId = storedArchiveId(this.storage);
    const keys = [
      LAST_ASSESSOR_KEY,
      LEGACY_STORAGE_KEY,
      V2_STORAGE_KEY,
      V3_STORAGE_KEY,
      V4_STORAGE_KEY,
      V5_STORAGE_KEY,
      V6_STORAGE_KEY,
      V7_STORAGE_KEY,
      V8_STORAGE_KEY,
      V9_STORAGE_KEY,
      V10_STORAGE_KEY,
      V11_STORAGE_KEY,
      STORAGE_KEY,
    ];
    const original = keys.map((key) => [key, this.storage.getItem(key)] as const);
    let written = false;
    try {
      const saved = this.save(workspace, expectedRevision);
      written = true;
      for (const key of keys.slice(0, -1)) this.storage.removeItem(key);
      writeStorageText(
        this.storage,
        STORAGE_KEY,
        JSON.stringify({
          ...saved,
          _storageArchiveId: archiveId,
          _archiveCleanupPending: true,
          _legacyBaseline: null,
          _v2Baseline: null,
          _v3Baseline: null,
          _v4Baseline: null,
          _v5Baseline: null,
          _v6Baseline: null,
          _v7Baseline: null,
          _v8Baseline: null,
          _v9Baseline: null,
          _v10Baseline: null,
          _v11Baseline: null,
        }),
      );
      return saved;
    } catch (error) {
      if (!written) throw error;
      try {
        for (const [key, value] of original) {
          if (value === null) this.storage.removeItem(key);
          else this.storage.setItem(key, value);
        }
      } catch {
        throw new Error('초기화 실패 후 원본 복구에도 실패했습니다. 초기화 전 백업을 복원하세요');
      }
      throw error;
    }
  }
  hasPendingRecovery() {
    return Boolean(pendingStorageMove(this.storage));
  }
  hasStorageArchive() {
    return this.hasPendingRecovery() || Boolean(storedArchiveId(this.storage));
  }
  recoverStorage() {
    return withRecoveryLock(() =>
      recoverBrowserStorage(this.storage, () => this.load(false), this.archives),
    );
  }
  async inspectStoredWorkspace() {
    const pending = pendingStorageMove(this.storage);
    if (!pending) return this.load(false);
    const row = await this.archives.get(moveMarker(pending.raw)!.archiveId);
    if (!row) throw Error('원본 보관본을 찾을 수 없습니다');
    return migrateWorkspace(JSON.parse(decodeStorageText(row.target)));
  }
  async exportRecoveryWithArchives() {
    return JSON.stringify(
      { ...JSON.parse(this.recoverySnapshot()), archives: await this.archives.all() },
      null,
      2,
    );
  }
  hasPendingArchiveCleanup() {
    const raw = this.storage.getItem(STORAGE_KEY);
    return Boolean(
      raw && !moveMarker(raw) && JSON.parse(decodeStorageText(raw))._archiveCleanupPending,
    );
  }
  finishArchiveCleanup() {
    return withRecoveryLock(() => this.clearArchivedOriginals());
  }
  private async clearArchivedOriginals() {
    if (!this.hasPendingArchiveCleanup()) return;
    await this.archives.clear();
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw || moveMarker(raw)) throw Error('원본 정리 중 저장 상태가 바뀌었습니다');
    const next = JSON.parse(decodeStorageText(raw));
    if (!next._archiveCleanupPending) return;
    delete next._storageArchiveId;
    delete next._archiveCleanupPending;
    writeStorageText(this.storage, STORAGE_KEY, JSON.stringify(next));
  }
  recoverySnapshot() {
    return JSON.stringify(
      {
        format: 'tb-manager-recovery',
        v1: this.storage.getItem(LEGACY_STORAGE_KEY),
        v2: this.storage.getItem(V2_STORAGE_KEY),
        v3: this.storage.getItem(V3_STORAGE_KEY),
        v4: this.storage.getItem(V4_STORAGE_KEY),
        v5: this.storage.getItem(V5_STORAGE_KEY),
        v6: this.storage.getItem(V6_STORAGE_KEY),
        v7: this.storage.getItem(V7_STORAGE_KEY),
        v8: this.storage.getItem(V8_STORAGE_KEY),
        v9: this.storage.getItem(V9_STORAGE_KEY),
        v10: this.storage.getItem(V10_STORAGE_KEY),
        v11: this.storage.getItem(V11_STORAGE_KEY),
        v12: this.storage.getItem(STORAGE_KEY),
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
      version: 13,
      exportedAt: new Date().toISOString(),
      workspace: parseWorkspace(workspace),
    },
    null,
    2,
  );
}
export function readBackup(text: string) {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('백업 파일은 64MB 이하여야 합니다');
  const value = JSON.parse(text);
  if (
    value?.format !== 'tb-manager-backup' ||
    ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(value.version) ||
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
