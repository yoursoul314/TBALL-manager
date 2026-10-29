import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PlayForm } from './PlayForm';
import { Profile } from './Players';
import { createDemoWorkspace } from '../data/seed';
import { record } from '../test/fixtures';
import { calculateStats } from '../statistics/calculate';
import type { EndPlayPayload } from '../domain/model';
afterEach(cleanup);
it('간편 모드 홈런은 득점별 타점 판정 후 저장, 반복 터치해도 중복되지 않음', () => {
  const d = createDemoWorkspace(),
    game = d.games[0],
    r = record(game);
  r.hit();
  const state = r.add({ type: 'START_PLAY' });
  const save = vi.fn((_p: unknown) => true);
  render(<PlayForm data={d} game={game} state={state} onEvent={save} initialResult="home-run" />);
  const submit = screen.getByRole('button', { name: '심판 타임 · 플레이 확정' });
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 02 결과 확인' }));
  fireEvent.click(screen.getByLabelText('심판 타임 선언 확인'));
  expect(submit).toBeDisabled();
  for (const name of ['샘플 선수 01', '샘플 선수 02']) {
    const group = within(screen.getByRole('group', { name: name + ' 득점 · 타점 판정' }));
    fireEvent.click(group.getByRole('button', { name: '타점 인정' }));
    fireEvent.click(group.getByRole('button', { name: '타점 인정' }));
  }
  fireEvent.click(screen.getByLabelText('심판 타임 선언 확인'));
  fireEvent.click(submit);
  const payload = save.mock.calls[0]?.[0] as unknown as EndPlayPayload;
  expect(payload.details).toHaveLength(2);
  r.add(payload);
  const stats = calculateStats(game, r.events, d.policy).rows;
  expect(stats.find((s) => s.playerId === 'green-2')).toMatchObject({ hits: 1, runs: 1, rbi: 2 });
  cleanup();
  render(<Profile id="green-2" data={{ ...d, events: r.events }} onClose={() => {}} />);
  expect(screen.getByText('타점 (RBI)').parentElement).toHaveTextContent('2');
});
it('주자·결과 변경은 이전 타점 선택을 제거하고 실책 득점은 타점 없음으로 저장 가능', () => {
  const d = createDemoWorkspace(),
    game = d.games[0],
    r = record(game);
  const state = r.add({ type: 'START_PLAY' }),
    save = vi.fn((_p: unknown) => true);
  render(<PlayForm data={d} game={game} state={state} onEvent={save} initialResult="home-run" />);
  fireEvent.click(screen.getByRole('button', { name: '타점 인정' }));
  fireEvent.change(screen.getByLabelText('green-1 최종 위치'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('green-1 최종 위치'), { target: { value: 'home' } });
  expect(screen.getByRole('button', { name: '타점 인정' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  fireEvent.click(screen.getByRole('button', { name: '실책 출루' }));
  fireEvent.change(screen.getByLabelText('green-1 최종 위치'), { target: { value: 'home' } });
  fireEvent.click(screen.getByRole('button', { name: '타점 없음' }));
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  fireEvent.click(screen.getByLabelText('심판 타임 선언 확인'));
  fireEvent.click(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' }));
  r.add(save.mock.calls[0][0] as EndPlayPayload);
  expect(calculateStats(game, r.events, d.policy).rows[0]).toMatchObject({
    runs: 1,
    rbi: 0,
    hits: 0,
  });
});
