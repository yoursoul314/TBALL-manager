import { beforeEach, expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import {
  LocalWorkspaceRepository,
  V5_STORAGE_KEY,
  STORAGE_KEY,
  readBackup,
  serializeBackup,
} from './repository';
import { activeGames, setGameArchived, activeTeams, setTeamArchived } from '../domain/gameLibrary';
import { replayGame } from '../engine/game';
const at = '2026-10-26T00:00:00.000Z';
beforeEach(() => localStorage.clear());
it('v5 원본과 선수·평가·경기·이벤트를 보존하고 v6로 이전한다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 5 },
    raw = JSON.stringify(old);
  localStorage.setItem(V5_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    next = repo.load()!;
  expect(next.schemaVersion).toBe(6);
  expect(localStorage.getItem(V5_STORAGE_KEY)).toBe(raw);
  for (const key of ['players', 'assessments', 'events', 'games'] as const)
    expect(next[key]).toEqual(old[key]);
  expect(repo.load()).toEqual(next);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 5, workspace: old })),
  ).toEqual(next);
});
it('이전 실패와 구버전 탭 변경 시 원본을 덮어쓰지 않는다', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 5 });
  localStorage.setItem(V5_STORAGE_KEY, raw);
  expect(() =>
    new LocalWorkspaceRepository({
      getItem: (k) => localStorage.getItem(k),
      setItem: () => {
        throw Error('quota');
      },
    }).load(),
  ).toThrow('quota');
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(V5_STORAGE_KEY)).toBe(raw);
  const repo = new LocalWorkspaceRepository(localStorage);
  repo.load();
  const before = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(V5_STORAGE_KEY, raw + ' ');
  expect(() => repo.load()).toThrow('구버전');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
it('삭제·복원은 원본과 재생 결과를 유지하고 마지막 경기를 삭제해도 복구된다', () => {
  const data = createDemoWorkspace(),
    game = data.games[0],
    before = replayGame(game, data.events);
  const removed = setGameArchived(data, game.id, true, at);
  expect(activeGames(removed)).toEqual([]);
  expect(removed.events).toBe(data.events);
  expect(removed.players).toBe(data.players);
  expect(removed.assessments).toBe(data.assessments);
  expect(readBackup(serializeBackup(removed))).toEqual(removed);
  const restored = setGameArchived(removed, game.id, false, at);
  expect(activeGames(restored)).toHaveLength(1);
  expect(restored.games[0].archiveHistory).toHaveLength(2);
  expect(replayGame(restored.games[0], restored.events)).toEqual(before);
});
it('진행 중인 플레이는 삭제할 수 없다', () => {
  const data = createDemoWorkspace();
  data.events.push({
    id: 'live',
    schemaVersion: 3,
    gameId: data.games[0].id,
    sequence: 1,
    deviceId: 'test',
    recordedAt: at,
    payload: { type: 'START_PLAY' },
  });
  expect(() => setGameArchived(data, data.games[0].id, true, at)).toThrow('플레이');
  expect(data.games[0].archivedAt).toBeUndefined();
});

it('팀 삭제·복원이 소속 선수와 과거 경기·이벤트·평가를 그대로 보존한다', () => {
  const data = createDemoWorkspace(),
    next = setTeamArchived(data, 'green', true, at);
  expect(activeTeams(next).map((t) => t.id)).toEqual(['orange']);
  expect(next.players).toBe(data.players);
  expect(next.games).toBe(data.games);
  expect(next.events).toBe(data.events);
  expect(next.assessments).toBe(data.assessments);
  expect(readBackup(serializeBackup(next))).toEqual(next);
  const restored = setTeamArchived(next, 'green', false, at);
  expect(activeTeams(restored)).toHaveLength(2);
  expect(restored.teams[0].archiveHistory).toHaveLength(2);
});
