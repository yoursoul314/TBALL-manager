import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { POSITIONS } from '../config/positions';
import { applyApprovedEntry } from './approvedEntry';
import type { EntryDraft } from './entryBatch';
export const emptyEntry = (): EntryDraft => ({
  loaded: false,
  assigned: [],
  status: {},
  lineup: [],
  defense: {},
});
export function approvedFixture() {
  const d = createDemoWorkspace();
  d.selections = d.teams.slice(0, 2).map((team, side) => ({
    id: 'approved-' + side,
    teamId: team.id,
    createdAt: '2026-10-27T00:00:00Z',
    policyVersion: d.policy.version,
    sourceRevision: 0,
    status: 'approved' as const,
    approvedBy: '가상 QA',
    approvedAt: '2026-10-27T00:00:00Z',
    method: 'manual' as const,
    assignments: POSITIONS.map((position, i) => ({
      position,
      playerId: d.players.filter((p) => p.teamId === team.id)[i].id,
      score: null,
    })),
  }));
  return d;
}
it('승인 스냅샷은 다시 계산하지 않고 선발·수비에 적용하며 원본과 후보를 보존한다', () => {
  const d = approvedFixture(),
    raw = JSON.stringify(d),
    plan = d.selections[0];
  const ids = plan.assignments.map((a) => a.playerId),
    spare = d.players[10].id;
  const draft = {
    ...emptyEntry(),
    assigned: [ids[2], ids[0], spare],
    lineup: [ids[2], ids[0]],
    status: {
      [ids[2]]: 'starter' as const,
      [ids[0]]: 'starter' as const,
      [spare]: 'reserve' as const,
    },
  };
  const next = applyApprovedEntry({ ...d, revision: 99 }, plan.teamId, plan.id, draft, []);
  expect(next.lineup.slice(0, 2)).toEqual([ids[2], ids[0]]);
  expect(next.lineup).toHaveLength(10);
  expect(next.status[spare]).toBe('reserve');
  expect(next.defense).toEqual(
    Object.fromEntries(plan.assignments.map((a) => [a.position, a.playerId])),
  );
  expect(JSON.stringify(d)).toBe(raw);
  expect(draft.lineup).toHaveLength(2);
});
it('초안·다른 팀·중복·미완성·삭제·출전 불가·결석·상대팀 충돌은 부분 적용 없이 차단한다', () => {
  const base = approvedFixture(),
    plan = base.selections[0],
    id = plan.assignments[0].playerId;
  for (const mutate of [
    (d: typeof base) => {
      d.selections[0].status = 'draft';
    },
    (d: typeof base) => {
      d.selections[0].teamId = d.teams[1].id;
    },
    (d: typeof base) => {
      d.selections[0].assignments[1].playerId = id;
    },
    (d: typeof base) => {
      d.selections[0].assignments.pop();
    },
    (d: typeof base) => {
      d.players.find((p) => p.id === id)!.active = false;
    },
    (d: typeof base) => {
      d.players.find((p) => p.id === id)!.archivedAt = '2026-10-27T00:00:00Z';
    },
  ]) {
    const d = structuredClone(base);
    mutate(d);
    expect(() => applyApprovedEntry(d, plan.teamId, plan.id, emptyEntry(), [])).toThrow();
  }
  expect(() => applyApprovedEntry(base, plan.teamId, plan.id, emptyEntry(), [id])).toThrow('상대');
  expect(() =>
    applyApprovedEntry(
      base,
      plan.teamId,
      plan.id,
      { ...emptyEntry(), status: { [id]: 'absent' } },
      [],
    ),
  ).toThrow('결석');
});
