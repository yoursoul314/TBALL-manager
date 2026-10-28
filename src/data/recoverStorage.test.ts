import { expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V10_STORAGE_KEY,
  V11_STORAGE_KEY,
  serializeBackup,
  readBackup,
} from './repository';
import { MemoryRecoveryArchiveStore } from './recoveryArchive';
import { decodeStorageText } from './storageCodec';
import { resetWorkspace } from '../domain/reset';
import { blankAttempt, createBattingSession, recordBattingAttempt } from '../assessment/batting';
function setup(current = false) {
  const meta = { id: 's', at: '2026-10-28T00:00:00Z', actor: 'QA', reason: '가상 측정' };
  let data = createBattingSession(
    createDemoWorkspace(),
    {
      playerId: 'green-1',
      date: '2026-10-27',
      targetAttempts: 10,
      assessor: 'QA',
      purpose: '복구 검증',
      note: '',
    },
    meta,
  );
  data = recordBattingAttempt(
    data,
    's',
    1,
    { ...blankAttempt(), result: 'fair', score: 8 },
    { ...meta, id: 'a' },
  );
  const old = JSON.stringify({ ...data, schemaVersion: 10 });
  const latest = JSON.stringify({
    ...data,
    schemaVersion: 11,
    migrationSource: { schemaVersion: 10, raw: old },
    _v10Baseline: old,
  });
  const rows = new Map<string, string>([
    [V10_STORAGE_KEY, old],
    [V11_STORAGE_KEY, latest],
    ['another-app-records', '외부 앱 데이터'],
  ]);
  let capacity = Infinity,
    failWrite = false,
    failRemove = false;
  const storage = {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrite && key === STORAGE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      const used =
        [...rows].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0) + value.length;
      if (used > capacity) throw new DOMException('quota', 'QuotaExceededError');
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      if (failRemove && key === V11_STORAGE_KEY) throw Error('interrupted');
      rows.delete(key);
    },
  };
  const archives = new MemoryRecoveryArchiveStore();
  const repo = new LocalWorkspaceRepository(storage, archives);
  if (current) repo.load();
  capacity = [...rows.values()].reduce((n, v) => n + v.length, 0);
  return {
    data,
    rows,
    storage,
    archives,
    repo,
    failWrite: (v: boolean) => {
      failWrite = v;
    },
    failRemove: (v: boolean) => {
      failRemove = v;
    },
    capacity: (n: number) => {
      capacity = n;
    },
  };
}
it('여유 공간0에서도 원본 보관·검증 후 복구하고 원문/기존 평가/이력/다른 앱을 보존', async () => {
  const f = setup(),
    original = Object.fromEntries(f.rows);
  expect(() => f.repo.load()).toThrow('quota');
  const next = await f.repo.recoverStorage();
  expect(next.battingAttempts).toEqual(f.data.battingAttempts);
  expect(next.battingAudit).toEqual(f.data.battingAudit);
  expect(next.assessments).toEqual(f.data.assessments);
  expect(next.events).toEqual(f.data.events);
  expect(next.revision).toBe(f.data.revision + 1);
  const [archive] = await f.archives.all();
  expect(archive.originals[V10_STORAGE_KEY]).toBe(original[V10_STORAGE_KEY]);
  expect(archive.originals[V11_STORAGE_KEY]).toBe(original[V11_STORAGE_KEY]);
  expect(f.rows.get('another-app-records')).toBe(original['another-app-records']);
  expect(f.repo.load()).toEqual(next);
  expect(readBackup(serializeBackup(next))).toEqual(next);
  const saved = f.repo.save(next, next.revision);
  expect(f.repo.load()).toEqual(saved);
  expect(f.repo.hasStorageArchive()).toBe(true);
  expect(JSON.parse(await f.repo.exportRecoveryWithArchives()).archives[0]).toEqual(archive);
  expect(() => f.repo.save(next, next.revision)).toThrow('다른 탭');
});
it('원본 보관소 쓰기 실패면 localStorage를 한 글자도 변경하지 않는다', async () => {
  const f = setup(),
    original = [...f.rows];
  f.archives.put = async () => {
    throw Error('archive quota');
  };
  await expect(f.repo.recoverStorage()).rejects.toThrow('archive quota');
  expect([...f.rows]).toEqual(original);
});
it('보관 후 재읽기 불일치면 정리하지 않는다', async () => {
  const f = setup(),
    original = [...f.rows];
  f.archives.get = async () => null;
  await expect(f.repo.recoverStorage()).rejects.toThrow('재확인');
  expect([...f.rows]).toEqual(original);
});
it('원본 보관 도중 다른 탭이 쓰면 최신 변경을 보존하고 중단', async () => {
  const f = setup(),
    put = f.archives.put.bind(f.archives),
    old = f.rows.get(V11_STORAGE_KEY)!;
  f.archives.put = async (row) => {
    await put(row);
    f.rows.set(V11_STORAGE_KEY, old + ' ');
  };
  await expect(f.repo.recoverStorage()).rejects.toThrow('다른 탭');
  expect(f.rows.get(V11_STORAGE_KEY)).toBe(old + ' ');
  expect(f.rows.has(V10_STORAGE_KEY)).toBe(true);
});
it('현재 키 저장 실패로 중단되어도 새로고침은 빈 샘플을 만들지 않고 원본 확인·재개 가능', async () => {
  const f = setup();
  f.failWrite(true);
  await expect(f.repo.recoverStorage()).rejects.toThrow('quota');
  const again = new LocalWorkspaceRepository(f.storage, f.archives);
  expect(() => again.load()).toThrow('복구가 중단');
  expect((await again.inspectStoredWorkspace())?.battingAttempts).toEqual(f.data.battingAttempts);
  f.failWrite(false);
  const restored = await again.recoverStorage();
  expect(again.load()).toEqual(restored);
  expect(await f.archives.all()).toHaveLength(1);
});
it('새 저장본 생성 후 마지막 표식 제거 실패도 원본·새 기록을 유지하며 재개', async () => {
  const f = setup();
  f.failRemove(true);
  await expect(f.repo.recoverStorage()).rejects.toThrow('interrupted');
  expect(f.rows.has(STORAGE_KEY)).toBe(true);
  expect(() => f.repo.load()).toThrow('복구가 중단');
  f.failRemove(false);
  const restored = await f.repo.recoverStorage();
  expect(f.repo.load()).toEqual(restored);
});
it('중단 후 다른 탭의 새 기록이 생기면 이전 보관본으로 덮지 않는다', async () => {
  const f = setup();
  f.failWrite(true);
  await expect(f.repo.recoverStorage()).rejects.toThrow();
  f.rows.set(V10_STORAGE_KEY, 'new other-tab text');
  f.failWrite(false);
  await expect(f.repo.recoverStorage()).rejects.toThrow('다른 탭');
  expect(f.rows.get(V10_STORAGE_KEY)).toBe('new other-tab text');
});
it('최신 v12가 있는 기기도 원본을 보관하고 압축 저장을 유지', async () => {
  const f = setup(true),
    original = f.rows.get(STORAGE_KEY)!;
  const restored = await f.repo.recoverStorage();
  expect(f.repo.load()).toEqual(restored);
  expect((await f.archives.all())[0].originals[STORAGE_KEY]).toBe(original);
});
it('보관본이 없는 중단 표식은 데이터 생성으로 대체하지 않는다', async () => {
  const f = setup();
  f.rows.set(
    STORAGE_KEY,
    JSON.stringify({ format: 'tb-manager-storage-move-v1', archiveId: 'missing' }),
  );
  expect(() => f.repo.load()).toThrow('복구가 중단');
  await expect(f.repo.recoverStorage()).rejects.toThrow('찾을 수');
});
it('명시적인 전체 초기화는 보관 원본도 지우고 실패 시 정리 표식을 유지', async () => {
  const f = setup();
  const restored = await f.repo.recoverStorage();
  f.repo.resetAll(resetWorkspace(restored, 'all', '2026-10-28T01:00:00Z'), restored.revision);
  expect(f.repo.hasPendingArchiveCleanup()).toBe(true);
  const clear = f.archives.clear.bind(f.archives);
  f.archives.clear = async () => {
    throw Error('archive delete');
  };
  await expect(f.repo.finishArchiveCleanup()).rejects.toThrow('archive delete');
  expect(f.repo.hasPendingArchiveCleanup()).toBe(true);
  f.archives.clear = clear;
  await f.repo.finishArchiveCleanup();
  expect(await f.archives.all()).toHaveLength(0);
  expect(f.repo.hasStorageArchive()).toBe(false);
  expect(f.repo.load()!.players).toHaveLength(0);
  expect(
    JSON.parse(decodeStorageText(f.rows.get(STORAGE_KEY)!))._archiveCleanupPending,
  ).toBeUndefined();
});

it('전체 초기화는 표식 쓰기 전 중단된 미연결 원본 보관본도 정리', async () => {
  const f = setup(),
    put = f.archives.put.bind(f.archives);
  f.archives.put = async (row) => {
    await put(row);
    throw Error('interrupted before marker');
  };
  await expect(f.repo.recoverStorage()).rejects.toThrow('interrupted before marker');
  expect(f.repo.hasStorageArchive()).toBe(false);
  expect(await f.archives.all()).toHaveLength(1);
  f.capacity(Infinity);
  const current = f.repo.load()!;
  f.repo.resetAll(resetWorkspace(current, 'all', '2026-10-28T01:00:00Z'), current.revision);
  await f.repo.finishArchiveCleanup();
  expect(await f.archives.all()).toHaveLength(0);
});
