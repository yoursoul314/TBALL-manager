import { beforeEach, it, expect } from 'vitest';
import { createDemoWorkspace } from './seed';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  readBackup,
  serializeBackup,
  csvCell,
} from './repository';
import { parseWorkspace } from './schema';
beforeEach(() => localStorage.clear());
it('저장·로드·JSON 복원은 이벤트와 정책을 보존한다', () => {
  const repo = new LocalWorkspaceRepository(localStorage);
  const data = repo.save(createDemoWorkspace(), 0);
  expect(data.revision).toBe(1);
  expect(repo.load()).toEqual(data);
  expect(readBackup(serializeBackup(data))).toEqual(data);
});
it('동일 리비전의 오래된 작성자는 덮어쓸 수 없다', () => {
  const repo = new LocalWorkspaceRepository(localStorage);
  const data = createDemoWorkspace();
  repo.save(data, 0);
  expect(() => repo.save(data, 0)).toThrow('다른 탭');
});
it('손상된 데이터는 샘플 데이터로 덮어쓰지 않는다', () => {
  localStorage.setItem(STORAGE_KEY, 'corrupt');
  expect(() => new LocalWorkspaceRepository(localStorage).load()).toThrow();
  expect(localStorage.getItem(STORAGE_KEY)).toBe('corrupt');
});
it('지원하지 않는 버전·선수 참조·고정 주루 비율 변경을 차단', () => {
  const data = createDemoWorkspace();
  expect(() => parseWorkspace({ ...data, schemaVersion: 99 })).toThrow();
  data.games[0].rosters.away.push('missing');
  expect(() => parseWorkspace(data)).toThrow();
  const second = createDemoWorkspace();
  second.policy.runningMix = { skill: 50, game: 50 } as never;
  expect(() => parseWorkspace(second)).toThrow();
});
it('백업 형식과 잘못된 이벤트를 검증한 후 복원한다', () => {
  expect(() => readBackup('{}')).toThrow('백업 형식');
  const data = createDemoWorkspace();
  data.events.push({
    schemaVersion: 1,
    id: 'bad',
    gameId: data.games[0].id,
    sequence: 2,
    deviceId: 'd',
    recordedAt: new Date().toISOString(),
    payload: { type: 'PITCH', call: 'strike' },
  });
  expect(() => serializeBackup(data)).toThrow('순서');
});
it('저장 공간 부족 시 성공을 반환하지 않는다', () => {
  const repo = new LocalWorkspaceRepository({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => repo.save(createDemoWorkspace(), 0)).toThrow('quota');
});
it('CSV 수식 주입과 따옴표를 이스케이프한다', () => {
  expect(csvCell('=SUM(A1)')).toBe(JSON.stringify("'=SUM(A1)"));
  expect(csvCell('a"b')).toBe('"a""b"');
});
