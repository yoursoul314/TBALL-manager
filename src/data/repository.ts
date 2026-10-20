import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
export const STORAGE_KEY = 'tb-manager.workspace.v1';
export interface WorkspaceRepository {
  load(): Workspace | null;
  save(workspace: Workspace, expectedRevision: number): Workspace;
}
/** Prototype adapter; replace with IndexedDB + transactional outbox for production sync. */
export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  load() {
    const raw = this.storage.getItem(STORAGE_KEY);
    return raw === null ? null : parseWorkspace(JSON.parse(raw));
  }
  save(workspace: Workspace, expectedRevision: number) {
    const previous = this.load();
    if ((previous?.revision ?? 0) !== expectedRevision)
      throw new Error('다른 탭에서 기록이 변경되었습니다. JSON 백업 후 새로고침하세요.');
    const validated = parseWorkspace({ ...workspace, revision: expectedRevision + 1 });
    this.storage.setItem(STORAGE_KEY, JSON.stringify(validated)); // Throws on quota failure; caller must not claim success.
    return validated;
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
// TODO: authenticated API, ACL, single-writer game lease, IndexedDB outbox, idempotent server commit.
// No automatic last-write-wins merge for simultaneous scoring.
export function serializeBackup(workspace: Workspace) {
  return JSON.stringify(
    {
      format: 'tb-manager-backup',
      version: 1,
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
  if (value.format !== 'tb-manager-backup' || value.version !== 1)
    throw new Error('지원하지 않는 백업 형식');
  return parseWorkspace(value.workspace);
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
