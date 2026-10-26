export const PHOTO_MAX_UPLOAD = 8_000_000;
export const PHOTO_MAX_STORED = 200_000;
export interface PhotoRecord {
  playerId: string;
  blob: Blob;
  updatedAt: string;
}
export interface PhotoRepository {
  get(id: string): Promise<PhotoRecord | null>;
  all(): Promise<PhotoRecord[]>;
  update(records: PhotoRecord[], removeIds?: string[]): Promise<void>;
}
const changed = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tb-photo-change'));
};
export class IndexedPhotoRepository implements PhotoRepository {
  constructor(private name = 'tb-manager-photos-v1') {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('이 브라우저에서 사진 저장소를 사용할 수 없습니다'));
        return;
      }
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'playerId' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('사진 저장소가 다른 탭에서 사용 중입니다'));
    });
  }
  async all() {
    const db = await this.open();
    return new Promise<PhotoRecord[]>((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly'),
        req = tx.objectStore('photos').getAll();
      let rows: PhotoRecord[] = [];
      req.onsuccess = () => {
        rows = req.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(rows);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('사진 읽기 실패'));
      };
    });
  }
  async get(id: string) {
    const db = await this.open();
    return new Promise<PhotoRecord | null>((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly'),
        req = tx.objectStore('photos').get(id);
      let row: PhotoRecord | null = null;
      req.onsuccess = () => {
        row = req.result ?? null;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(row);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('사진 읽기 실패'));
      };
    });
  }
  async update(records: PhotoRecord[], removeIds: string[] = []) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite'),
        store = tx.objectStore('photos');
      for (const id of removeIds) store.delete(id);
      for (const record of records) store.put(record);
      tx.oncomplete = () => {
        db.close();
        changed();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error('사진 저장 실패'));
      };
    });
  }
}
export class MemoryPhotoRepository implements PhotoRepository {
  private rows = new Map<string, PhotoRecord>();
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async all() {
    return [...this.rows.values()];
  }
  async update(rows: PhotoRecord[], remove: string[] = []) {
    remove.forEach((id) => this.rows.delete(id));
    rows.forEach((r) => this.rows.set(r.playerId, r));
    changed();
  }
}
// Preview photos are isolated from real student photos and discarded when the tab closes.
export const photoRepository: PhotoRepository =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('preview') === '1'
    ? new MemoryPhotoRepository()
    : new IndexedPhotoRepository();
export async function validatePhotoFile(file: Blob) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('JPEG, PNG, WebP 사진만 지원합니다');
  if (!file.size || file.size > PHOTO_MAX_UPLOAD) throw new Error('사진은 8MB 이하여야 합니다');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!{ 'image/jpeg': jpeg, 'image/png': png, 'image/webp': webp }[file.type])
    throw new Error('사진의 실제 형식이 파일 형식과 다릅니다');
}
export async function preparePhoto(file: Blob): Promise<Blob> {
  await validatePhotoFile(file);
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (!image.width || !image.height || image.width * image.height > 80_000_000)
      throw new Error('사진 해상도가 너무 큽니다');
    const scale = Math.min(1, 320 / Math.max(image.width, image.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진 축소를 지원하지 않는 브라우저입니다');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('사진 변환 실패'))),
        'image/jpeg',
        0.82,
      ),
    );
    if (blob.size > PHOTO_MAX_STORED) throw new Error('축소된 사진이 너무 큽니다');
    return blob;
  } finally {
    image.close();
  }
}
export async function saveWithPhoto(
  store: PhotoRepository,
  id: string,
  photo: Blob | null | undefined,
  save: () => void,
) {
  if (photo === undefined) {
    save();
    return;
  }
  const previous = await store.get(id);
  await store.update(
    photo ? [{ playerId: id, blob: photo, updatedAt: new Date().toISOString() }] : [],
    photo ? [] : [id],
  );
  try {
    save();
  } catch (error) {
    try {
      await store.update(previous ? [previous] : [], previous ? [] : [id]);
    } catch {
      throw new Error('기록 저장과 사진 복구에 실패했습니다. 백업을 보관하고 사진을 확인하세요');
    }
    throw error;
  }
}
