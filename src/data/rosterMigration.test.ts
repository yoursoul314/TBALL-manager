import { beforeEach, expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import { migrateWorkspace } from './migration';
import { parseWorkspace } from './schema';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V4_STORAGE_KEY,
  readBackup,
  serializeBackup,
} from './repository';
import { gamePlayers, localDate, validateEntry } from '../domain/roster';
import { replayGame } from '../engine/game';
import { calculateStats } from '../statistics/calculate';
const old = () => ({ ...createDemoWorkspace(), schemaVersion: 4 });
beforeEach(() => localStorage.clear());
it('v4 원본을 보존하고 학년 미설정·추정 날짜·기존 엔트리로 이전한다', () => {
  const source = old(),
    raw = JSON.stringify(source);
  localStorage.setItem(V4_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    data = repo.load()!;
  expect(data.schemaVersion).toBe(10);
  expect(data.players.every((p) => p.grade === null)).toBe(true);
  expect(data.games[0]).toMatchObject({
    createdAt: source.games[0].createdAt,
    playedOn: source.games[0].createdAt.slice(0, 10),
    dateStatus: 'estimated',
  });
  expect(data.games[0].rosters).toEqual(source.games[0].rosters);
  expect(data.games[0].entry?.players.away.filter((p) => p.status === 'reserve')).toHaveLength(2);
  expect(data.assessments).toEqual(source.assessments);
  expect(data.events).toEqual(source.events);
  expect(localStorage.getItem(V4_STORAGE_KEY)).toBe(raw);
  expect(data.migrationSource?.raw).toBe(raw);
  expect(repo.load()).toEqual(data);
  expect(readBackup(serializeBackup(data))).toEqual(data);
});
it('v4 이전 실패와 구버전 탭의 쓰기 충돌에서 양쪽 원본을 보호한다', () => {
  const raw = JSON.stringify(old());
  localStorage.setItem(V4_STORAGE_KEY, raw);
  const failing = new LocalWorkspaceRepository({
    getItem: (k) => localStorage.getItem(k),
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => failing.load()).toThrow('quota');
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(localStorage.getItem(V4_STORAGE_KEY)).toBe(raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    data = repo.load()!,
    before = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(V4_STORAGE_KEY, JSON.stringify({ ...old(), revision: 4 }));
  expect(() => repo.save(data, data.revision)).toThrow('구버전');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
it('학생 팀·학년·이름 변경 후 과거 엔트리와 경기 재생은 변하지 않는다', () => {
  const data = migrateWorkspace(old()),
    game = data.games[0],
    snapshot = structuredClone(game.entry);
  data.players[0] = {
    ...data.players[0],
    teamId: 'orange',
    name: '변경된 가상 별칭',
    grade: 3,
    classroom: '2',
  };
  const saved = parseWorkspace(data);
  expect(saved.games[0].entry).toEqual(snapshot);
  expect(gamePlayers(game, saved)[0].name).toBe(snapshot?.players.away[0].name);
  expect(replayGame(game, []).lineups).toEqual(game.lineups);
});
it('신규 엔트리의 선발10명·후보·결석 구분과 수비 배치 검증', () => {
  const data = migrateWorkspace(old()),
    g = data.games[0];
  g.entry!.source = 'manager';
  g.entry!.approvedBy = '가상 감독';
  g.entry!.players.away[11].status = 'absent';
  g.rosters.away = g.rosters.away.filter((id) => id !== 'green-12');
  g.entry!.defense.home = { '1B': 'orange-1', SS: 'orange-2' };
  expect(() => validateEntry(g)).not.toThrow();
  expect(replayGame(g, []).defense.home).toEqual(g.entry!.defense.home);
  expect(calculateStats(g, [], data.policy).rows).toEqual([]);
  const duplicate = structuredClone(g);
  duplicate.entry!.defense.home.SS = 'orange-1';
  expect(() => validateEntry(duplicate)).toThrow('중복');
  const absent = structuredClone(g);
  absent.rosters.away.push('green-12');
  expect(() => validateEntry(absent)).toThrow('상태');
  const short = structuredClone(g);
  short.lineups.away.pop();
  expect(() => validateEntry(short)).toThrow('타순');
});
it('날짜 전용 값과 생성 시각을 분리하고 날짜 오류를 거절한다', () => {
  expect(localDate(new Date(2026, 9, 26, 0, 5))).toBe('2026-10-26');
  const data = migrateWorkspace(old()),
    created = data.games[0].createdAt;
  data.games[0].playedOn = '2026-11-03';
  data.games[0].dateStatus = 'confirmed';
  expect(parseWorkspace(data).games[0].createdAt).toBe(created);
  data.games[0].playedOn = '2026-02-30';
  expect(() => parseWorkspace(data)).toThrow();
});
it('3팀 중 두 팀 경기의 타 팀 중복 엔트리와 없는 ID를 차단한다', () => {
  const data = migrateWorkspace(old());
  data.teams.push({ id: 'third', name: '가상 C팀', color: '#234567' });
  expect(parseWorkspace(data).teams).toHaveLength(3);
  data.games[0].entry!.players.home.push({
    ...data.games[0].entry!.players.away[0],
    teamId: 'orange',
  });
  expect(() => parseWorkspace(data)).toThrow('중복');
});
