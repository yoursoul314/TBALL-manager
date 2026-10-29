import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { ScorebookPages, ScorebookPrint, scorebookHtml } from './ScorebookPrint';
import { STORAGE_KEY } from '../data/repository';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
it('빈 기록지는 양 팀 타순·설정 이닝·주자/타점/교체 칸을 제공하고 이름을 안전하게 출력', () => {
  const d = createDemoWorkspace();
  d.games[0].innings = 6;
  d.players[0].name = '<img src=x onerror=alert(1)>';
  const options = { filled: false, details: true, blankPages: 2 };
  const { container } = render(<ScorebookPages data={d} game={d.games[0]} options={options} />);
  expect(container.querySelectorAll('.scorebook-page')).toHaveLength(7);
  expect(screen.getByLabelText('선공 6회 기록지')).toBeInTheDocument();
  expect(screen.getAllByText(/타점 인정 득점 주자/)).toHaveLength(12);
  const html = scorebookHtml(d, d.games[0], options);
  expect(html).toContain('@page');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img src=x');
  expect(html).not.toContain('<script');
});
it('인쇄 클릭은 브라우저 인쇄를 열며 저장소를 쓰지 않고 닫기와 옵션을 제공', () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const save = vi.spyOn(Storage.prototype, 'setItem');
  const close = vi.fn(),
    d = createDemoWorkspace();
  render(<ScorebookPrint data={d} game={d.games[0]} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '현재 기록 포함' }));
  fireEvent.click(screen.getByRole('button', { name: '프린트 / PDF 저장' }));
  expect(print).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '기록실로 돌아가기' }));
  expect(close).toHaveBeenCalledOnce();
});
it('경기 목록→인쇄→종이 입력 안내는 경기·원본을 그대로 유지', () => {
  const d = createDemoWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '경기 기록실' }));
  fireEvent.click(screen.getByRole('button', { name: d.games[0].name + ' 기록지 인쇄' }));
  expect(screen.getByRole('dialog', { name: '경기 기록지 인쇄' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '기록실로 돌아가기' }));
  fireEvent.click(screen.getByRole('button', { name: d.games[0].name + ' 경기 열기' }));
  fireEvent.click(screen.getByRole('button', { name: '종이 기록 입력 안내' }));
  expect(screen.getByRole('complementary', { name: '종이 기록 입력 안내' })).toHaveTextContent(
    '다음 입력: 1회 초 / 1번',
  );
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).events).toEqual(d.events);
});
