import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NewGame } from './NewGame';
import { createDemoWorkspace } from '../data/seed';
import { captureLegacyEntry, validateEntry } from '../domain/roster';
import { POSITIONS } from '../config/positions';
import type { Game } from '../domain/model';
import { readBackup, serializeBackup } from '../data/repository';
afterEach(cleanup);
it('동일 날짜에서 경기일 없는 과거 기록보다 최근 생성 경기를 먼저 선택한다', () => {
  const d = fixture();
  d.games[0].createdAt = '2026-11-16T01:00:00Z';
  d.games[0].playedOn = null;
  const recent = structuredClone(d.games[0]);
  recent.id = 'recent';
  recent.playedOn = '2026-11-16';
  recent.createdAt = '2026-11-16T02:00:00Z';
  d.games.push(recent);
  render(<NewGame data={d} onCreate={() => true} onClose={() => {}} />);
  expect(screen.getByLabelText('지난 경기 편성')).toHaveValue('recent');
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const approve = () => {
  change('엔트리 확인 감독', '가상 감독');
  fireEvent.click(screen.getByRole('checkbox', { name: /양 팀 선발/ }));
};
function fixture() {
  const d = createDemoWorkspace(),
    g = d.games[0];
  g.entry = captureLegacyEntry(g, d);
  g.entry!.captains = { away: 'green-1', home: 'orange-1' };
  for (const side of ['away', 'home'] as const)
    g.entry!.defense[side] = Object.fromEntries(POSITIONS.map((p, i) => [p, g.lineups[side][i]]));
  return d;
}
it('지난 경기 불러오기→주장·선수·타순·수비 수정→새 경기 저장·백업, 과거 경기 보존', () => {
  const d = fixture(),
    before = structuredClone(d),
    create = vi.fn((_g: Game) => true);
  render(<NewGame data={d} onCreate={create} onClose={() => {}} />);
  change('경기 날짜', '2026-11-20');
  fireEvent.click(screen.getByText('지난 경기 편성 불러오기', { exact: true }));
  click('선택한 경기 편성 불러오기');
  expect(screen.getByLabelText('선공 주장')).toHaveValue('green-1');
  expect(screen.getByLabelText('경기 날짜')).toHaveValue('2026-11-20');
  expect(screen.getByLabelText('엔트리 1루수')).toHaveValue('green-1');
  approve();
  change('선공 주장', 'green-2');
  expect(screen.getByRole('checkbox', { name: /양 팀 선발/ })).not.toBeChecked();
  change('샘플 선수 01 경기 상태', 'not-playing');
  change('샘플 선수 11 경기 상태', 'starter');
  change('엔트리 1루수', 'green-11');
  click('샘플 선수 03 타순 위로');
  approve();
  click('경기 생성');
  const saved = create.mock.calls[0][0];
  expect(saved.entry!.captains).toEqual({ away: 'green-2', home: 'orange-1' });
  expect(saved.lineups.away[0]).toBe('green-3');
  expect(saved.lineups.away).not.toContain('green-1');
  expect(saved.entry!.defense.away['1B']).toBe('green-11');
  expect(() => validateEntry(saved)).not.toThrow();
  expect(readBackup(serializeBackup({ ...d, games: [...d.games, saved] })).games.at(-1)).toEqual(
    saved,
  );
  expect(d).toEqual(before);
});
it('불러온 주장을 선발에서 빼면 저장 차단, 해제 후 저장 실패에도 편성·주장 유지', () => {
  const close = vi.fn(),
    create = vi.fn(() => false);
  render(<NewGame data={fixture()} onCreate={create} onClose={close} />);
  fireEvent.click(screen.getByText('지난 경기 편성 불러오기', { exact: true }));
  click('선택한 경기 편성 불러오기');
  change('샘플 선수 01 경기 상태', 'not-playing');
  change('샘플 선수 11 경기 상태', 'starter');
  approve();
  expect(screen.getByRole('button', { name: '경기 생성' })).toBeDisabled();
  change('선공 주장', 'green-2');
  approve();
  click('경기 생성');
  expect(create).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('선공 주장')).toHaveValue('green-2');
  expect(screen.getByLabelText('샘플 선수 11 경기 상태')).toHaveValue('starter');
});
it('주장 미기록 경기의 명단은 불러오고 주장은 미지정으로 안내한다', () => {
  render(<NewGame data={createDemoWorkspace()} onCreate={() => true} onClose={() => {}} />);
  fireEvent.click(screen.getByText('지난 경기 편성 불러오기', { exact: true }));
  click('선택한 경기 편성 불러오기');
  expect(screen.getByLabelText('선공 주장')).toHaveValue('');
  expect(screen.getByRole('status')).toHaveTextContent('주장 정보가 저장되지 않았습니다');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 10/10명' })).toBeInTheDocument();
});
it('희망 반영 체크→랜덤→주장 고정·1지망 충족 수비→편성 수동 수정과 저장', () => {
  const d = createDemoWorkspace(),
    create = vi.fn((_g: Game) => true);
  d.players.forEach((p, i) => {
    p.pref1 = POSITIONS[(i % 12) % 10];
    p.active = i % 12 < 10;
  });
  render(<NewGame data={d} onCreate={create} onClose={() => {}} />);
  change('선공 주장', 'green-1');
  change('후공 주장', 'orange-1');
  click('랜덤 구성');
  fireEvent.click(screen.getByRole('checkbox', { name: '희망 포지션 반영' }));
  click('검색 결과 선택 · 18명');
  click('랜덤 구성 적용');
  expect(screen.getByLabelText('희망 포지션 배치 현황')).toHaveTextContent('1지망 20명');
  expect(screen.getByLabelText('엔트리 1루수')).toHaveValue('green-1');
  click('직접 구성');
  change('엔트리 1루수', '');
  expect(screen.getByLabelText('희망 포지션 배치 현황')).toHaveTextContent('1지망 19명');
  change('엔트리 1루수', 'green-1');
  approve();
  click('경기 생성');
  const g = create.mock.calls[0][0];
  expect(g.entry!.captains).toEqual({ away: 'green-1', home: 'orange-1' });
  for (const side of ['away', 'home'] as const)
    for (const [pos, id] of Object.entries(g.entry!.defense[side]))
      expect(d.players.find((p) => p.id === id)?.pref1).toBe(pos);
});
