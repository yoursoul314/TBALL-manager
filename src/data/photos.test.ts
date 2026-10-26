import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import {
  MemoryPhotoRepository,
  validatePhotoFile,
  saveWithPhoto,
  PHOTO_MAX_UPLOAD,
} from './photos';
import { readPhotoBackup, serializePhotoBackup, restorePhotosAndWorkspace } from './photoBackup';
import { createDemoWorkspace } from './seed';
import { serializeBackup } from './repository';
const blob = () =>
  new NodeBlob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], {
    type: 'image/png',
  }) as unknown as Blob;
const photo = (id = 'green-1') => ({
  playerId: id,
  blob: blob(),
  updatedAt: '2026-10-26T00:00:00.000Z',
});
afterEach(() => vi.unstubAllGlobals());
it('사진 형식·실제 헤더·8MB 제한을 검증한다', async () => {
  await expect(validatePhotoFile(blob())).resolves.toBeUndefined();
  await expect(
    validatePhotoFile(new NodeBlob(['x'], { type: 'image/jpeg' }) as unknown as Blob),
  ).rejects.toThrow('실제 형식');
  await expect(
    validatePhotoFile(new NodeBlob(['<svg/>'], { type: 'image/svg+xml' }) as unknown as Blob),
  ).rejects.toThrow('JPEG');
  await expect(
    validatePhotoFile(
      new NodeBlob([new Uint8Array(PHOTO_MAX_UPLOAD + 1)], {
        type: 'image/png',
      }) as unknown as Blob,
    ),
  ).rejects.toThrow('8MB');
});
it('사진 교체·삭제를 저장하고 기록 저장 실패 시 이전 사진을 복구한다', async () => {
  const store = new MemoryPhotoRepository(),
    old = photo();
  await store.update([old]);
  await expect(
    saveWithPhoto(store, old.playerId, null, () => {
      throw new Error('quota');
    }),
  ).rejects.toThrow('quota');
  expect(await store.get(old.playerId)).toEqual(old);
  await saveWithPhoto(store, old.playerId, null, () => {});
  expect(await store.get(old.playerId)).toBeNull();
  await saveWithPhoto(store, old.playerId, blob(), () => {});
  expect((await store.all()).map((p) => p.playerId)).toEqual(['green-1']);
});
it('사진 쓰기 실패 시 학생 기록은 저장하지 않는다', async () => {
  const store = new MemoryPhotoRepository();
  vi.spyOn(store, 'update').mockRejectedValue(new Error('disk'));
  const save = vi.fn();
  await expect(saveWithPhoto(store, 'green-1', blob(), save)).rejects.toThrow('disk');
  expect(save).not.toHaveBeenCalled();
});
it('사진 백업은 암호화하고 정상·잘못된 암호·변조를 구분한다', async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Blob', NodeBlob);
  const data = createDemoWorkspace(),
    store = new MemoryPhotoRepository();
  await store.update([photo(), photo('orphan')]);
  const encrypted = await serializePhotoBackup(data, store, 'test-password-123');
  expect(encrypted).not.toContain('green-1');
  expect(encrypted).not.toContain(data.players[0].name);
  const restored = await readPhotoBackup(encrypted, 'test-password-123');
  expect(restored.workspace).toEqual(data);
  expect(restored.photos).toHaveLength(1);
  expect(await restored.photos[0].blob.arrayBuffer()).toEqual(await blob().arrayBuffer());
  await expect(readPhotoBackup(encrypted, 'wrong-password')).rejects.toThrow('암호');
  const tampered = JSON.parse(encrypted);
  tampered.data = (tampered.data[0] === 'A' ? 'B' : 'A') + tampered.data.slice(1);
  await expect(readPhotoBackup(JSON.stringify(tampered), 'test-password-123')).rejects.toThrow(
    '손상',
  );
  expect(serializeBackup(data)).not.toContain('image/png');
  await expect(serializePhotoBackup(data, store, 'short')).rejects.toThrow('10자');
});
it('사진 포함 복원에서 기록 저장 실패 시 기존 사진 전체를 복구한다', async () => {
  const store = new MemoryPhotoRepository(),
    old = photo('green-2');
  await store.update([old]);
  await expect(
    restorePhotosAndWorkspace(store, [photo()], createDemoWorkspace(), () => {
      throw new Error('conflict');
    }),
  ).rejects.toThrow('conflict');
  expect(await store.all()).toEqual([old]);
  const saved = vi.fn();
  await restorePhotosAndWorkspace(store, [photo()], createDemoWorkspace(), saved);
  expect(saved).toHaveBeenCalledOnce();
  expect((await store.all()).map((p) => p.playerId)).toEqual(['green-1']);
});
