import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { NewGame } from './NewGame';
import { PlayerEditor } from './PlayerEditor';
import { PlayForm } from './PlayForm';
import { createDemoWorkspace } from '../data/seed';
import { STORAGE_KEY, readBackup, serializeBackup } from '../data/repository';
import { replayGame } from '../engine/game';
import { calculateStats } from '../statistics/calculate';
import type { Game, Workspace, GameEvent } from '../domain/model';
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Workspace;
it('선수 학년·반·팀 수정은 기존 경기 스냅샷을 보존하고 필터·새로고침에 반영한다', async () => {
  const user = userEvent.setup();
  const app = render(<App />);
  await user.click(screen.getByRole('button', { name: '선수 & 팀' }));
  await user.click(screen.getByRole('button', { name: '샘플 선수 01 정보 수정' }));
  fireEvent.change(screen.getByLabelText('학년'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('반'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('소속 팀'), { target: { value: 'orange' } });
  await user.click(screen.getByRole('button', { name: '선수 저장' }));
  await waitFor(() =>
    expect(saved().players[0]).toMatchObject({
      id: 'green-1',
      teamId: 'orange',
      grade: 3,
      classroom: '2',
    }),
  );
  expect(saved().games[0].entry!.players.away[0].teamId).toBe('green');
  fireEvent.change(screen.getByLabelText('학년 필터'), { target: { value: '3' } });
  expect(screen.getAllByRole('button', { name: /정보 수정$/ })).toHaveLength(1);
  app.unmount();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '선수 & 팀' }));
  fireEvent.change(screen.getByLabelText('선수 검색'), { target: { value: '3학년 2반' } });
  expect(screen.getByRole('button', { name: '샘플 선수 01 정보 수정' })).toBeInTheDocument();
});
it('선수 저장 실패 시 입력값과 열린 수정 창을 유지한다', async () => {
  const close = vi.fn(),
    save = vi.fn(() => {
      throw new Error('quota');
    }),
    data = createDemoWorkspace();
  render(<PlayerEditor player={data.players[0]} data={data} onSave={save} onClose={close} />);
  fireEvent.change(screen.getByLabelText('선수 이름'), { target: { value: '수정할 가상 별칭' } });
  fireEvent.click(screen.getByRole('button', { name: '선수 저장' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('선수 이름')).toHaveValue('수정할 가상 별칭');
  expect(close).not.toHaveBeenCalled();
});
it('3팀 중 두 팀의 선발10명·후보·결석과 날짜·타순을 감독 확인 후 생성한다', () => {
  const data = createDemoWorkspace();
  data.teams.push({ id: 'third', name: '가상 대기 팀', color: '#123456' });
  let created: Game | undefined;
  render(
    <NewGame
      data={data}
      onCreate={(g) => {
        created = g;
        return true;
      }}
      onClose={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  expect(screen.getByText(/대기 팀: 가상 대기 팀/)).toBeInTheDocument();
  for (const n of Array.from({ length: 10 }, (_, i) => i + 1))
    fireEvent.click(
      screen.getByRole('button', {
        name: '샘플 선수 ' + String(n).padStart(2, '0') + ' 선발 선택',
      }),
    );
  fireEvent.change(screen.getByLabelText('샘플 선수 11 경기 상태'), {
    target: { value: 'reserve' },
  });
  fireEvent.change(screen.getByLabelText('샘플 선수 12 경기 상태'), {
    target: { value: 'absent' },
  });
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 02 타순 위로' }));
  fireEvent.change(screen.getByLabelText('엔트리 유격수'), { target: { value: 'green-2' } });
  fireEvent.click(screen.getByRole('button', { name: '후공 엔트리 · 0/10명' }));
  for (const n of Array.from({ length: 10 }, (_, i) => i + 13))
    fireEvent.click(screen.getByRole('button', { name: '샘플 선수 ' + n + ' 선발 선택' }));
  fireEvent.change(screen.getByLabelText('경기 날짜'), { target: { value: '2026-11-03' } });
  fireEvent.change(screen.getByLabelText('시작 시간 · 선택'), { target: { value: '09:30' } });
  fireEvent.change(screen.getByLabelText('엔트리 확인 감독'), { target: { value: '가상 감독' } });
  fireEvent.click(screen.getByLabelText(/양 팀 선발 10명/));
  fireEvent.click(screen.getByRole('button', { name: '경기 생성' }));
  expect(created).toMatchObject({
    playedOn: '2026-11-03',
    dateStatus: 'confirmed',
    startTime: '09:30',
    formation: 'TYPE1',
  });
  expect(created!.lineups.away[0]).toBe('green-2');
  expect(created!.rosters.away).toHaveLength(11);
  expect(created!.rosters.away).toContain('green-11');
  expect(created!.lineups.away).not.toContain('green-11');
  expect(created!.rosters.away).not.toContain('green-12');
  expect(created!.entry!.players.away[11].status).toBe('absent');
  expect(replayGame(created!, []).defense.away).toEqual({ SS: 'green-2' });
});
it('필드 터치 수비 연결→주자 확인→심판 타임으로 저장하고 백업·재계산한다', async () => {
  const data = createDemoWorkspace(),
    g = data.games[0];
  data.events = [
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  await user.click(screen.getByRole('button', { name: '아웃' }));
  const defense = within(screen.getByRole('region', { name: '상대 팀 수비 터치 기록' }));
  const action = (player: string, name: string) => {
    fireEvent.click(defense.getByRole('button', { name: player }));
    fireEvent.click(defense.getByRole('button', { name }));
  };
  action('유격수 샘플 선수 14', '땅볼 포구 성공');
  fireEvent.click(defense.getByRole('button', { name: '수비 행동 연결' }));
  action('유격수 샘플 선수 14', '송구 성공');
  fireEvent.change(defense.getByLabelText('수비 행동 목표 베이스'), { target: { value: '1' } });
  fireEvent.click(defense.getByRole('button', { name: '수비 행동 연결' }));
  action('1루수 샘플 선수 13', '송구 포구 성공');
  fireEvent.click(defense.getByRole('button', { name: '수비 행동 연결' }));
  action('1루수 샘플 선수 13', '포스아웃');
  fireEvent.change(defense.getByLabelText('수비 행동 목표 베이스'), { target: { value: '1' } });
  fireEvent.change(defense.getByLabelText('수비 행동 대상 주자'), { target: { value: 'green-1' } });
  fireEvent.click(defense.getByRole('button', { name: '수비 행동 연결' }));
  const commit = screen.getByRole('button', { name: /심판 타임 · 플레이 확정/ });
  expect(commit).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '선수 & 팀' }));
  expect(screen.getByText(/저장하지 않은 입력이 있습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  expect(commit).toBeDisabled();
  fireEvent.click(screen.getByLabelText('심판 타임 선언 확인'));
  fireEvent.click(commit);
  const restored = readBackup(serializeBackup(saved()));
  const event = restored.events.at(-1)!;
  expect(event.payload.type === 'END_PLAY' && event.payload.defenseSequence).toHaveLength(4);
  const rows = calculateStats(restored.games[0], restored.events, restored.policy).rows;
  expect(rows.find((r) => r.playerId === 'orange-2')).toMatchObject({
    assists: 1,
    fieldingAttempts: 2,
  });
  expect(rows.find((r) => r.playerId === 'orange-1')).toMatchObject({
    putouts: 1,
    fieldingAttempts: 2,
  });
  expect(screen.getByRole('button', { name: '1루타' })).toBeInTheDocument();
});
it('연결 수비 저장 실패와 취소는 입력·원본을 보존하며 미배치 선수를 자동 지정하지 않는다', () => {
  const data = createDemoWorkspace(),
    g = data.games[0];
  const events: GameEvent[] = [
    {
      id: 's',
      gameId: g.id,
      sequence: 1,
      schemaVersion: 3,
      deviceId: 'test',
      recordedAt: g.createdAt,
      payload: { type: 'START_PLAY' },
    },
  ];
  const save = vi.fn(() => false);
  render(<PlayForm data={data} game={g} state={replayGame(g, events)} onEvent={save} />);
  expect(screen.getByText(/10명 배치/)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /미배치$/ })).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  fireEvent.click(screen.getByLabelText('심판 타임 선언 확인'));
  const commit = screen.getByRole('button', { name: /심판 타임 · 플레이 확정/ });
  fireEvent.click(commit);
  expect(save).toHaveBeenCalledOnce();
  expect(commit).toBeEnabled();
  expect(screen.getByLabelText('green-1 최종 위치')).toHaveValue('1');
});

it('날짜 필터 중 새 추천 엔트리를 확인해 생성하면 새 경기 화면을 표시한다', () => {
  const data = createDemoWorkspace();
  data.games[0].playedOn = '2026-10-25';
  data.games[0].dateStatus = 'confirmed';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  fireEvent.change(screen.getByLabelText('경기 날짜 필터'), { target: { value: '2026-10-26' } });
  expect(screen.getByText('선택한 날짜의 경기가 없습니다.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '새 경기' }));
  fireEvent.click(screen.getByRole('button', { name: '수비 기능 추천 적용 · 초안' }));
  fireEvent.click(screen.getByRole('button', { name: '후공 엔트리 · 0/10명' }));
  fireEvent.click(screen.getByRole('button', { name: '수비 기능 추천 적용 · 초안' }));
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('경기 날짜'), { target: { value: '2026-10-27' } });
  fireEvent.change(screen.getByLabelText('엔트리 확인 감독'), { target: { value: '가상 감독' } });
  fireEvent.click(screen.getByLabelText(/양 팀 선발 10명/));
  fireEvent.click(screen.getByRole('button', { name: '경기 생성' }));
  expect(saved().games).toHaveLength(2);
  expect(saved().games[1].entry).toMatchObject({ source: 'manager', approvedBy: '가상 감독' });
  expect(screen.getByLabelText('경기 날짜 필터')).toHaveValue('');
  expect(screen.getByLabelText('경기 선택')).toHaveValue(saved().games[1].id);
  expect(screen.queryByText('선택한 날짜의 경기가 없습니다.')).not.toBeInTheDocument();
});
