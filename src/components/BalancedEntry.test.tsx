import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NewGame } from './NewGame';
import { createDemoWorkspace } from '../data/seed';
import type { Game } from '../domain/model';
import { balanceProfiles, teamScoreSummary } from '../evaluation/teamBalance';
import { validateEntry } from '../domain/roster';
import { readBackup, serializeBackup } from '../data/repository';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const confirm = () => {
  change('엔트리 확인 감독', '가상 감독');
  fireEvent.click(screen.getByLabelText(/양 팀 선발 10명/));
};

it('주장 터치 선택·중복 방지·두 방식 재구성·직접 조정 후 생성까지 유지한다', () => {
  const data = createDemoWorkspace();
  const create = vi.fn((_game: Game) => true);
  render(<NewGame data={data} onCreate={create} onClose={() => {}} />);
  click('랜덤 구성');
  change('선공 주장', 'green-1');
  const home = screen.getByLabelText('후공 주장') as HTMLSelectElement;
  expect([...home.options].find((o) => o.value === 'green-1')!.disabled).toBe(true);
  change('후공 주장', 'orange-1');
  expect(screen.queryByLabelText('샘플 선수 01 랜덤 대상 선택')).not.toBeInTheDocument();
  click('검색 결과 선택 · 22명');
  click('랜덤 구성 적용');
  expect(screen.getByRole('button', { name: '샘플 선수 01 타순 위로' })).toBeInTheDocument();
  confirm();
  click('실력 균형');
  click('균형 구성 적용');
  expect(screen.getByLabelText(/양 팀 선발 10명/)).not.toBeChecked();
  expect(screen.getByRole('button', { name: '샘플 선수 01 타순 위로' })).toBeInTheDocument();
  click('후공 엔트리 · 10/10명');
  expect(screen.getByRole('button', { name: '샘플 선수 13 타순 위로' })).toBeInTheDocument();
  const up = screen.getAllByRole('button', { name: /타순 위로$/ })[1];
  fireEvent.click(up);
  confirm();
  click('경기 생성');
  const game = create.mock.calls[0][0];
  expect(game.lineups.away).toContain('green-1');
  expect(game.lineups.home).toContain('orange-1');
  expect(() => validateEntry(game)).not.toThrow();
  expect(
    readBackup(serializeBackup({ ...data, games: [...data.games, game] })).games.at(-1),
  ).toEqual(game);
});

it('주장 고정 해제와 팀 변경을 반영하고 조건 변경 시 감독 확인을 해제한다', () => {
  render(<NewGame data={createDemoWorkspace()} onCreate={() => true} onClose={() => {}} />);
  click('랜덤 구성');
  change('선공 주장', 'green-1');
  change('후공 주장', 'orange-1');
  click('검색 결과 선택 · 22명');
  click('랜덤 구성 적용');
  confirm();
  change('선공 주장', '');
  expect(screen.getByLabelText(/양 팀 선발 10명/)).not.toBeChecked();
  fireEvent.click(screen.getByText('참가 학생 선택 · 22명 + 주장 1명'));
  expect(screen.getByLabelText('샘플 선수 01 랜덤 대상 선택')).not.toBeChecked();
  change('후공 팀', 'green');
  expect(screen.getByLabelText('후공 주장')).toHaveValue('');
  expect(screen.getByRole('button', { name: '랜덤 구성 적용' })).toBeDisabled();
});
it('균형 구성·점수 비교·수동 타순 조정·감독 확인 후 기존 스키마로 생성한다', () => {
  const data = createDemoWorkspace();
  data.battingSettings.scoreSource = 'legacy';
  const before = structuredClone(data),
    create = vi.fn((_game: Game) => true);
  render(<NewGame data={data} onCreate={create} onClose={() => {}} />);
  click('랜덤 구성');
  click('실력 균형');
  click('검색 결과 선택 · 24명');
  click('균형 구성 적용');
  expect(screen.getByRole('region', { name: '현재 편성 평가 비교' })).toBeVisible();
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  const second = screen.getAllByRole('button', { name: /타순 위로$/ })[1];
  const name = second.getAttribute('aria-label')!.replace(' 타순 위로', '');
  fireEvent.click(second);
  confirm();
  click('경기 생성');
  const game = create.mock.calls[0][0];
  expect(() => validateEntry(game)).not.toThrow();
  expect(game.lineups.away[0]).toBe(data.players.find((p) => p.name === name)!.id);
  const profiles = balanceProfiles(data, 'nine');
  const a = teamScoreSummary(game.lineups.away, profiles),
    b = teamScoreSummary(game.lineups.home, profiles);
  expect(Math.abs(a.batting.mean! - b.batting.mean!)).toBeLessThan(6);
  expect(Math.abs(a.defense.mean! - b.defense.mean!)).toBeLessThan(6);
  expect(
    readBackup(serializeBackup({ ...data, games: [...data.games, game] })).games.at(-1),
  ).toEqual(game);
  expect(data).toEqual(before);
});
it('점수가 없으면 균형 초안을 만들지 않고 단순 랜덤으로 전환할 수 있다', () => {
  const data = createDemoWorkspace();
  data.assessments = [];
  render(<NewGame data={data} onCreate={() => true} onClose={() => {}} />);
  click('랜덤 구성');
  click('실력 균형');
  click('검색 결과 선택 · 24명');
  click('균형 구성 적용');
  expect(screen.getByText(/선택한 학생의 유효 평가 점수가 없습니다/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '선공 엔트리 · 0/10명' })).toBeInTheDocument();
  click('단순 랜덤');
  click('랜덤 구성 적용');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 10/10명' })).toBeInTheDocument();
});
it('학생 선택 후 상대 팀 슬롯으로 바로 배정하고 추가 선택을 계속할 수 있다', () => {
  render(<NewGame data={createDemoWorkspace()} onCreate={() => true} onClose={() => {}} />);
  click('등록 선수 불러오기');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 일괄 선택'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 일괄 선택'));
  expect(screen.getByRole('region', { name: '선택 선수 빠른 팀 배정' })).toBeVisible();
  click('후공 팀에 빠른 배정');
  expect(screen.getByRole('button', { name: '후공 엔트리 · 2/10명' })).toBeInTheDocument();
  expect(screen.queryByLabelText('샘플 선수 01 일괄 선택')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('샘플 선수 03 일괄 선택'));
  click('선공 팀에 빠른 배정');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 1/10명' })).toBeInTheDocument();
});
it('균형 적용 후 팀 슬롯으로 이동하면 비교 수치와 감독 확인·생성 가능 상태를 갱신한다', () => {
  const data = createDemoWorkspace();
  data.battingSettings.scoreSource = 'legacy';
  render(<NewGame data={data} onCreate={() => true} onClose={() => {}} />);
  click('랜덤 구성');
  click('실력 균형');
  click('검색 결과 선택 · 24명');
  click('균형 구성 적용');
  confirm();
  const name = screen
    .getAllByRole('button', { name: /타순 위로$/ })[0]
    .getAttribute('aria-label')!
    .replace(' 타순 위로', '');
  click('직접 구성');
  fireEvent.click(screen.getByLabelText(name + ' 일괄 선택'));
  click('후공 팀에 빠른 배정');
  expect(screen.getByLabelText(/양 팀 선발 10명/)).not.toBeChecked();
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '선공 엔트리 · 9/10명' })).toBeInTheDocument();
  const summary = screen.getByRole('region', { name: '현재 편성 평가 비교' });
  expect(within(summary).getAllByText(/측정 9\/9명/)).toHaveLength(2);
});
