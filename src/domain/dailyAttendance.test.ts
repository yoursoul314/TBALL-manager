import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  addClassGroup,
  prepareDailyAttendance,
  markAttendance,
  sortAttendanceStudents,
  attendanceRows,
  groupKey,
} from './attendance';
import { readBackup, serializeBackup } from '../data/repository';

const date = '2026-11-16';
const mixedData = () => {
  const d = createDemoWorkspace();
  d.players = d.players.map((p, i) => ({
    ...p,
    grade: ((i % 3) + 1) as 1 | 2 | 3,
    classroom: String((i % 2) + 1),
    studentNumber: i + 1,
  }));
  return d;
};
it('학급 추가 없이 1·2·3학년 전체 명단을 준비하되 저장 원본은 바꾸지 않는다', () => {
  const d = mixedData(),
    before = JSON.stringify(d),
    day = prepareDailyAttendance(d, date);
  expect(day.students).toHaveLength(24);
  expect(day.groups).toHaveLength(6);
  expect(day.students.every((s) => s.status === 'unmarked')).toBe(true);
  expect(JSON.stringify(d)).toBe(before);
});
it('과거 일부 학급 출석·이름·학적·이력과 삭제 학생 스냅샷을 그대로 보존한다', () => {
  const d = mixedData();
  const day = markAttendance(
    addClassGroup(d, date, { grade: '1', classroom: '1' }),
    ['green-1'],
    'absent',
  );
  d.classDays = [day];
  d.players[0] = {
    ...d.players[0],
    name: '이름 변경',
    grade: 3,
    classroom: '9',
    archivedAt: '2026-11-17T00:00:00Z',
  };
  const before = JSON.stringify(d),
    next = prepareDailyAttendance(d, date);
  expect(next.students).toHaveLength(24);
  for (const s of day.students)
    expect(next.students.find((r) => r.playerId === s.playerId)).toEqual(s);
  expect(next.history).toEqual(day.history);
  expect(next.id).toBe(day.id);
  expect(JSON.stringify(d)).toBe(before);
  expect(prepareDailyAttendance({ ...d, classDays: [next] }, date)).toEqual(next);
});
it('새 날짜에는 이전 출석을 복사하지 않고 삭제 선수는 제외, 출전 불가도 출석 미확인으로 유지', () => {
  const d = mixedData();
  d.players[0].archivedAt = '2026-11-16T00:00:00Z';
  d.players[1].active = false;
  let day = prepareDailyAttendance(d, date);
  expect(day.students).toHaveLength(23);
  expect(day.students.find((s) => s.playerId === d.players[1].id)?.status).toBe('unmarked');
  day = markAttendance(
    day,
    day.students.map((s) => s.playerId),
    'present',
  );
  d.classDays = [day];
  const next = prepareDailyAttendance(d, '2026-11-17');
  expect(next.students.every((s) => s.status === 'unmarked')).toBe(true);
  expect(next.history).toEqual([]);
  expect(next.id).not.toBe(day.id);
});
it('학년·반·번호 순 정렬, 미설정은 뒤로; 원래 명단 순서는 보존', () => {
  const day = prepareDailyAttendance(mixedData(), date);
  const a = day.students[0];
  const rows = [
    { ...a, playerId: 'unset', grade: 'unset', classroom: 'unset' },
    { ...a, playerId: '10', classroom: '10', studentNumber: 1 },
    { ...a, playerId: '2-10', classroom: '2', studentNumber: 10 },
    { ...a, playerId: '2-2', classroom: '2', studentNumber: 2 },
  ];
  const before = JSON.stringify(rows);
  expect(sortAttendanceStudents(rows).map((s) => s.playerId)).toEqual([
    '2-2',
    '2-10',
    '10',
    'unset',
  ]);
  expect(JSON.stringify(rows)).toBe(before);
});
it('전체 출석부에서도 경기 누락 판단 범위는 선택한 학급만 유지하고 백업 복원 결과 일치', () => {
  const d = mixedData(),
    day = prepareDailyAttendance(d, date);
  const next = markAttendance(
    day,
    day.students.map((s) => s.playerId),
    'present',
  );
  const once = markAttendance(next, [next.students[0].playerId], 'late');
  expect(markAttendance(once, [next.students[0].playerId], 'late').history).toEqual(once.history);
  const restored = readBackup(serializeBackup({ ...d, classDays: [once] }));
  expect(restored.classDays).toEqual([once]);
  expect(restored.events).toEqual(d.events);
  expect(restored.assessments).toEqual(d.assessments);
  expect(
    attendanceRows(restored.classDays[0], [groupKey({ grade: '1', classroom: '1' })]),
  ).toHaveLength(4);
});
it('저장 후 새 학생은 같은 날짜에 미확인으로 한 번만 추가된다', () => {
  const d = mixedData();
  const day = prepareDailyAttendance(d, date);
  d.classDays = [markAttendance(day, [day.students[0].playerId], 'restricted')];
  d.players.push({ ...d.players[0], id: 'new-student', name: '가상 새 학생' });
  const next = prepareDailyAttendance(d, date);
  expect(next.students).toHaveLength(25);
  expect(next.students.at(-1)).toMatchObject({ playerId: 'new-student', status: 'unmarked' });
  expect(next.students[0].status).toBe('restricted');
  expect(prepareDailyAttendance({ ...d, classDays: [next] }, date).students).toHaveLength(25);
});
it('빈 날짜와 존재하지 않는 날짜를 차단한다', () => {
  for (const invalid of ['', '2026-02-30', '2026-13-01'])
    expect(() => prepareDailyAttendance(mixedData(), invalid)).toThrow('수업 날짜');
});
