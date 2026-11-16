import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AttendanceView } from './AttendanceView';
import { NewGame } from './NewGame';
import { createDemoWorkspace } from '../data/seed';
import { addClassGroup, markAttendance, groupKey } from '../domain/attendance';
import { localDate } from '../domain/roster';
import { readBackup, serializeBackup } from '../data/repository';
import type { Game } from '../domain/model';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('출석 터치·일괄 확인·다음 날짜·저장 실패 시 이전 기록 유지', () => {
  const d = createDemoWorkspace();
  d.players = d.players.map((p) => ({ ...p, grade: 2, classroom: '1' }));
  const save = vi.fn();
  function Harness() {
    const [data, setData] = useState(d);
    return (
      <AttendanceView
        data={data}
        onSave={(next) => {
          save();
          setData(next);
        }}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('출석 학년·반'), {
    target: { value: groupKey({ grade: '2', classroom: '1' }) },
  });
  click('학급 명단 추가·새 학생 반영');
  const student = () => within(screen.getByRole('group', { name: '샘플 선수 01 출석' }));
  fireEvent.click(student().getByRole('button', { name: '결석' }));
  click('표시 명단의 미확인 학생 모두 출석');
  expect(student().getByRole('button', { name: '결석' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('출석/지각 23명');
  save.mockImplementationOnce(() => {
    throw Error('용량 부족');
  });
  fireEvent.click(student().getByRole('button', { name: '출석' }));
  expect(screen.getByRole('alert')).toHaveTextContent('용량 부족');
  expect(student().getByRole('button', { name: '결석' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByLabelText('출석 날짜'), { target: { value: '2026-12-01' } });
  click('학급 명단 추가·새 학생 반영');
  expect(screen.getByRole('status')).toHaveTextContent('미확인 24명');
});
it('당일 수업 24명 중 결석 1명 제외·선발 20명·후보 3명 전원 편성 후 승인·생성', () => {
  const d = createDemoWorkspace();
  d.players = d.players.map((p) => ({ ...p, grade: 2, classroom: '1' }));
  let day = addClassGroup(d, localDate(), { grade: '2', classroom: '1' });
  day = markAttendance(
    day,
    day.students.map((s) => s.playerId),
    'present',
  );
  day = markAttendance(day, ['green-1'], 'absent');
  d.classDays = [day];
  const before = JSON.stringify(d);
  let game: Game | undefined;
  render(
    <NewGame
      data={d}
      attendanceRequired
      onCreate={(g) => {
        game = g;
      }}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  click('출석 기준 적용 · 누락 학생 모두 편성');
  expect(screen.getByRole('region', { name: '당일 수업 명단 확인' })).toHaveTextContent('누락 0명');
  fireEvent.change(screen.getByLabelText('엔트리 확인 감독'), { target: { value: '가상 감독' } });
  fireEvent.click(screen.getByLabelText(/양 팀 선발 10명/));
  click('경기 생성');
  expect(game!.lineups.away).toHaveLength(10);
  expect(game!.lineups.home).toHaveLength(10);
  expect([...game!.rosters.away, ...game!.rosters.home]).toHaveLength(23);
  expect(game!.entry!.attendance!.students.find((s) => s.playerId === 'green-1')).toMatchObject({
    status: 'absent',
    eligible: false,
  });
  expect(JSON.stringify(d)).toBe(before);
  const restored = readBackup(serializeBackup({ ...d, games: [...d.games, game!] }));
  expect(restored.games.at(-1)!.entry!.attendance).toEqual(game!.entry!.attendance);
  d.classDays = [markAttendance(day, ['green-1'], 'present')];
  expect(game!.entry!.attendance!.students[0].status).toBe('absent');
});
