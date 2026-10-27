import { expect, it } from 'vitest';
import { blankFungo, fungoScores } from '../domain/fungo';
import { saveFungo, latestFungo } from './fungo';
import { createDemoWorkspace } from '../data/seed';
import { migrateWorkspace } from '../data/migration';
import { parseWorkspace } from '../data/schema';
import { serializeBackup, readBackup, LocalWorkspaceRepository } from '../data/repository';
import { resetWorkspace } from '../domain/reset';
import { archiveSelection, planPermanentDeletion } from '../domain/management';
import { calculateStats } from '../statistics/calculate';
const at = '2026-10-27T01:00:00Z',
  meta = (id: string) => ({ id: 'fungo', revisionId: id, at, reason: '관찰 정정' });
it('5구 땅볼·뜬공·스쿱 독립 환산, 송구/강도 별도, 미관찰 null', () => {
  const input = blankFungo('2026-10-27', 'QA');
  expect(input.balls.map((b) => b.kind)).toEqual(['G', 'G', 'F', 'C', 'G']);
  expect(Object.values(fungoScores(input))).toEqual([null, null, null, null, null]);
  input.balls[0].catch = 3;
  input.balls[1].catch = 0;
  input.balls[2].catch = 2;
  input.balls[3].catch = 1;
  input.balls[0].throw = 3;
  input.balls[1].throw = 0;
  input.balls[0].power = 8;
  input.balls[4].power = 4;
  const s = fungoScores(input);
  expect(s.G).toBe(5);
  expect(s.F).toBeCloseTo(20 / 3);
  expect(s.C).toBeCloseTo(10 / 3);
  expect(s.T_acc).toBe(5);
  expect(s.T_pow).toBe(6);
});
it('정밀 점수는 간편 모드의 실제 관찰을 변경하지 않음', () => {
  const i = blankFungo('2026-10-27', 'QA');
  i.balls[0].catch = 3;
  i.mode = 'precise';
  i.manual = { G: 5, F: 6, C: 7, T_acc: 8, T_pow: 9 };
  expect(fungoScores(i)).toEqual(i.manual);
  i.mode = 'quick';
  expect(fungoScores(i).G).toBe(10);
  expect(fungoScores(i).F).toBeNull();
});
it('날짜별 원본+수정+취소+복원·중복 방지·백업 및 새로고침 보존', () => {
  const old = createDemoWorkspace(),
    input = blankFungo('2026-10-27', 'QA');
  input.balls[0].catch = 3;
  let d = saveFungo(old, 'green-1', input, meta('r1'));
  d = saveFungo(
    d,
    'green-1',
    { ...input, mode: 'precise', manual: { G: 4, F: 5, C: 6, T_acc: 7, T_pow: 8 } },
    meta('r2'),
  );
  expect(d.fungoAssessments).toHaveLength(1);
  expect(d.fungoAssessments[0].revisions[0].balls[0].catch).toBe(3);
  expect(latestFungo(d, 'green-1').scores.G).toBe(4);
  d = saveFungo(d, 'green-1', input, meta('r3'), true);
  expect(latestFungo(d, 'green-1').scores.G).toBeNull();
  d = saveFungo(d, 'green-1', input, meta('r4'));
  expect(latestFungo(d, 'green-1').scores.G).toBe(10);
  expect(d.fungoAssessments[0].revisions).toHaveLength(4);
  expect(readBackup(serializeBackup(d))).toEqual(d);
  localStorage.clear();
  const repo = new LocalWorkspaceRepository(localStorage);
  const saved = repo.save(d, 0);
  expect(new LocalWorkspaceRepository(localStorage).load()).toEqual(saved);
  expect(calculateStats(d.games[0], d.events, d.policy)).toEqual(
    calculateStats(old.games[0], old.events, old.policy),
  );
  expect(d.assessments).toEqual(old.assessments);
  expect(d.defenseAssessments).toEqual(old.defenseAssessments);
  const duplicated = structuredClone(d);
  duplicated.fungoAssessments.push({ ...duplicated.fungoAssessments[0], id: 'another' });
  expect(() => parseWorkspace(duplicated)).toThrow('중복');
});
it('v11 원문, 선호 미설정, 기존 9능력 보존 및 초기화/선수 완전삭제 연결', () => {
  const old = createDemoWorkspace();
  const raw = JSON.stringify({
      ...old,
      schemaVersion: 11,
      fungoDays: undefined,
      fungoAssessments: undefined,
    }),
    d = migrateWorkspace(JSON.parse(raw), raw);
  expect(d.migrationSource?.raw).toBe(raw);
  expect(d.fungoAssessments).toEqual([]);
  expect(d.players[0].pref1).toBeUndefined();
  expect(d.assessments).toEqual(old.assessments);
  const input = blankFungo('2026-10-27', 'QA');
  input.balls[0].catch = 2;
  const next = saveFungo(
    { ...d, fungoDays: [{ date: input.date, assessor: 'QA', playerIds: ['green-1'] }] },
    'green-1',
    input,
    meta('r'),
  );
  expect(resetWorkspace(next, 'evaluations', at).fungoAssessments).toEqual([]);
  expect(resetWorkspace(next, 'games', at).fungoAssessments).toEqual(next.fungoAssessments);
  const archived = archiveSelection(next, 'players', ['green-1'], true, at);
  const plan = planPermanentDeletion(archived, 'players', ['green-1']);
  expect(plan.workspace.fungoAssessments).toEqual([]);
  expect(plan.workspace.fungoDays[0].playerIds).toEqual([]);
});
it('잘못된 채점·동일 지망·수정자/사유 누락 차단', () => {
  const d = createDemoWorkspace(),
    i = blankFungo('2026-10-27', 'QA');
  expect(() => saveFungo(d, 'green-1', i, meta('x'))).toThrow('입력');
  i.balls[0].catch = 4;
  expect(() => saveFungo(d, 'green-1', i, meta('x'))).toThrow();
  i.balls[0].catch = 3;
  const saved = saveFungo(d, 'green-1', i, meta('x'));
  expect(() => saveFungo(saved, 'green-1', i, { ...meta('y'), reason: '' })).toThrow('사유');
  expect(() =>
    parseWorkspace({ ...d, players: d.players.map((p) => ({ ...p, pref1: 'SS', pref2: 'SS' })) }),
  ).toThrow('다르게');
});
