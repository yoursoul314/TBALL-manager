import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EntryPrint, EntrySheet } from './EntryPrint';
import { createDemoWorkspace } from '../data/seed';
import { captureLegacyEntry } from '../domain/roster';
import appCss from '../styles.css?raw';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('공통 표 스타일에도 학생용 글자는 13pt와 검정색을 유지', () => {
  const d = createDemoWorkspace();
  const { container } = render(<EntrySheet data={d} game={d.games[0]} />);
  const style = document.createElement('style');
  style.textContent = appCss;
  document.head.append(style);
  try {
    const cell = getComputedStyle(container.querySelector('td')!);
    expect(cell.fontSize).toBe('13pt');
    expect(cell.color).toBe('rgb(17, 17, 17)');
  } finally {
    style.remove();
  }
});
it('학생용 엔트리는 양 팀 타순·주장·수비·후보를 보여주고 평가·출석 사유는 인쇄하지 않는다', () => {
  const d = createDemoWorkspace(),
    g = d.games[0];
  g.entry = captureLegacyEntry(g, d);
  g.entry!.captains = { away: 'green-1', home: null };
  g.entry!.defense.away = { '1B': 'green-1' };
  const before = JSON.stringify(d);
  render(<EntrySheet data={d} game={g} />);
  expect(screen.getAllByRole('table')).toHaveLength(2);
  const away = within(screen.getByRole('region', { name: '선공 엔트리' }));
  expect(away.getByText('★ 주장 샘플 선수 01')).toBeInTheDocument();
  expect(away.getByText('1루수')).toBeInTheDocument();
  expect(away.getByText(/샘플 선수 11 #/)).toBeInTheDocument();
  expect(screen.queryByText(/기능평가|결석|부상/)).toBeNull();
  expect(JSON.stringify(d)).toBe(before);
});
it('이름·소속 변경 후에도 경기 당시 스냅샷을 인쇄하고 현재 수비를 선택할 수 있다', () => {
  const d = createDemoWorkspace(),
    g = d.games[0];
  g.entry = captureLegacyEntry(g, d);
  d.players[0].name = '변경된 이름';
  d.teams[0].name = '변경된 팀';
  d.events.push({
    schemaVersion: 3,
    id: 'def',
    gameId: g.id,
    sequence: 1,
    deviceId: 'test',
    recordedAt: g.createdAt,
    payload: { type: 'DEFENSE', side: 'away', assignments: { SS: 'green-1' } },
  });
  render(<EntryPrint data={d} game={g} onClose={() => {}} />);
  expect(screen.queryByText('변경된 이름')).toBeNull();
  expect(screen.queryByText('유격수')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '현재 엔트리' }));
  expect(screen.getByText('유격수')).toBeInTheDocument();
});
it('인쇄/PDF 버튼은 저장소를 변경하지 않고 닫기·Escape 및 스타일 해제가 가능', () => {
  const d = createDemoWorkspace(),
    close = vi.fn(),
    print = vi.spyOn(window, 'print').mockImplementation(() => {}),
    write = vi.spyOn(Storage.prototype, 'setItem');
  const view = render(<EntryPrint data={d} game={d.games[0]} onClose={close} />);
  expect(document.body).toHaveClass('entry-printing');
  fireEvent.click(screen.getByRole('button', { name: '엔트리 프린트 / PDF 저장' }));
  expect(print).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.body).not.toHaveClass('entry-printing');
});
