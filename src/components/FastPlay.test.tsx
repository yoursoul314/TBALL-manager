import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { LocalWorkspaceRepository, STORAGE_KEY } from '../data/repository';
import { calculateStats } from '../statistics/calculate';
import { replayGame } from '../engine/game';
import { PlayForm } from './PlayForm';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const saved = () => new LocalWorkspaceRepository(localStorage).load()!;
const open = () => {
  render(<App />);
  click('경기 기록실');
  click('2학년 티볼 연습 경기 경기 열기');
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
it('결과→모든 주자 확인→심판 타임 3터치 및 다음 타자 중 직전 타구 보완은 초안·원본 유지', () => {
  open();
  click('1루타');
  expect(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' })).toBeDisabled();
  click('표시된 모든 주자 결과 확인');
  click('심판 타임 · 플레이 확정');
  const original = saved().events[1];
  click('2루타');
  click('표시된 모든 주자 결과 확인');
  click('직전 타구 상세 보완');
  const dialog = within(screen.getByRole('dialog', { name: '직전 타구 상세 보완' }));
  fireEvent.click(dialog.getByRole('button', { name: '좌 원거리' }));
  fireEvent.click(dialog.getByRole('button', { name: '직선타' }));
  fireEvent.change(dialog.getByLabelText('수정자 별칭'), { target: { value: '가상 감독' } });
  fireEvent.click(dialog.getByRole('button', { name: '타구 상세 저장 · 이력 보존' }));
  expect(saved().events[1]).toEqual(original);
  expect(saved().events.at(-1)?.payload).toMatchObject({
    type: 'REVISE_PLAY',
    replacement: { direction: 'left', distance: 'far', quality: 'line' },
  });
  expect(screen.getByLabelText('green-2 최종 위치')).toHaveValue('2');
  expect(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' })).toBeEnabled();
  click('심판 타임 · 플레이 확정');
  const d = saved(),
    rows = calculateStats(d.games[0], d.events, d.policy).rows;
  expect(rows.find((s) => s.playerId === 'green-1')).toMatchObject({
    pa: 1,
    hits: 1,
    directions: { left: 1 },
  });
  expect(rows.find((s) => s.playerId === 'green-2')).toMatchObject({ pa: 1, totalBases: 2 });
});
it('빠른 땅볼 수비는 수비수 두 명 확인으로 포구·송구·자살·보살을 생성', () => {
  const d = createDemoWorkspace(),
    g = d.games[0];
  d.events = [
    {
      id: 'def',
      gameId: g.id,
      sequence: 1,
      schemaVersion: 3,
      deviceId: 'test',
      recordedAt: g.createdAt,
      payload: { type: 'DEFENSE', side: 'home', assignments: { SS: 'orange-2', '1B': 'orange-1' } },
    },
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  open();
  click('땅볼 아웃 · 1루');
  click('땅볼 아웃 · 1루 연결');
  click('유격수 · 샘플 선수 14');
  click('1루수 · 샘플 선수 13');
  click('이 수비 연결 적용');
  click('표시된 모든 주자 결과 확인');
  click('심판 타임 · 플레이 확정');
  const data = saved(),
    rows = calculateStats(data.games[0], data.events, data.policy).rows;
  expect(rows.find((s) => s.playerId === 'orange-2')?.assists).toBe(1);
  expect(rows.find((s) => s.playerId === 'orange-1')?.putouts).toBe(1);
});
it('홈런 전체 주자 확인만으로 RBI 판정을 생략할 수 없으며 저장 실패 후 재시도·중복 방지', () => {
  const d = createDemoWorkspace(),
    g = d.games[0],
    state = replayGame(g, [
      {
        id: 's',
        gameId: g.id,
        sequence: 1,
        schemaVersion: 3,
        deviceId: 'test',
        recordedAt: g.createdAt,
        payload: { type: 'START_PLAY' },
      },
    ]);
  const save = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  render(<PlayForm data={d} game={g} state={state} initialResult="home-run" onEvent={save} />);
  click('표시된 모든 주자 결과 확인');
  expect(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' })).toBeDisabled();
  click('타점 인정');
  click('심판 타임 · 플레이 확정');
  expect(screen.getByLabelText('green-1 최종 위치')).toHaveValue('home');
  click('심판 타임 · 플레이 확정');
  click('심판 타임 · 플레이 확정');
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toMatchObject({
    endedBy: 'umpire-time',
    details: [{ type: 'RBI', runnerId: 'green-1' }],
  });
});
