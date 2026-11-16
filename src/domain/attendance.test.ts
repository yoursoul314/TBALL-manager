import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  addClassGroup,
  markAttendance,
  entryCoverage,
  fillAttendanceEntries,
  attendanceRows,
  groupKey,
  unlistedClassStudents,
} from './attendance';
import type { MatchEntryDrafts } from './randomEntry';
import { migrateWorkspace } from '../data/migration';
import {
  readBackup,
  serializeBackup,
  LocalWorkspaceRepository,
  STORAGE_KEY,
} from '../data/repository';
import { resetWorkspace } from './reset';
const date = '2026-11-16',
  group = { grade: '2', classroom: '1' };
const empty = (): MatchEntryDrafts => ({
  away: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
  home: { loaded: false, assigned: [], status: {}, lineup: [], defense: {} },
});
it('v15 저장 이전 중 용량 오류가 나도 원문은 유지하고 읽기 전용 복구 가능', () => {
  const { classDays: _, ...base } = createDemoWorkspace(),
    raw = JSON.stringify({ ...base, schemaVersion: 15 });
  const storage = {
    getItem: (key: string) => (key === STORAGE_KEY ? raw : null),
    setItem: () => {
      throw Error('QuotaExceeded');
    },
  };
  const repo = new LocalWorkspaceRepository(storage);
  expect(() => repo.load()).toThrow('QuotaExceeded');
  expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  expect(repo.load(false)).toMatchObject({
    schemaVersion: 16,
    classDays: [],
    players: base.players,
    events: base.events,
    assessments: base.assessments,
  });
});
export function classData() {
  const d = createDemoWorkspace();
  d.players = d.players.map((p) => ({ ...p, grade: 2, classroom: '1' }));
  return d;
}
it('날짜별 학급 전체 명단은 미확인으로 생성하고 이전 출석을 복사하지 않는다', () => {
  const d = classData(),
    before = JSON.stringify(d),
    first = addClassGroup(d, date, group);
  expect(first.students).toHaveLength(24);
  expect(first.students.every((s) => s.status === 'unmarked')).toBe(true);
  d.classDays = [
    markAttendance(
      first,
      first.students.map((s) => s.playerId),
      'present',
    ),
  ];
  const tomorrow = addClassGroup(d, '2026-11-17', group);
  expect(tomorrow.id).not.toBe(first.id);
  expect(tomorrow.students.every((s) => s.status === 'unmarked')).toBe(true);
  expect(JSON.stringify({ ...d, classDays: [] })).toBe(before);
});
it('학급 명단 갱신은 기존 출석·이력을 보존하고 새 학생만 미확인으로 추가', () => {
  const d = classData();
  let day = addClassGroup(d, date, group);
  day = markAttendance(day, ['green-1'], 'absent');
  d.classDays = [day];
  d.players.push({ ...d.players[0], id: 'new', name: '가상 새 학생' });
  expect(unlistedClassStudents(d, day, [groupKey(group)]).map((p) => p.id)).toEqual(['new']);
  const next = addClassGroup(d, date, group);
  expect(unlistedClassStudents(d, next, [groupKey(group)])).toEqual([]);
  expect(next.students.find((s) => s.playerId === 'green-1')?.status).toBe('absent');
  expect(next.history).toEqual(day.history);
  expect(next.students.at(-1)?.status).toBe('unmarked');
  expect(addClassGroup({ ...d, classDays: [next] }, date, group).students).toHaveLength(25);
});
it('출석·지각 22명 전원은 선발 20명·후보 2명, 결석·제한은 제외하고 중복 없음', () => {
  const d = classData();
  let day = addClassGroup(d, date, group);
  day = markAttendance(
    day,
    day.students.map((s) => s.playerId),
    'present',
  );
  day = markAttendance(day, ['green-1'], 'absent');
  day = markAttendance(day, ['green-2'], 'restricted');
  day = markAttendance(day, ['green-3'], 'late');
  const entries = fillAttendanceEntries(d, day.students, empty()),
    coverage = entryCoverage(d, day.students, entries);
  expect(coverage.missing).toEqual([]);
  expect(coverage.conflicts).toEqual([]);
  expect(coverage.eligible).toHaveLength(22);
  expect(entries.away.lineup).toHaveLength(10);
  expect(entries.home.lineup).toHaveLength(10);
  const ids = [...entries.away.assigned, ...entries.home.assigned];
  expect(new Set(ids).size).toBe(22);
  expect(ids).not.toContain('green-1');
  expect(fillAttendanceEntries(d, day.students, entries)).toEqual(entries);
});
it('未확인 출석은 자동 편성할 수 없고 기존 타순·수비는 유지, 결석 전환은 제거', () => {
  const d = classData();
  const day = addClassGroup(d, date, group);
  expect(() => fillAttendanceEntries(d, day.students, empty())).toThrow('미확인');
  const checked = markAttendance(
    day,
    day.students.map((s) => s.playerId),
    'present',
  );
  const entries = fillAttendanceEntries(d, checked.students, empty());
  const id = entries.away.lineup[0];
  entries.away.defense = { '1B': id };
  expect(fillAttendanceEntries(d, checked.students, entries)).toEqual(entries);
  const absent = markAttendance(checked, [id], 'absent');
  expect(entryCoverage(d, absent.students, entries).conflicts).toHaveLength(1);
  const next = fillAttendanceEntries(d, absent.students, entries);
  expect(next.away.lineup).not.toContain(id);
  expect(next.away.lineup).toHaveLength(10);
  expect(next.away.defense).toEqual({});
  expect(next.away.status[id]).toBe('absent');
});
it('선택한 학년·반만 누락 판정하고 다른 수업은 혼합하지 않는다', () => {
  const d = classData();
  d.players[0].classroom = '2';
  let day = addClassGroup(d, date, group);
  d.classDays = [day];
  day = addClassGroup(d, date, { grade: '2', classroom: '2' });
  const rows = attendanceRows(day, [groupKey(group)]);
  expect(rows).toHaveLength(23);
  expect(rows.some((s) => s.playerId === 'green-1')).toBe(false);
});
it('v15 원본·이벤트·평가·학생 ID 보존, 출석 백업 복원 및 기록 초기화 범위', () => {
  const d = classData();
  const { classDays: _, ...old } = d;
  const input = { ...old, schemaVersion: 15 };
  const original = JSON.stringify(input),
    migrated = migrateWorkspace(input);
  expect(migrated).toEqual({ ...input, schemaVersion: 16, classDays: [] });
  expect(JSON.stringify(input)).toBe(original);
  const day = markAttendance(addClassGroup(migrated, date, group), ['green-1'], 'late');
  migrated.classDays = [day];
  const restored = readBackup(serializeBackup(migrated));
  expect(restored.classDays).toEqual([day]);
  expect(restored.players[0].id).toBe('green-1');
  expect(resetWorkspace(restored, 'games', day.updatedAt).classDays).toEqual([day]);
  expect(resetWorkspace(restored, 'records', day.updatedAt).classDays).toEqual([]);
  expect(() => migrateWorkspace({ ...restored, classDays: [day, day] })).toThrow();
});
