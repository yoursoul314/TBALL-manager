import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { STORAGE_KEY } from '../data/repository';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
const openLibrary = () => fireEvent.click(screen.getByRole('button', { name: '경기 기록실' }));
it('목록에서 클릭한 경기 상세를 열고 목록으로 돌아온다', () => {
  const d = createDemoWorkspace();
  d.games.push({ ...d.games[0], id: 'second', name: '두 번째 가상 경기' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  render(<App />);
  openLibrary();
  expect(screen.queryByRole('button', { name: '1루타' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '두 번째 가상 경기 경기 열기' }));
  expect(screen.getByRole('heading', { name: '두 번째 가상 경기', level: 1 })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '← 경기 목록' }));
  expect(screen.getAllByRole('button', { name: /경기 열기$/ })).toHaveLength(2);
});
it('마지막 경기 삭제·새로고침·빈 통계·휴지통 복원이 원본을 보존한다', () => {
  const d = createDemoWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  let app = render(<App />);
  openLibrary();
  fireEvent.click(screen.getByRole('button', { name: d.games[0].name + ' 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '휴지통으로 이동' }));
  expect(screen.getByText(/표시할 경기가 없습니다/)).toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(saved.events).toEqual(d.events);
  expect(saved.games[0].lineups).toEqual(d.games[0].lineups);
  app.unmount();
  app = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '경기 분석' }));
  expect(screen.getByText(/표시할 경기가 없습니다/)).toBeInTheDocument();
  openLibrary();
  fireEvent.click(screen.getByRole('button', { name: '휴지통 · 1' }));
  fireEvent.click(screen.getByRole('button', { name: d.games[0].name + ' 복원' }));
  fireEvent.click(screen.getByRole('button', { name: '경기 목록 · 1' }));
  expect(screen.getByRole('button', { name: d.games[0].name + ' 경기 열기' })).toBeEnabled();
});
it('삭제 저장 실패 시 확인창과 원본을 유지한다', () => {
  const d = createDemoWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  render(<App />);
  openLibrary();
  fireEvent.click(screen.getByRole('button', { name: d.games[0].name + ' 삭제' }));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw Error('저장 공간 부족');
  });
  fireEvent.click(screen.getByRole('button', { name: '휴지통으로 이동' }));
  expect(screen.getByRole('dialog', { name: '경기 삭제' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).games[0].archivedAt).toBeUndefined();
});
it('라이브 입력 중 목록 이동과 삭제를 차단한다', () => {
  render(<App />);
  openLibrary();
  fireEvent.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  fireEvent.click(screen.getByRole('button', { name: '1루타' }));
  expect(screen.getByRole('button', { name: '← 경기 목록' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '경기 기록실' }));
  expect(screen.getByText(/저장하지 않은 입력이 있습니다/)).toBeInTheDocument();
});

it('팀 추가·삭제·복원 후 새 경기에서는 운영 팀만 선택한다', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '선수 & 팀' }));
  fireEvent.click(screen.getByRole('button', { name: '팀 추가' }));
  fireEvent.change(screen.getByLabelText('팀 이름'), { target: { value: '새 가상 팀' } });
  fireEvent.click(screen.getByRole('button', { name: '팀 저장' }));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).teams).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: '그린 윙스 팀 삭제' }));
  fireEvent.click(screen.getByRole('button', { name: '팀 삭제 확정' }));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).players).toHaveLength(24);
  openLibrary();
  fireEvent.click(screen.getByRole('button', { name: '새 경기' }));
  expect(screen.queryByRole('option', { name: '그린 윙스' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '닫기' }));
  fireEvent.click(screen.getByRole('button', { name: '선수 & 팀' }));
  fireEvent.click(screen.getByRole('button', { name: '삭제된 팀 · 1' }));
  fireEvent.click(screen.getByRole('button', { name: '그린 윙스 팀 복원' }));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).teams[0].archivedAt).toBeNull();
});
