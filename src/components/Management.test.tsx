import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { STORAGE_KEY } from '../data/repository';
import { resetWorkspace } from '../domain/reset';
import { ResetPanel } from './ResetPanel';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
const nav = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
it('선수 등록→평가 선택→삭제→평가 제외→복원 흐름을 연결한다', async () => {
  render(<App />);
  nav('선수 & 팀');
  nav('선수 등록');
  fireEvent.change(screen.getByLabelText('선수 이름'), { target: { value: '새 등록 QA' } });
  nav('선수 저장');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  nav('기능평가 & 팀워크');
  expect(
    within(screen.getByLabelText('선수 선택')).getByRole('option', { name: /새 등록 QA/ }),
  ).toBeInTheDocument();
  nav('선수 & 팀');
  nav('새 등록 QA 선수 삭제');
  nav('선수 삭제 확정');
  nav('기능평가 & 팀워크');
  expect(
    within(screen.getByLabelText('선수 선택')).queryByRole('option', { name: /새 등록 QA/ }),
  ).not.toBeInTheDocument();
  nav('선수 & 팀');
  nav('삭제된 선수 · 1');
  nav('새 등록 QA 선수 복원');
  nav('기능평가 & 팀워크');
  expect(screen.getByRole('option', { name: /새 등록 QA/ })).toBeInTheDocument();
});
it('선수 삭제 저장 실패 시 원본과 확인 창을 유지한다', () => {
  const data = createDemoWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render(<App />);
  nav('선수 & 팀');
  nav('샘플 선수 01 선수 삭제');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('quota');
  });
  nav('선수 삭제 확정');
  expect(screen.getByRole('dialog', { name: '선수 삭제' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).players[0].archivedAt).toBeUndefined();
});
it('전체 초기화 후 빈 화면들이 정상 표시되고 새 등록 선수만 평가에 보인다', async () => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(resetWorkspace(createDemoWorkspace(), 'all', '2026-10-26T05:00:00.000Z')),
  );
  render(<App />);
  nav('기능평가 & 팀워크');
  expect(screen.getByText(/등록된 선수가 없습니다/)).toBeInTheDocument();
  nav('경기 분석');
  expect(screen.getByText(/표시할 경기가 없습니다/)).toBeInTheDocument();
  nav('선수 & 팀');
  expect(screen.getByRole('button', { name: '선수 등록' })).toBeEnabled();
  nav('선수 등록');
  fireEvent.change(screen.getByLabelText('선수 이름'), { target: { value: '직접 등록 QA' } });
  nav('선수 저장');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  nav('기능평가 & 팀워크');
  expect(within(screen.getByLabelText('선수 선택')).getAllByRole('option')).toHaveLength(1);
  expect(screen.queryByRole('option', { name: /샘플 선수/ })).not.toBeInTheDocument();
});
it('초기화는 백업·확인 체크·문구가 없으면 실행되지 않는다', () => {
  const reset = vi.fn();
  render(<ResetPanel data={createDemoWorkspace()} onReset={reset} onNotify={vi.fn()} />);
  nav('초기화 준비');
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: '기록 초기화 실행' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('확인 문구'), { target: { value: '기록 초기화' } });
  expect(within(dialog).getByRole('button', { name: '기록 초기화 실행' })).toBeDisabled();
  expect(reset).not.toHaveBeenCalled();
});
