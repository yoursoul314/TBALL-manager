import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NewGame } from './NewGame';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import type { Game, Workspace } from '../domain/model';
import { replayGame } from '../engine/game';
import { validateEntry, localDate } from '../domain/roster';
import { addClassGroup, markAttendance, playerGroup } from '../domain/attendance';
import { STORAGE_KEY, readBackup, serializeBackup } from '../data/repository';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const confirm = () => {
  change('엔트리 확인 감독', '가상 감독');
  fireEvent.click(screen.getByLabelText(/양 팀 선발 10명/));
};

it('기본 직접 구성을 유지하고 랜덤 초안을 타순 조정·감독 확인 후 경기로 생성한다', () => {
  const data = createDemoWorkspace(),
    before = structuredClone(data),
    create = vi.fn((_game: Game) => true);
  render(<NewGame data={data} onCreate={create} onClose={() => {}} />);
  expect(screen.getByRole('button', { name: '직접 구성' })).toHaveAttribute('aria-pressed', 'true');
  click('랜덤 구성');
  expect(screen.getByRole('button', { name: '랜덤 구성 적용' })).toBeDisabled();
  click('검색 결과 선택 · 24명');
  click('랜덤 구성 적용');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 10/10명' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '후공 엔트리 · 10/10명' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  const second = screen.getAllByRole('button', { name: /타순 위로$/ })[1];
  const movedName = second.getAttribute('aria-label')!.replace(' 타순 위로', '');
  fireEvent.click(second);
  confirm();
  click('경기 생성');
  const game = create.mock.calls[0][0] as Game;
  expect(() => validateEntry(game)).not.toThrow();
  expect(game.lineups.away[0]).toBe(data.players.find((p) => p.name === movedName)!.id);
  expect(game.rosters.away).toHaveLength(12);
  expect(game.rosters.home).toHaveLength(12);
  expect(new Set([...game.rosters.away, ...game.rosters.home]).size).toBe(24);
  expect(Object.keys(replayGame(game, []).defense.away)).toHaveLength(10);
  expect(data).toEqual(before);
});

it('학년·반 선택을 합치고 필터 밖 선택 인원을 알려준 뒤 정확히 20명을 나눈다', () => {
  const data = createDemoWorkspace(),
    create = vi.fn((_game: Game) => true);
  data.players = data.players.map((p, i) => ({
    ...p,
    grade: 2,
    classroom: i < 10 ? '1' : i < 20 ? '2' : '3',
  }));
  render(<NewGame data={data} onCreate={create} onClose={() => {}} />);
  click('랜덤 구성');
  change('랜덤 선수 학년', '2');
  change('랜덤 선수 반', '1');
  click('검색 결과 선택 · 10명');
  expect(screen.getByRole('button', { name: '랜덤 구성 적용' })).toBeDisabled();
  change('랜덤 선수 반', '2');
  expect(screen.getByText(/필터 밖 선택 10명/)).toBeInTheDocument();
  click('검색 결과 선택 · 10명');
  click('랜덤 구성 적용');
  confirm();
  click('경기 생성');
  const game = create.mock.calls[0][0] as Game;
  expect([...game.rosters.away, ...game.rosters.home].sort()).toEqual(
    data.players
      .slice(0, 20)
      .map((p) => p.id)
      .sort(),
  );
});

it('결석·삭제·출전 불가 학생을 랜덤 대상에서 제외하며 같은 팀끼리는 적용하지 않는다', () => {
  const data = createDemoWorkspace();
  data.players[0].active = false;
  data.players[1].archivedAt = '2026-11-16T00:00:00Z';
  render(<NewGame data={data} onCreate={() => true} onClose={() => {}} />);
  click('등록 선수 불러오기');
  change('샘플 선수 03 경기 상태', 'absent');
  click('랜덤 구성');
  const picker = within(screen.getByRole('region', { name: '랜덤 구성 대상 선택' }));
  expect(picker.queryByLabelText('샘플 선수 01 랜덤 대상 선택')).not.toBeInTheDocument();
  expect(picker.queryByLabelText('샘플 선수 02 랜덤 대상 선택')).not.toBeInTheDocument();
  expect(picker.queryByLabelText('샘플 선수 03 랜덤 대상 선택')).not.toBeInTheDocument();
  click('검색 결과 선택 · 21명');
  change('후공 팀', 'green');
  expect(screen.getByRole('button', { name: '랜덤 구성 적용' })).toBeDisabled();
  expect(screen.getByText('서로 다른 선공·후공 팀을 선택하세요.')).toBeInTheDocument();
});

it('재추첨은 감독 확인을 해제하고 되돌리기는 직전 수동 편성을 복구한다', () => {
  render(<NewGame data={createDemoWorkspace()} onCreate={() => true} onClose={() => {}} />);
  click('등록 선수 불러오기');
  click('샘플 선수 01 선발 선택');
  change('엔트리 유격수', 'green-1');
  click('랜덤 구성');
  click('검색 결과 선택 · 24명');
  click('랜덤 구성 적용');
  confirm();
  click('이전 편성으로 되돌리기');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 1/10명' })).toBeInTheDocument();
  expect(screen.getByLabelText('엔트리 유격수')).toHaveValue('green-1');
  expect(screen.getByLabelText(/양 팀 선발 10명/)).not.toBeChecked();
  click('랜덤 구성 적용');
  confirm();
  click('랜덤 구성 적용');
  expect(screen.getByLabelText(/양 팀 선발 10명/)).not.toBeChecked();
  click('직접 구성');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 10/10명' })).toBeInTheDocument();
});

it('경기 저장 실패 시 랜덤 편성과 입력을 유지하고 창을 닫지 않는다', () => {
  const close = vi.fn(),
    create = vi.fn(() => false);
  render(<NewGame data={createDemoWorkspace()} onCreate={create} onClose={close} />);
  click('랜덤 구성');
  click('검색 결과 선택 · 24명');
  click('랜덤 구성 적용');
  confirm();
  click('경기 생성');
  expect(create).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '선공 엔트리 · 10/10명' })).toBeInTheDocument();
  expect(screen.getByLabelText('엔트리 확인 감독')).toHaveValue('가상 감독');
});

it('생성·새로고침·백업 복원에도 기존 선수·평가·경기 원본을 보존한다', () => {
  const original = createDemoWorkspace();
  const day = addClassGroup(original, localDate(), playerGroup(original.players[0]));
  original.classDays = [
    markAttendance(
      day,
      day.students.map((s) => s.playerId),
      'present',
    ),
  ];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  const app = render(<App />);
  click('경기 기록실');
  click('새 경기');
  change('경기 이름', '랜덤 검증 경기');
  click('랜덤 구성');
  click('검색 결과 선택 · 24명');
  click('랜덤 구성 적용');
  confirm();
  click('경기 생성');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Workspace;
  expect(saved.games).toHaveLength(original.games.length + 1);
  expect(saved.games[0]).toEqual(original.games[0]);
  expect(saved.players).toEqual(original.players);
  expect(saved.events).toEqual(original.events);
  expect(saved.assessments).toEqual(original.assessments);
  const restored = readBackup(serializeBackup(saved));
  expect(restored.games).toEqual(saved.games);
  app.unmount();
  render(<App />);
  click('경기 기록실');
  click('랜덤 검증 경기 경기 열기');
  expect(screen.getByRole('heading', { name: '랜덤 검증 경기', level: 1 })).toBeInTheDocument();
});
