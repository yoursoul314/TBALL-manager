import type { Workspace } from '../domain/model';
import { parseWorkspace } from './schema';
import { encodeStorageText, decodeStorageText } from './storageCodec';
import {
  recoveryArchiveStore,
  type RecoveryArchive,
  type RecoveryArchiveStore,
} from './recoveryArchive';
export const RECOVERY_KEYS = Array.from(
  { length: 12 },
  (_, i) => 'tb-manager.workspace.v' + (i + 1),
);
const CURRENT_KEY = RECOVERY_KEYS[11];
export const RECOVERY_PENDING =
  '저장 공간 복구가 중단되었습니다. 원본 보관본으로 복구를 이어가세요.';
const MARKER_FORMAT = 'tb-manager-storage-move-v1';
type StoragePort = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;
export function moveMarker(raw: string | null): { archiveId: string } | null {
  if (!raw || !raw.includes(MARKER_FORMAT)) return null;
  try {
    const marker = JSON.parse(raw);
    return marker?.format === MARKER_FORMAT && typeof marker.archiveId === 'string' ? marker : null;
  } catch {
    return null;
  }
}
export function pendingStorageMove(storage: Pick<Storage, 'getItem'>) {
  return (
    RECOVERY_KEYS.map((key) => ({ key, raw: storage.getItem(key) })).find(({ raw }) =>
      moveMarker(raw),
    ) ?? null
  );
}
export function storedArchiveId(storage: Pick<Storage, 'getItem'>): string | undefined {
  const raw = storage.getItem(CURRENT_KEY);
  if (!raw || moveMarker(raw)) return undefined;
  try {
    const value = JSON.parse(decodeStorageText(raw))._storageArchiveId;
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}
const snapshot = (storage: Pick<Storage, 'getItem'>) =>
  Object.fromEntries(RECOVERY_KEYS.map((key) => [key, storage.getItem(key)]));
const conflict = () =>
  Error(
    '복구 중 다른 탭의 변경이 발견되었습니다. 모든 원본을 보관하고 다른 TB Manager 탭을 닫아주세요.',
  );
function markerText(id: string) {
  return JSON.stringify({ format: MARKER_FORMAT, archiveId: id });
}
function validateArchive(row: RecoveryArchive, id: string) {
  if (
    row.version !== 1 ||
    row.id !== id ||
    !RECOVERY_KEYS.includes(row.anchorKey) ||
    typeof row.originals?.[row.anchorKey] !== 'string' ||
    RECOVERY_KEYS.some(
      (k) =>
        !(k in row.originals) ||
        (row.originals[k] !== null && typeof row.originals[k] !== 'string'),
    )
  )
    throw Error('원본 보관파일 검증 실패. 저장 데이터를 변경하지 않았습니다.');
  const target = JSON.parse(decodeStorageText(row.target));
  if (target._storageArchiveId !== id) throw Error('복구 대상 원본 ID 불일치');
  return parseWorkspace(target);
}
/** Preserve all raw keys in committed IndexedDB, then use a tiny in-place journal.
 * No empty-key window: a journal or the verified target always survives a reload.
 */
export async function recoverBrowserStorage(
  storage: StoragePort,
  loadReadOnly: () => Workspace | null,
  archives: RecoveryArchiveStore = recoveryArchiveStore,
): Promise<Workspace> {
  if (!storage.removeItem) throw Error('이 저장소에서는 공간 복구를 지원하지 않습니다');
  const pending = pendingStorageMove(storage);
  let row: RecoveryArchive;
  if (pending) {
    const id = moveMarker(pending.raw)!.archiveId;
    const archived = await archives.get(id);
    if (!archived) throw Error('원본 보관본을 찾을 수 없습니다. 원본 복구 파일을 보관하세요.');
    row = archived;
    validateArchive(row, id);
  } else {
    const originals = snapshot(storage),
      data = loadReadOnly();
    if (!data) throw Error('복구할 기존 기록이 없습니다');
    const anchorKey = [...RECOVERY_KEYS].reverse().find((k) => originals[k] !== null)!;
    const id = crypto.randomUUID();
    const target = parseWorkspace({ ...data, revision: data.revision + 1 });
    const baselines = Object.fromEntries(
      RECOVERY_KEYS.slice(0, -1).map((_, i) => [
        i === 0 ? '_legacyBaseline' : '_v' + (i + 1) + 'Baseline',
        null,
      ]),
    );
    row = {
      version: 1,
      id,
      createdAt: new Date().toISOString(),
      anchorKey,
      originals,
      target: encodeStorageText(
        JSON.stringify({ ...target, ...baselines, _storageArchiveId: id }),
        true,
      ),
    };
    validateArchive(row, id);
    await archives.put(row); // Promise resolves only after the transaction commits.
    const verified = await archives.get(id);
    if (!verified || JSON.stringify(verified) !== JSON.stringify(row))
      throw Error('원본 보관본 재확인 실패. 기존 저장소를 정리하지 않았습니다.');
    for (const key of RECOVERY_KEYS) if (storage.getItem(key) !== originals[key]) throw conflict();
    const marker = markerText(id);
    if (marker.length >= originals[anchorKey]!.length)
      throw Error('복구 표식을 안전하게 저장할 공간이 없습니다. 원본을 유지합니다.');
    storage.setItem(anchorKey, marker); // Atomic replacement releases space without losing the archive link.
  }
  const marker = markerText(row.id);
  // A restarted move accepts only the archived values, our journal, already removed keys, or our exact target.
  for (const key of RECOVERY_KEYS) {
    const raw = storage.getItem(key);
    if (
      raw !== null &&
      raw !== row.originals[key] &&
      !(key === row.anchorKey && raw === marker) &&
      !(key === CURRENT_KEY && raw === row.target)
    )
      throw conflict();
  }
  for (const key of RECOVERY_KEYS.slice(0, -1)) {
    if (key === row.anchorKey) continue;
    const raw = storage.getItem(key);
    if (raw !== null && raw !== row.originals[key]) throw conflict();
    if (raw !== null) storage.removeItem(key);
  }
  const current = storage.getItem(CURRENT_KEY);
  if (
    current !== null &&
    current !== row.target &&
    !(row.anchorKey === CURRENT_KEY && current === marker)
  )
    throw conflict();
  if (current !== row.target) storage.setItem(CURRENT_KEY, row.target);
  if (storage.getItem(CURRENT_KEY) !== row.target)
    throw Error('복구 저장본 확인 실패. 원본 보관본을 유지합니다.');
  if (row.anchorKey !== CURRENT_KEY) {
    const raw = storage.getItem(row.anchorKey);
    if (raw !== marker && raw !== null) throw conflict();
    if (raw !== null) storage.removeItem(row.anchorKey);
  }
  return validateArchive(row, row.id);
}
