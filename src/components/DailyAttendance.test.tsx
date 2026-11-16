import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AttendanceView } from './AttendanceView';
import { createDemoWorkspace } from '../data/seed';
import { prepareDailyAttendance, markAttendance, groupKey } from '../domain/attendance';
import type { Workspace } from '../domain/model';

const date = '2026-11-16';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const row = (n: number) =>
  within(screen.getByRole('row', { name: `샘플 선수 ${String(n).padStart(2, '0')} 출결` }));
const pick = (n: number) => fireEvent.click(row(n).getByRole('checkbox'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(fail = false) {
  const d = createDemoWorkspace();
  d.players = d.players.map((p, i) => ({
    ...p,
    grade: ((i % 3) + 1) as 1 | 2 | 3,
    classroom: String((i % 2) + 1),
    studentNumber: i + 1,
  }));
  const before = JSON.stringify(d);
  let latest = d;
  const saved = vi.fn((next: Workspace) => {
    latest = next;
  });
  if (fail)
    saved.mockImplementationOnce(() => {
      throw Error('저장 공간 부족');
    });
  function Harness() {
    const [data, setData] = useState(d);
    return (
      <AttendanceView
        data={data}
        initialDate={date}
        onSave={(next) => {
          saved(next);
          setData(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { saved, latest: () => latest, d, before };
}
it('날짜 선택만으로 모든 학급 표시, 조회는 저장 없이 원본 유지, 여러 학급을 선택해 한 번 저장', () => {
  const h = setup();
  expect(screen.getAllByRole('row')).toHaveLength(25);
  expect(screen.queryByText('학급 명단 추가·새 학생 반영')).not.toBeInTheDocument();
  expect(h.saved).not.toHaveBeenCalled();
  pick(1);
  pick(2);
  click('선택 학생 결석');
  expect(h.saved).toHaveBeenCalledTimes(1);
  expect(h.latest().classDays[0].students.filter((s) => s.status === 'absent')).toHaveLength(2);
  expect(h.latest().classDays[0].history).toHaveLength(2);
  expect(row(1).getByRole('button', { name: '결석' })).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.stringify(h.d)).toBe(h.before);
});
it('필터를 바꾸면 선택 해제, 표시 명단만 일괄 처리하고 다른 학급 출석은 변경하지 않는다', () => {
  const h = setup();
  pick(2);
  fireEvent.change(screen.getByLabelText('표시 학급'), {
    target: { value: groupKey({ grade: '1', classroom: '1' }) },
  });
  expect(screen.queryByRole('button', { name: '선택 학생 결석' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(5);
  fireEvent.click(screen.getByLabelText('표시 학생 전체 선택'));
  click('선택 학생 지각');
  expect(h.latest().classDays[0].students.filter((s) => s.status === 'late')).toHaveLength(4);
  expect(
    h.latest().classDays[0].students.find((s) => s.playerId === h.d.players[1].id)?.status,
  ).toBe('unmarked');
  fireEvent.change(screen.getByLabelText('표시 출결'), { target: { value: 'absent' } });
  expect(screen.getByText(/조건에 맞는 학생이 없습니다/)).toBeInTheDocument();
});
it('검색된 미확인만 모두 출석 처리하고 기존 결석은 보존한다', () => {
  const h = setup();
  fireEvent.click(row(1).getByRole('button', { name: '결석' }));
  fireEvent.change(screen.getByLabelText('학생 찾기'), { target: { value: '샘플 선수 0' } });
  click('표시 명단의 미확인 학생 모두 출석');
  const counts = h.latest().classDays[0].students;
  expect(counts.filter((s) => s.status === 'present')).toHaveLength(8);
  expect(counts.filter((s) => s.status === 'unmarked')).toHaveLength(15);
  expect(counts.filter((s) => s.status === 'absent')).toHaveLength(1);
});
it('일괄 저장 실패 시 선택·이전 기록 유지, 재시도 후 이력은 한 번만 반영', () => {
  const h = setup(true);
  pick(1);
  pick(2);
  click('선택 학생 조퇴');
  expect(screen.getByRole('alert')).toHaveTextContent('저장 공간 부족');
  expect(row(1).getByRole('checkbox')).toBeChecked();
  expect(row(1).getByRole('button', { name: '미확인' })).toHaveAttribute('aria-pressed', 'true');
  expect(h.latest().classDays).toHaveLength(0);
  click('선택 학생 조퇴');
  expect(h.latest().classDays[0].history).toHaveLength(2);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(row(1).getByRole('checkbox')).not.toBeChecked();
});
it('이전·다음 날짜는 이전 출결 복사 없이 전환하고 돌아오면 저장한 상태를 보여 준다', () => {
  const h = setup();
  fireEvent.click(row(1).getByRole('button', { name: '출석' }));
  click('다음 날짜');
  expect(screen.getByLabelText('출석 날짜')).toHaveValue('2026-11-17');
  expect(row(1).getByRole('button', { name: '미확인' })).toHaveAttribute('aria-pressed', 'true');
  expect(h.saved).toHaveBeenCalledTimes(1);
  click('이전 날짜');
  expect(row(1).getByRole('button', { name: '출석' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByLabelText('출석 날짜'), { target: { value: '' } });
  expect(screen.getByText('올바른 수업 날짜를 선택하세요.')).toBeInTheDocument();
});
it('전체 명단만 반영해도 미확인은 유지하고 다시 열면 저장된 출석·이력 복원', () => {
  const h = setup();
  click('전체 명단 반영 · 24명');
  expect(h.latest().classDays[0].history).toEqual([]);
  expect(h.latest().classDays[0].students.every((s) => s.status === 'unmarked')).toBe(true);
  fireEvent.click(row(3).getByRole('button', { name: '활동 제한' }));
  const data = h.latest();
  cleanup();
  render(<AttendanceView data={data} initialDate={date} onSave={vi.fn()} />);
  expect(row(3).getByRole('button', { name: '활동 제한' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('출석 변경 이력 · 1건')).toBeInTheDocument();
});
it('경기 안 출석부는 경기 날짜를 고정하고 같은 날짜 출결만 수정한다', () => {
  const d = createDemoWorkspace();
  d.classDays = [markAttendance(prepareDailyAttendance(d, date), [d.players[0].id], 'absent')];
  render(<AttendanceView data={d} initialDate={date} compact onSave={vi.fn()} />);
  expect(screen.getByLabelText('출석 날짜')).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: '다음 날짜' })).not.toBeInTheDocument();
  expect(row(1).getByRole('button', { name: '결석' })).toHaveAttribute('aria-pressed', 'true');
});
