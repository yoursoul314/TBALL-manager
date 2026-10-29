import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { ScorebookPages, ScorebookPrint, scorebookHtml } from './ScorebookPrint';
import { STORAGE_KEY } from '../data/repository';
import { game as fixtureGame, record } from '../test/fixtures';
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

it('현재 기록이 없으면 빈 상세/교체 페이지를 만들지 않고 마지막은 후공 기록지', () => {
  const data = createDemoWorkspace();
  data.events = [];
  const { container } = render(
    <ScorebookPages
      data={data}
      game={data.games[0]}
      options={{ filled: true, details: true, blankPages: 2 }}
    />,
  );
  const pages = container.querySelectorAll('.scorebook-page');
  expect(pages).toHaveLength(2);
  expect(pages[1]).toHaveAttribute('aria-label', '후공 1회 기록지');
  expect(container.querySelector('.scorebook-log')).toBeNull();
});

it('이닝 경계·상세 페이지 수 변경 시 빈 끝 페이지 없이 양 팀 타순과 수기 칸을 보존', () => {
  const data = createDemoWorkspace();
  data.games[0].innings = 10;
  const options = { filled: false, details: true, blankPages: 3 };
  const { container, rerender } = render(
    <ScorebookPages data={data} game={data.games[0]} options={options} />,
  );
  expect(container.querySelectorAll('.scorebook-page')).toHaveLength(8);
  expect(container.querySelectorAll('.scorebook-grid tbody tr')).toHaveLength(40);
  expect(container.querySelectorAll('.scorebook-log tbody tr')).toHaveLength(18);
  expect(container.querySelector('.scorebook-pages')?.lastElementChild).toHaveAttribute(
    'aria-label',
    '교체·판정 기록지',
  );
  rerender(
    <ScorebookPages data={data} game={data.games[0]} options={{ ...options, details: false }} />,
  );
  expect(container.querySelectorAll('.scorebook-page')).toHaveLength(4);
  expect(container.querySelectorAll('.scorebook-cell-blank')).toHaveLength(200);
});

it('긴 복수 수비 기록과 타점·마지막 플레이를 HTML/PDF 원본에 생략하지 않음', () => {
  const r = record();
  r.add({ type: 'START_PLAY' });
  const fielding = Array.from({ length: 40 }, (_, i) => ({
    playerId: i % 2 ? 'h1' : 'h2',
    position: 'SS' as const,
    skill: 'G' as const,
    success: true,
  }));
  r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'home-run',
    direction: 'left',
    quality: 'line',
    fielding,
    outcomes: [{ playerId: 'a1', to: 'home', action: 'advance' }],
    details: [{ id: 'rbi-test', type: 'RBI', runnerId: 'a1' }],
  });
  r.strikeout();
  r.strikeout();
  r.strikeout();
  const data = { ...createDemoWorkspace(), games: [fixtureGame], events: r.events };
  const before = JSON.stringify(data);
  const html = scorebookHtml(data, fixtureGame, { filled: true, details: true, blankPages: 2 });
  const { container } = render(
    <ScorebookPages
      data={data}
      game={fixtureGame}
      options={{ filled: true, details: true, blankPages: 2 }}
    />,
  );
  expect(container.querySelectorAll('.scorebook-log tbody tr')).toHaveLength(4);
  expect(html.match(/SS G:성공/g)).toHaveLength(40);
  expect(html).toContain('RBI 인정');
  expect(screen.getByLabelText('플레이 상세 기록지 2')).toHaveTextContent('No.4');
  expect(JSON.stringify(data)).toBe(before);
});
