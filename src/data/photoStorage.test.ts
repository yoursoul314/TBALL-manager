import { afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { encodePhoto, decodePhoto } from './photoStorage';
afterEach(() => vi.unstubAllGlobals());
const record = () => ({
  playerId: 'test-photo-only',
  updatedAt: '2026-10-26T00:00:00.000Z',
  blob: new NodeBlob([new Uint8Array([1, 2, 3, 255])], { type: 'image/jpeg' }) as unknown as Blob,
});
it('기존 Blob 사진은 변경 없이 읽어 학생 ID·생성 시각·이미지를 보존한다', () => {
  const legacy = record();
  expect(decodePhoto(legacy)).toBe(legacy);
});
it('사진을 ArrayBuffer로 보관하고 기존 백업 인터페이스의 Blob으로 무손실 복원한다', async () => {
  vi.stubGlobal('Blob', NodeBlob);
  const original = record(),
    stored = await encodePhoto(original);
  expect(stored).not.toHaveProperty('blob');
  expect(stored.formatVersion).toBe(2);
  const restored = decodePhoto(structuredClone(stored));
  expect(restored.playerId).toBe(original.playerId);
  expect(restored.updatedAt).toBe(original.updatedAt);
  expect(restored.blob.type).toBe(original.blob.type);
  expect(await restored.blob.arrayBuffer()).toEqual(await original.blob.arrayBuffer());
});
it('사진 바이트 변환 실패를 전달해 쓰기 트랜잭션 전에 중단한다', async () => {
  const original = record();
  vi.spyOn(original.blob, 'arrayBuffer').mockRejectedValue(new Error('photo read failure'));
  await expect(encodePhoto(original)).rejects.toThrow('photo read failure');
});
