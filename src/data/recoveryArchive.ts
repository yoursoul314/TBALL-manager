export const RECOVERY_DB = 'tb-manager-recovery-v1';
export interface RecoveryArchive {
  version: 1;
  id: string;
  createdAt: string;
  anchorKey: string;
  originals: Record<string, string | null>;
  target: string;
}
export interface RecoveryArchiveStore {
  put(row: RecoveryArchive): Promise<void>;
  get(id: string): Promise<RecoveryArchive | null>;
  all(): Promise<RecoveryArchive[]>;
  clear(): Promise<void>;
}
export class IndexedRecoveryArchiveStore implements RecoveryArchiveStore {
  constructor(private name = RECOVERY_DB) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined')
        return reject(
          Error('이 브라우저에서 원본 보관소를 열 수 없습니다. 원본은 그대로 유지됩니다.'),
        );
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('snapshots', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(Error('원본 보관소가 다른 탭에서 사용 중입니다. 다른 TB Manager 탭을 닫아주세요.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction('snapshots', mode);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      let result: T, failure: unknown;
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onabort = () => {
        db.close();
        reject(failure ?? transaction.error ?? Error('원본 보관 실패'));
      };
      try {
        const request = action(transaction.objectStore('snapshots'));
        request.onsuccess = () => {
          result = request.result;
        };
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    });
  }
  async put(row: RecoveryArchive) {
    await this.run('readwrite', (store) => store.add(row));
  }
  async get(id: string) {
    return (
      (await this.run<RecoveryArchive | undefined>('readonly', (store) => store.get(id))) ?? null
    );
  }
  async all() {
    return this.run<RecoveryArchive[]>('readonly', (store) => store.getAll());
  }
  async clear() {
    await this.run('readwrite', (store) => store.clear());
  }
}
export const recoveryArchiveStore = new IndexedRecoveryArchiveStore();

export class MemoryRecoveryArchiveStore implements RecoveryArchiveStore {
  private rows = new Map<string, RecoveryArchive>();
  async put(row: RecoveryArchive) {
    if (this.rows.has(row.id)) throw Error('원본 ID 중복');
    this.rows.set(row.id, structuredClone(row));
  }
  async get(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async all() {
    return structuredClone([...this.rows.values()]);
  }
  async clear() {
    this.rows.clear();
  }
}
export async function withRecoveryLock<T>(operation: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request('tb-manager-storage-recovery', operation)
    : operation();
}
