import { z } from 'zod';
import type { Workspace } from '../domain/model';
import { serializeBackup, readBackup } from './repository';
import {
  validatePhotoFile,
  PHOTO_MAX_STORED,
  type PhotoRecord,
  type PhotoRepository,
} from './photos';
const ITERATIONS = 600000;
const b64 = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 16384)
    out += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(out);
};
const bytes = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function serializePhotoBackup(
  workspace: Workspace,
  store: PhotoRepository,
  password: string,
) {
  if (password.length < 10) throw new Error('사진 포함 백업 암호는 10자 이상 입력하세요');
  const ids = new Set(workspace.players.map((p) => p.id));
  const photos = await Promise.all(
    (await store.all())
      .filter((p) => ids.has(p.playerId))
      .map(async (p) => ({
        playerId: p.playerId,
        type: p.blob.type,
        data: b64(new Uint8Array(await p.blob.arrayBuffer())),
        updatedAt: p.updatedAt,
      })),
  );
  const content = JSON.stringify({ backup: serializeBackup(workspace), photos });
  if (content.length > 75_000_000) throw new Error('사진 백업이 너무 큽니다. 사진을 줄여주세요');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(password, salt),
    new TextEncoder().encode(content),
  );
  return JSON.stringify({
    format: 'tb-manager-protected-backup',
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(new Uint8Array(encrypted)),
  });
}
export async function readPhotoBackup(text: string, password: string) {
  if (text.length > 100_000_000) throw new Error('사진 백업은 100MB 이하여야 합니다');
  const envelope = z
    .object({
      format: z.literal('tb-manager-protected-backup'),
      version: z.literal(1),
      algorithm: z.literal('AES-256-GCM'),
      kdf: z.literal('PBKDF2-SHA256'),
      iterations: z.literal(ITERATIONS),
      salt: z.string().max(32),
      iv: z.string().max(24),
      data: z.string().max(100_000_000),
    })
    .parse(JSON.parse(text));
  const salt = bytes(envelope.salt),
    iv = bytes(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error('암호화 백업 형식 오류');
  let decoded: string;
  try {
    decoded = new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        await key(password, salt),
        bytes(envelope.data),
      ),
    );
  } catch {
    throw new Error('암호가 다르거나 백업이 손상되었습니다');
  }
  const payload = z
    .object({
      backup: z.string().max(64_000_000),
      photos: z
        .array(
          z.object({
            playerId: z.string().min(1).max(120),
            type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            data: z.string().max(280000),
            updatedAt: z.iso.datetime(),
          }),
        )
        .max(2000),
    })
    .parse(JSON.parse(decoded));
  const workspace = readBackup(payload.backup),
    ids = new Set(workspace.players.map((p) => p.id)),
    seen = new Set<string>();
  const photos: PhotoRecord[] = [];
  for (const p of payload.photos) {
    if (!ids.has(p.playerId) || seen.has(p.playerId))
      throw new Error('사진 학생 ID가 없거나 중복되었습니다');
    seen.add(p.playerId);
    const blob = new Blob([bytes(p.data)], { type: p.type });
    if (blob.size > PHOTO_MAX_STORED) throw new Error('백업 사진 크기 초과');
    await validatePhotoFile(blob);
    photos.push({ playerId: p.playerId, blob, updatedAt: p.updatedAt });
  }
  return { workspace, photos };
}
export async function restorePhotosAndWorkspace(
  store: PhotoRepository,
  photos: PhotoRecord[],
  workspace: Workspace,
  save: (d: Workspace) => void,
) {
  const previous = await store.all();
  await store.update(
    photos,
    previous.map((p) => p.playerId),
  );
  try {
    save(workspace);
  } catch (error) {
    try {
      await store.update(
        previous,
        photos.map((p) => p.playerId),
      );
    } catch {
      throw new Error('기록 복원 실패 후 사진 복구에도 실패했습니다. 복원 전 백업을 보관하세요');
    }
    throw error;
  }
}
