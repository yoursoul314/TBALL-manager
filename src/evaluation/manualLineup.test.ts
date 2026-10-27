import { expect, it, beforeEach } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { placePlayer, saveManualLineup, approveLineup, type Placement } from './manualLineup';
import { POSITIONS } from '../config/positions';
import { parseWorkspace } from '../data/schema';
import {
  LocalWorkspaceRepository,
  V9_STORAGE_KEY,
  STORAGE_KEY,
  readBackup,
  serializeBackup,
} from '../data/repository';
import { archiveSelection, planPermanentDeletion } from '../domain/management';
const at = '2026-10-27T05:00:00.000Z';
beforeEach(() => localStorage.clear());
it('배치된 학생을 옮기면 서로 교환하고 빈 자리로 옮기면 이전 자리를 비운다', () => {
  const original: Placement = { '1B': 'green-1', '2B': 'green-2' };
  expect(placePlayer(original, '1B', 'green-2')).toEqual({ '1B': 'green-2', '2B': 'green-1' });
  expect(placePlayer(original, 'SS', 'green-1')).toEqual({ SS: 'green-1', '2B': 'green-2' });
  expect(placePlayer(original, '1B', '')).toEqual({ '2B': 'green-2' });
  expect(original['1B']).toBe('green-1');
});
it('v9 원문·날짜 평가를 보존하고 미측정 수동 배치를 저장·복원한다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 9 };
  old.assessments = [];
  old.selections = [
    {
      id: 'legacy-approved',
      teamId: old.teams[0].id,
      createdAt: at,
      policyVersion: old.policy.version,
      sourceRevision: 0,
      assignments: POSITIONS.map((position, i) => ({
        position,
        playerId: old.players[i].id,
        score: 50,
      })),
      status: 'approved',
      approvedBy: ' ',
      approvedAt: at,
    },
  ];
  const raw = JSON.stringify(old);
  localStorage.setItem(V9_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    d = repo.load()!;
  expect(d.schemaVersion).toBe(12);
  expect(d.migrationSource?.raw).toBe(raw);
  expect(d.defenseDays).toEqual(old.defenseDays);
  const next = repo.save(
    saveManualLineup(d, d.teams[0].id, { '1B': 'green-1' }, 'manual', at),
    d.revision,
  );
  expect(next.selections.at(-1)!.assignments[0].score).toBeNull();
  expect(next.selections[0]).toEqual(old.selections[0]);
  expect(repo.load()).toEqual(next);
  expect(readBackup(serializeBackup(next))).toEqual(next);
  expect(localStorage.getItem(V9_STORAGE_KEY)).toBe(raw);
  expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  expect(() => approveLineup(next, 'manual', 'QA', at)).toThrow('10명');
  localStorage.setItem(V9_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(next, next.revision)).toThrow('구버전');
});
it('10명 감독 승인 이후 수정은 새 초안으로 남고 이전 승인안을 보존한다', () => {
  const d = createDemoWorkspace(),
    places = Object.fromEntries(POSITIONS.map((p, i) => [p, d.players[i].id]));
  let saved = saveManualLineup(d, d.teams[0].id, places, 'original', at);
  saved.revision++;
  const approved = approveLineup(saved, 'original', 'QA', at);
  approved.revision++;
  const next = saveManualLineup(
    approved,
    d.teams[0].id,
    placePlayer(places, '1B', places['2B']),
    'changed',
    at,
    'original',
  );
  expect(next.selections[0].status).toBe('approved');
  expect(next.selections[1]).toMatchObject({
    status: 'draft',
    method: 'manual',
    approvedBy: null,
    editedFrom: 'original',
  });
  expect(() =>
    approveLineup({ ...saved, revision: saved.revision + 1 }, 'original', 'QA', at),
  ).toThrow('변경');
  expect(() =>
    saveManualLineup(d, d.teams[0].id, { '1B': 'green-1', '2B': 'green-1' }, 'dup', at),
  ).toThrow('중복');
  d.players[0].active = false;
  expect(() => saveManualLineup(d, d.teams[0].id, { '1B': 'green-1' }, 'bad', at)).toThrow('출전');
});
it('이전 배치에만 있던 학생 완전삭제 후 새 배치와 백업이 유효하다', () => {
  let d = createDemoWorkspace();
  d = saveManualLineup(d, d.teams[0].id, { '1B': 'green-1' }, 'old', at);
  d = saveManualLineup(d, d.teams[0].id, { '1B': 'green-2' }, 'new', at, 'old');
  d = archiveSelection(d, 'players', ['green-1'], true, at);
  const next = planPermanentDeletion(d, 'players', ['green-1']).workspace;
  expect(next.selections).toHaveLength(1);
  expect(next.selections[0].editedFrom).toBeUndefined();
  expect(parseWorkspace(next)).toEqual(next);
});

it('v9에서 저장 공간 부족이 나도 원문과 기존 기록을 그대로 남긴다', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 9 });
  localStorage.setItem(V9_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => localStorage.getItem(k),
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => repo.load()).toThrow('quota');
  expect(localStorage.getItem(V9_STORAGE_KEY)).toBe(raw);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
