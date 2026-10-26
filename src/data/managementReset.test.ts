import { beforeEach, expect, it, vi } from 'vitest';
import { createDemoWorkspace } from './seed';
import { setPlayerArchived, activePlayers } from '../domain/gameLibrary';
import { resetWorkspace } from '../domain/reset';
import { parseWorkspace } from './schema';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V6_STORAGE_KEY,
  serializeBackup,
  readBackup,
} from './repository';
import { replayGame } from '../engine/game';
import { MemoryPhotoRepository } from './photos';
import { restorePhotosAndWorkspace } from './photoBackup';
const at = '2026-10-26T05:00:00.000Z';
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('v6 기록/팀 삭제 상태를 보존하고 v7 백업으로 왕복한다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 6 };
  old.teams[0].archivedAt = at;
  const raw = JSON.stringify(old);
  localStorage.setItem(V6_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    data = repo.load()!;
  expect(data.schemaVersion).toBe(7);
  expect(data.players).toEqual(old.players);
  expect(data.teams).toEqual(old.teams);
  expect(localStorage.getItem(V6_STORAGE_KEY)).toBe(raw);
  expect(readBackup(serializeBackup(data))).toEqual(data);
  localStorage.setItem(V6_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(data, data.revision)).toThrow('구버전');
});
it('선수 삭제/복원은 과거 경기/평가/이벤트/출전 상태를 변경하지 않는다', () => {
  const data = createDemoWorkspace(),
    p = data.players[0],
    game = data.games[0];
  const next = setPlayerArchived(data, p.id, true, at);
  expect(activePlayers(next)).toHaveLength(23);
  expect(next.games).toBe(data.games);
  expect(next.events).toBe(data.events);
  expect(next.assessments).toBe(data.assessments);
  expect(next.players[0].active).toBe(p.active);
  expect(replayGame(game, next.events)).toEqual(replayGame(game, data.events));
  expect(readBackup(serializeBackup(next))).toEqual(next);
  expect(setPlayerArchived(next, p.id, false, at).players[0].archiveHistory).toHaveLength(2);
});
it('라이브 경기의 선수 삭제와 기록 초기화를 거절한다', () => {
  const data = createDemoWorkspace();
  data.events.push({
    id: 'live',
    gameId: data.games[0].id,
    schemaVersion: 3,
    sequence: 1,
    recordedAt: at,
    deviceId: 'qa',
    payload: { type: 'START_PLAY' },
  });
  expect(() => setPlayerArchived(data, data.players[0].id, true, at)).toThrow('플레이');
  expect(() => resetWorkspace(data, 'all', at)).toThrow('플레이');
});
it('경기/평가/전체 기록 초기화 범위가 분리되고 빈 경기 백업이 유효하다', () => {
  const data = createDemoWorkspace();
  data.teamwork.push({
    id: 'outside',
    playerId: data.players[0].id,
    gameId: null,
    recordedAt: at,
    category: 'communication',
    opportunity: 'offered',
    outcome: 'performed',
    note: 'QA',
    observer: 'QA',
  });
  const game = resetWorkspace(data, 'games', at);
  expect(game.games).toEqual([]);
  expect(game.assessments).toEqual(data.assessments);
  expect(game.teamwork).toHaveLength(1);
  expect(parseWorkspace(game)).toEqual(game);
  const evaluation = resetWorkspace(data, 'evaluations', at);
  expect(evaluation.games).toEqual(data.games);
  expect(evaluation.assessments).toEqual([]);
  expect(evaluation.teamwork).toEqual([]);
  data.migrationSource = { schemaVersion: 6, raw: JSON.stringify({ ...data, schemaVersion: 6 }) };
  const records = resetWorkspace(data, 'records', at);
  expect(records.migrationSource).toEqual(data.migrationSource);
  expect(resetWorkspace(data, 'all', at).migrationSource).toBeUndefined();
  expect(records.players).toBe(data.players);
  expect(records.teams).toBe(data.teams);
  expect(readBackup(serializeBackup(records))).toEqual(records);
});
it('전체 초기화는 구버전 키까지 비우고 새로고침해도 예시 자료가 생기지 않는다', () => {
  localStorage.setItem(
    V6_STORAGE_KEY,
    JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 6 }),
  );
  const repo = new LocalWorkspaceRepository(localStorage),
    data = repo.load()!;
  const next = repo.resetAll(resetWorkspace(data, 'all', at), data.revision);
  expect(localStorage.getItem(V6_STORAGE_KEY)).toBeNull();
  expect(next.players).toEqual([]);
  expect(next.teams).toEqual([]);
  expect(repo.load()).toEqual(next);
  expect(readBackup(serializeBackup(next))).toEqual(next);
});
it('전체 초기화 중 키 삭제 실패 시 현재/이전 원본을 복구한다', () => {
  const old = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 6 });
  localStorage.setItem(V6_STORAGE_KEY, old);
  const repo = new LocalWorkspaceRepository(localStorage),
    data = repo.load()!,
    before = localStorage.getItem(STORAGE_KEY);
  const remove = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, 'removeItem')
    .mockImplementationOnce(() => {
      throw Error('delete failed');
    })
    .mockImplementation(remove);
  expect(() => repo.resetAll(resetWorkspace(data, 'all', at), data.revision)).toThrow(
    'delete failed',
  );
  expect(localStorage.getItem(V6_STORAGE_KEY)).toBe(old);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
it('기록 저장 실패 시 전체 초기화가 지운 사진을 되돌린다', async () => {
  const store = new MemoryPhotoRepository(),
    blob = new Blob(['QA']);
  await store.update([{ playerId: 'green-1', blob, updatedAt: at }]);
  await expect(
    restorePhotosAndWorkspace(store, [], resetWorkspace(createDemoWorkspace(), 'all', at), () => {
      throw Error('quota');
    }),
  ).rejects.toThrow('quota');
  expect((await store.all())[0].blob).toBe(blob);
});
