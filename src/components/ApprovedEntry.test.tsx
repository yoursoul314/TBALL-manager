import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NewGame } from './NewGame';
import { createDemoWorkspace } from '../data/seed';
import { POSITIONS } from '../config/positions';
import { initialState } from '../engine/game';
import { parseWorkspace } from '../data/schema';
import { readBackup, serializeBackup } from '../data/repository';
import type { Game } from '../domain/model';
afterEach(cleanup);
it('양 팀 승인안 불러오기 → 타순 수동 변경 → 생성 → 경기 수비·백업 스냅샷 보존', () => {
  const d = createDemoWorkspace();
  d.selections = d.teams
    .slice(0, 2)
    .map((t, side) => ({
      id: 'approved-' + side,
      teamId: t.id,
      createdAt: '2026-10-27T00:00:00Z',
      policyVersion: d.policy.version,
      sourceRevision: 0,
      status: 'approved',
      approvedBy: 'QA',
      approvedAt: '2026-10-27T00:00:00Z',
      method: 'manual',
      assignments: POSITIONS.map((position, i) => ({
        position,
        playerId: d.players.filter((p) => p.teamId === t.id)[i].id,
        score: null,
      })),
    }));
  const original = structuredClone(d.selections),
    create = vi.fn();
  render(<NewGame data={d} onCreate={create} onClose={() => {}} />);
  const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
  click('승인 배치안 적용');
  click('샘플 선수 02 타순 위로');
  expect(screen.getByLabelText('엔트리 1루수')).toHaveValue('green-1');
  click('후공 엔트리 · 0/10명');
  click('승인 배치안 적용');
  fireEvent.change(screen.getByLabelText('엔트리 확인 감독'), { target: { value: 'QA' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /양 팀 선발/ }));
  click('경기 생성');
  expect(create).toHaveBeenCalledTimes(1);
  const game: Game = create.mock.calls[0][0];
  expect(game.lineups.away.slice(0, 2)).toEqual(['green-2', 'green-1']);
  expect(game.rosters.away).toHaveLength(10);
  expect(game.rosters.home).toHaveLength(10);
  expect(initialState(game).defense).toEqual(game.entry!.defense);
  expect(game.entry!.defense.away['1B']).toBe('green-1');
  expect(d.selections).toEqual(original);
  const next = parseWorkspace({ ...d, games: [...d.games, game] });
  expect(readBackup(serializeBackup(next)).games.at(-1)).toEqual(game);
});
