import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  emptyDefenseObservations,
  saveDefenseAssessment,
  summarizeDefenseAssessments,
} from './defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC, type DefenseInput } from '../domain/defenseAssessment';
import { parseWorkspace } from '../data/schema';
import { migrateWorkspace } from '../data/migration';
import { readBackup, serializeBackup, LocalWorkspaceRepository } from '../data/repository';
import { resetWorkspace } from '../domain/reset';
import { archiveSelection, planPermanentDeletion } from '../domain/management';
const at = '2026-10-27T02:00:00.000Z';
const input = (): DefenseInput => ({
  date: '2026-10-27',
  situation: 'ground',
  assessor: 'QA',
  note: '',
  error: null,
  rubric: { ...DEFAULT_DEFENSE_RUBRIC },
  observations: emptyDefenseObservations(),
});
const meta = (id: string) => ({ id, revisionId: id + '-rev', at, author: 'QA', reason: '관찰' });
it('포구와 송구를 독립적으로 기록하고 실책을 이중 감점하지 않는다', () => {
  const original = createDemoWorkspace(),
    i = input();
  i.observations.G = 'success';
  i.observations.A = 'failure';
  i.error = 'throwing';
  const d = saveDefenseAssessment(original, 'green-1', i, meta('one')),
    s = summarizeDefenseAssessments(d, 'green-1');
  expect(s.abilities.G.score).toBe(100);
  expect(s.abilities.A.score).toBe(0);
  expect(s.abilities.C.score).toBeNull();
  expect(d.assessments).toEqual(original.assessments);
  expect(d.events).toEqual(original.events);
  expect(d.selections).toEqual(original.selections);
  expect(original.defenseAssessments).toEqual([]);
});
it('부분 수행·실패만 유효 기회로 계산하고 미관찰·기회 없음은 분모에서 제외한다', () => {
  let d = createDemoWorkspace();
  for (const [index, outcome] of (
    ['success', 'partial', 'failure', 'not-offered', null] as const
  ).entries()) {
    const i = input();
    i.observations.G = outcome;
    d = saveDefenseAssessment(d, 'green-1', i, meta('r' + index));
  }
  const a = summarizeDefenseAssessments(d, 'green-1').abilities.G;
  expect(a).toMatchObject({
    score: 50,
    count: 3,
    success: 1,
    partial: 1,
    failure: 1,
    notOffered: 1,
    unobserved: 1,
  });
});
it('날짜 평균이 아닌 전체 관찰 기회로 계산하며 기록 당시 배점을 보존한다', () => {
  let d = createDemoWorkspace();
  for (let n = 0; n < 3; n++) {
    const i = input();
    i.date = n === 0 ? '2026-10-26' : '2026-10-27';
    i.observations.G = n === 0 ? 'success' : 'partial';
    i.rubric =
      n === 0
        ? { ...DEFAULT_DEFENSE_RUBRIC }
        : { version: 'defense-checklist-trial-v1', success: 4, partial: 1, failure: 0 };
    d = saveDefenseAssessment(d, 'green-1', i, meta('r' + n));
  }
  const s = summarizeDefenseAssessments(d, 'green-1');
  expect(s.abilities.G.score).toBe(50);
  expect(s.mixedRubrics).toBe(true);
  expect(d.defenseAssessments[0].revisions[0].rubric.success).toBe(2);
});
it('정정·취소·복원은 원본 이력을 유지하며 최신 유효 기록으로 재계산한다', () => {
  const i = input();
  i.observations.G = 'success';
  let d = saveDefenseAssessment(createDemoWorkspace(), 'green-1', i, meta('one'));
  const original = structuredClone(d.defenseAssessments[0].revisions[0]);
  i.observations.G = 'partial';
  d = saveDefenseAssessment(d, 'green-1', i, meta('two'), 'one');
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBe(50);
  d = saveDefenseAssessment(d, 'green-1', i, meta('three'), 'one', true);
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBeNull();
  d = saveDefenseAssessment(d, 'green-1', i, meta('four'), 'one');
  expect(summarizeDefenseAssessments(d, 'green-1').abilities.G.score).toBe(50);
  expect(d.defenseAssessments[0].revisions[0]).toEqual(original);
  expect(d.defenseAssessments[0].revisions).toHaveLength(4);
  expect(() => saveDefenseAssessment(d, 'green-1', i, meta('one'))).toThrow('이미 저장');
  expect(() =>
    saveDefenseAssessment(d, 'green-1', i, { ...meta('five'), reason: '' }, 'one'),
  ).toThrow('사유');
});
it('v7 이전과 JSON 백업·새 저장소 로드에서 원본·수동 평가·체크 이력을 보존한다', () => {
  const old = { ...createDemoWorkspace(), schemaVersion: 7 };
  const raw = JSON.stringify(old),
    migrated = migrateWorkspace(old, raw);
  expect(migrated.defenseAssessments).toEqual([]);
  expect(migrated.migrationSource?.raw).toBe(raw);
  expect(migrated.assessments).toEqual(old.assessments);
  const i = input();
  i.observations.G = 'success';
  const d = saveDefenseAssessment(migrated, 'green-1', i, meta('one'));
  expect(readBackup(serializeBackup(d))).toEqual(d);
  const map = new Map<string, string>(),
    storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
  const saved = new LocalWorkspaceRepository(storage).save(d, d.revision);
  expect(new LocalWorkspaceRepository(storage).load()).toEqual(saved);
});
it('잘못된 배점·관찰값·원본 이력·학생 참조를 백업 검증에서 거부한다', () => {
  const i = input();
  i.observations.G = 'success';
  const d = saveDefenseAssessment(createDemoWorkspace(), 'green-1', i, meta('one'));
  const bad = structuredClone(d);
  bad.defenseAssessments[0].revisions[0].rubric.success = 0;
  expect(() => parseWorkspace(bad)).toThrow();
  bad.defenseAssessments[0] = structuredClone(d.defenseAssessments[0]);
  bad.defenseAssessments[0].playerId = 'missing';
  expect(() => parseWorkspace(bad)).toThrow('선수');
  bad.defenseAssessments[0] = structuredClone(d.defenseAssessments[0]);
  bad.defenseAssessments[0].revisions[0].changedAt = '2026-10-26T02:00:00.000Z';
  expect(() => parseWorkspace(bad)).toThrow();
});
it('선수 완전삭제는 그 선수의 수비 이력만 제거하며 평가 초기화 범위도 적용한다', () => {
  let d = createDemoWorkspace();
  const i = input();
  i.observations.G = 'success';
  d = saveDefenseAssessment(d, 'green-1', i, meta('one'));
  d = saveDefenseAssessment(d, 'green-2', i, meta('two'));
  expect(resetWorkspace(d, 'games', at).defenseAssessments).toEqual(d.defenseAssessments);
  expect(resetWorkspace(d, 'evaluations', at).defenseAssessments).toEqual([]);
  d = archiveSelection(d, 'players', ['green-1'], true, at);
  const plan = planPermanentDeletion(d, 'players', ['green-1']);
  expect(plan.counts.defenseAssessments).toBe(1);
  expect(plan.workspace.defenseAssessments[0].playerId).toBe('green-2');
});
