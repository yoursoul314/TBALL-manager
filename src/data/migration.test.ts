import { beforeEach, expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import { migrateWorkspace } from './migration';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  LocalWorkspaceRepository,
  readBackup,
  serializeBackup,
} from './repository';
function oldData() {
  const { legacyTeamwork: _, legacySource: __, ...demo } = createDemoWorkspace();
  return {
    ...demo,
    schemaVersion: 1,
    teamwork: [
      {
        id: 'old-responsibility',
        playerId: demo.players[0].id,
        gameId: null,
        recordedAt: demo.games[0].createdAt,
        category: 'responsibility',
        score: 4,
        note: '가상 이전 기록',
        observer: '테스트',
      },
      {
        id: 'old-respect',
        playerId: demo.players[0].id,
        gameId: null,
        recordedAt: demo.games[0].createdAt,
        category: 'respect',
        score: 5,
        note: '가상 이전 기록',
        observer: '테스트',
      },
    ],
    events: [
      {
        schemaVersion: 1,
        id: 'old-event',
        gameId: demo.games[0].id,
        sequence: 1,
        deviceId: 'test',
        recordedAt: demo.games[0].createdAt,
        payload: { type: 'PITCH', call: 'foul' },
      },
    ],
    futureExtension: { preserved: true },
  };
}
beforeEach(() => localStorage.clear());
it('v1 원문·이벤트·책임감·존중을 보존하고 v2 이전은 반복해도 동일하다', () => {
  const old = oldData(),
    raw = JSON.stringify(old, null, 2);
  localStorage.setItem(LEGACY_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage);
  const next = repo.load()!;
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  expect(next.legacySource?.raw).toBe(raw);
  expect(next.events).toEqual(old.events);
  expect(next.legacyTeamwork).toEqual(old.teamwork);
  expect(next.teamwork).toEqual([]);
  expect(next.schemaVersion).toBe(9);
  expect(migrateWorkspace(next)).toEqual(next);
  expect(repo.load()).toEqual(next);
  expect(readBackup(serializeBackup(next))).toEqual(next);
});
it('v1 백업을 읽고 v2 백업으로 보존한다; 새 분류를 추정하지 않는다', () => {
  const old = oldData();
  const next = readBackup(
    JSON.stringify({ format: 'tb-manager-backup', version: 1, workspace: old }),
  );
  expect(next.legacyTeamwork).toEqual(old.teamwork);
  expect(next.events).toEqual(old.events);
  expect(readBackup(serializeBackup(next))).toEqual(next);
});
it('누락된 거리·강도는 없는 값 그대로 보존한다', () => {
  const old = oldData();
  old.events = [
    { ...old.events[0], payload: { type: 'START_PLAY' } },
    {
      ...old.events[0],
      id: 'end',
      sequence: 2,
      payload: {
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'left',
        quality: 'ground',
        fielding: [],
        outcomes: [{ playerId: old.players[0].id, to: 1, action: 'advance' }],
      },
    },
  ] as typeof old.events;
  const next = migrateWorkspace(old);
  expect(next.events).toEqual(old.events);
  expect(next.events[1].payload).not.toHaveProperty('distance');
  expect(next.events[1].payload).not.toHaveProperty('strength');
});
it('미지원·손상·규칙 충돌 데이터는 v2를 쓰지 않고 v1 원문을 유지한다', () => {
  const old = oldData();
  old.events[0].sequence = 3;
  const raw = JSON.stringify(old);
  localStorage.setItem(LEGACY_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage);
  expect(() => repo.load()).toThrow('이전 중단');
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
  expect(() => migrateWorkspace({ schemaVersion: 99 })).toThrow('지원하지 않는');
  expect(() =>
    readBackup(
      JSON.stringify({ format: 'tb-manager-backup', version: 1, workspace: createDemoWorkspace() }),
    ),
  ).toThrow();
});
it('이전 중 저장 공간 부족에도 원문 유지, 성공으로 알리지 않음', () => {
  const raw = JSON.stringify(oldData());
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => (k === LEGACY_STORAGE_KEY ? raw : null),
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => repo.load()).toThrow('quota');
  expect(JSON.parse(repo.recoverySnapshot()).v1).toBe(raw);
});
it('구버전 탭에서 수정한 v1을 조용히 무시하거나 덮어쓰지 않는다', () => {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(oldData()));
  const repo = new LocalWorkspaceRepository(localStorage);
  const data = repo.load()!;
  const v2 = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...oldData(), revision: 99 }));
  expect(() => repo.save(data, data.revision)).toThrow('구버전 탭');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(v2);
});
