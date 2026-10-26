import type { PhotoRecord } from './photos';

// Keep v1 Blob rows readable. New writes use structured-clone-safe bytes for WebKit.
export interface StoredPhoto {
  playerId: string;
  bytes: ArrayBuffer;
  mimeType: string;
  updatedAt: string;
  formatVersion: 2;
}
export async function encodePhoto(record: PhotoRecord): Promise<StoredPhoto> {
  return {
    playerId: record.playerId,
    bytes: await record.blob.arrayBuffer(),
    mimeType: record.blob.type,
    updatedAt: record.updatedAt,
    formatVersion: 2,
  };
}
export function decodePhoto(record: StoredPhoto | PhotoRecord): PhotoRecord {
  if ('blob' in record) return record;
  return {
    playerId: record.playerId,
    blob: new Blob([record.bytes], { type: record.mimeType }),
    updatedAt: record.updatedAt,
  };
}
