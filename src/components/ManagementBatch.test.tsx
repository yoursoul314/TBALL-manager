import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import App from '../App';
import { ManagementDialog } from './ManagementDialog';
import { createDemoWorkspace } from '../data/seed';
import { archiveSelection } from '../domain/management';
import { STORAGE_KEY } from '../data/repository';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
it('선수 여러 명 삭제·복원과 팀 복원 옆 완전삭제를 제공한다', () => {
  render(<App />);
  click('선수 & 팀');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 관리 선택'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 관리 선택'));
  click('선택 선수 삭제');
  click('선수 선택 삭제 확정');
  click('삭제된 선수 · 2');
  expect(screen.getByRole('button', { name: '샘플 선수 01 선수 완전삭제' })).toBeInTheDocument();
  click('표시 선수 전체 선택');
  click('선택 선수 복원');
  click('선수 선택 복원 확정');
  expect(
    JSON.parse(localStorage.getItem(STORAGE_KEY)!).players.some(
      (p: { archivedAt?: string }) => p.archivedAt,
    ),
  ).toBe(false);
  click('그린 윙스 팀 삭제');
  click('팀 삭제 확정');
  click('삭제된 팀 · 1');
  expect(screen.getByRole('button', { name: '그린 윙스 팀 복원' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '그린 윙스 팀 완전삭제' })).toBeInTheDocument();
}, 10000);
it('완전삭제는 연결 경기 전체 안내·백업·확인 전에는 실행되지 않는다', () => {
  const d = archiveSelection(
      createDemoWorkspace(),
      'players',
      ['green-1'],
      true,
      '2026-10-26T00:00:00.000Z',
    ),
    purge = vi.fn();
  render(
    <ManagementDialog
      data={d}
      request={{ kind: 'players', ids: ['green-1'], action: 'purge' }}
      onSave={vi.fn()}
      onPurge={purge}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText(/다른 학생 기록을 포함한 경기 전체/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '선택 항목 완전삭제 실행' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('완전삭제 확인 문구'), { target: { value: '완전삭제' } });
  expect(screen.getByRole('button', { name: '선택 항목 완전삭제 실행' })).toBeDisabled();
  expect(purge).not.toHaveBeenCalled();
});
