import { expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import { migrateWorkspace } from './migration';
import { LocalWorkspaceRepository, readBackup, serializeBackup, STORAGE_KEY } from './repository';
import { captureLegacyEntry } from '../domain/roster';
import { parseWorkspace } from './schema';

it('v14 원본 전체를 유지하고 주장·가상 관측 없이 v15로 읽는다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 14 };
  const before = structuredClone(old),
    next = migrateWorkspace(old);
  expect(next).toEqual({ ...old, schemaVersion: 16 });
  expect(next.games[0].entry?.captains).toBeUndefined();
  expect(next.migrationSource).toBeUndefined();
  expect(old).toEqual(before);
  expect(migrateWorkspace(next)).toEqual(next);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 14, workspace: old })),
  ).toEqual(next);
});
it('주장 저장·새로고침·JSON 복원과 잘못된 팀 주장 차단', () => {
  const d = createDemoWorkspace(),
    g = d.games[0];
  g.entry = captureLegacyEntry(g, d);
  g.entry!.captains = { away: 'green-1', home: 'orange-1' };
  const rows = new Map<string, string>();
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => rows.get(k) ?? null,
    setItem: (k, v) => {
      rows.set(k, v);
    },
  });
  const saved = repo.save(d, 0);
  expect(repo.load()).toEqual(saved);
  expect(readBackup(serializeBackup(saved))).toEqual(saved);
  g.entry!.captains.away = 'orange-1';
  expect(() => parseWorkspace(d)).toThrow('주장');
});
it('v14 자동 이전 저장 실패에도 기존 키의 원문과 기록을 보존한다', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 14 });
  const storage = {
    getItem: (key: string) => (key === STORAGE_KEY ? raw : null),
    setItem: () => {
      throw new Error('quota');
    },
  };
  const repo = new LocalWorkspaceRepository(storage);
  expect(() => repo.load()).toThrow('quota');
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  expect(repo.load(false)?.games).toEqual(JSON.parse(raw).games);
});
