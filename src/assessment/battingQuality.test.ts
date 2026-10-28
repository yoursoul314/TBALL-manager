import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  blankAttempt,
  createBattingSession,
  recordBattingAttempt,
  reviseBattingAttempt,
  reviseBattingSession,
} from './batting';
import { summarizeBatting } from './battingSummary';
import {
  QUALITY_GRADES,
  QUALITY_SCALE,
  QUALITY_RUBRIC,
  LEGACY_RUBRIC,
  toBatting100,
} from '../config/battingQuality';
import {
  LocalWorkspaceRepository,
  V11_STORAGE_KEY,
  STORAGE_KEY,
  serializeBackup,
  readBackup,
} from '../data/repository';
import { parseWorkspace } from '../data/schema';
import { calculateStats } from '../statistics/calculate';
import { comparisonRows } from '../evaluation/comparison';
import { pairDecision } from '../evaluation/pairDecision';
import type { Workspace } from '../domain/model';
import type { BattingQualityGrade, BattingRubric } from '../domain/batting';
const at = '2026-10-27T02:00:00Z';
const meta = (id: string) => ({ id, at, actor: 'QA', reason: '가상 검증' });
const input = (grade: BattingQualityGrade) => ({
  ...blankAttempt(),
  qualityGrade: grade,
  score: QUALITY_SCALE[grade].score,
  result: QUALITY_SCALE[grade].result,
});
const session = (
  d: Workspace,
  id: string,
  date = '2026-10-27',
  playerId = 'green-1',
  rubricVersion: BattingRubric = QUALITY_RUBRIC,
) =>
  createBattingSession(
    d,
    {
      playerId,
      date,
      targetAttempts: 20,
      assessor: 'QA',
      purpose: '검증',
      note: '',
      rubricVersion,
    },
    meta(id),
  );
it.each(QUALITY_GRADES)('%s 등급의 원점수·결과·100점 환산과 미관찰 null', (grade) => {
  const d = recordBattingAttempt(
    session(createDemoWorkspace(), 's'),
    's',
    1,
    input(grade),
    meta('a'),
  );
  const r = summarizeBatting(d, 'green-1');
  expect(r.count).toBe(1);
  expect(r.batting10).toBeCloseTo(((QUALITY_SCALE[grade].score + 1) / 6) * 10, 10);
  expect(r.average).toBe(QUALITY_SCALE[grade].score);
  expect(r.score).toBeCloseTo(((QUALITY_SCALE[grade].score + 1) / 6) * 100, 10);
  expect(d.battingAttempts[0]).toMatchObject({
    trajectory: null,
    intensity: null,
    contactQuality: null,
    directionZone: null,
  });
});
it('날짜별 단순 평균 대신 실제 횟수 가중 평균, 취소/정정/미측정 재계산', () => {
  let d = session(createDemoWorkspace(), 's1', '2026-10-26');
  d = recordBattingAttempt(d, 's1', 1, input('barrel'), meta('a1'));
  d = session(d, 's2');
  for (let n = 1; n <= 3; n++)
    d = recordBattingAttempt(d, 's2', n, input('tee-miss'), meta('b' + n));
  d = recordBattingAttempt(d, 's2', 4, { ...blankAttempt(), qualityGrade: null }, meta('missing'));
  expect(summarizeBatting(d, 'green-1')).toMatchObject({
    count: 4,
    total: 2,
    average: 0.5,
    score: 25,
  });
  expect(summarizeBatting(d, 'green-1').daily.map((x) => x.count)).toEqual([1, 3]);
  d = reviseBattingAttempt(d, 'a1', input('foul'), meta('edit'));
  expect(summarizeBatting(d, 'green-1').average).toBe(-0.75);
  d = reviseBattingAttempt(d, 'b1', { ...input('tee-miss'), status: 'cancelled' }, meta('cancel'));
  expect(summarizeBatting(d, 'green-1').average).toBeCloseTo(-2 / 3);
  expect(
    d.battingAudit.find((a) => a.entity === 'attempt' && a.originalId === 'a1' && a.before)?.before,
  ).toMatchObject({ score: 5, qualityGrade: 'barrel' });
  d = reviseBattingSession(d, 's2', { status: 'cancelled' }, meta('session-cancel'));
  expect(summarizeBatting(d, 'green-1')).toMatchObject({ count: 1, average: 0 });
  expect(toBatting100(-1, QUALITY_RUBRIC)).toBe(0);
  expect(toBatting100(5, QUALITY_RUBRIC)).toBe(100);
});
it('척도별 분리·과거 평균 유지·서로 다른 척도 선수 자동 비교 보류', () => {
  let d = session(createDemoWorkspace(), 'old', '2026-10-27', 'green-1', LEGACY_RUBRIC);
  d = recordBattingAttempt(
    d,
    'old',
    1,
    { ...blankAttempt(), result: 'fair', score: 8, intensity: 'strong', contactQuality: 'solid' },
    meta('old-a'),
  );
  d = session(d, 'new');
  expect(summarizeBatting(d, 'green-1').score).toBe(80);
  d = recordBattingAttempt(d, 'new', 1, input('foul'), meta('new-a'));
  expect(summarizeBatting(d, 'green-1')).toMatchObject({
    count: 1,
    total: 0,
    rubric: QUALITY_RUBRIC,
  });
  expect(summarizeBatting(d, 'green-1').score).toBeCloseTo(100 / 6);
  expect(summarizeBatting(d, 'green-1', { rubric: LEGACY_RUBRIC })).toMatchObject({
    score: 80,
    count: 1,
  });
  d = session(d, 'other', '2026-10-27', 'green-2', LEGACY_RUBRIC);
  d = recordBattingAttempt(
    d,
    'other',
    1,
    { ...blankAttempt(), result: 'fair', score: 1 },
    meta('other-a'),
  );
  const [a, b] = comparisonRows(d, ['green-1', 'green-2']);
  expect(pairDecision(a, b, 'batting', 1).winnerId).toBeNull();
});
it('등급·점수·세션 척도 및 감사 이력 불일치 차단, 유형은 직접 관찰만', () => {
  const d = session(createDemoWorkspace(), 's');
  expect(() =>
    recordBattingAttempt(d, 's', 1, { ...input('solid'), score: 3 }, meta('bad')),
  ).toThrow();
  expect(() =>
    recordBattingAttempt(d, 's', 1, { ...input('foul'), result: 'fair' }, meta('bad')),
  ).toThrow();
  expect(() =>
    recordBattingAttempt(d, 's', 1, { ...blankAttempt(), result: 'fair', score: 4 }, meta('bad')),
  ).toThrow('등급');
  const observed = recordBattingAttempt(
    d,
    's',
    1,
    { ...input('barrel'), trajectory: 'line', direction: 'right', directionZone: 'right-far' },
    meta('a'),
  );
  expect(observed.battingAttempts[0].trajectory).toBe('line');
  expect(summarizeBatting(observed, 'green-1').zones.counts).toEqual({ 'right-far': 1 });
  expect(() => recordBattingAttempt(observed, 's', 1, input('popup'), meta('duplicate'))).toThrow(
    '중복',
  );
  const forged = structuredClone(observed);
  forged.battingSessions[0].rubricVersion = LEGACY_RUBRIC;
  expect(() => parseWorkspace(forged)).toThrow();
  const g = d.games[0];
  expect(calculateStats(g, observed.events, d.policy)).toEqual(
    calculateStats(g, d.events, d.policy),
  );
});
it('v11 JSON·원본·기존 관찰·감사 보존, v12 왕복·실패/다른 탭 충돌 보호', () => {
  let old = session(createDemoWorkspace(), 'old', '2026-10-26', 'green-1', LEGACY_RUBRIC);
  old = recordBattingAttempt(
    old,
    'old',
    1,
    {
      ...blankAttempt(),
      result: 'fair',
      score: 8,
      intensity: 'strong',
      contactQuality: 'solid',
      trajectory: 'line',
    },
    meta('a'),
  );
  // Previous releases did not have rubricVersion: preserve the exact missing field in rows/audit.
  const obj = JSON.parse(JSON.stringify(old));
  obj.schemaVersion = 11;
  obj.battingSessions.forEach((s: any) => delete s.rubricVersion);
  obj.battingAudit
    .filter((a: any) => a.entity === 'session')
    .forEach((a: any) => {
      if (a.before) delete a.before.rubricVersion;
      delete a.after.rubricVersion;
    });
  const raw = JSON.stringify(obj),
    map = new Map([[V11_STORAGE_KEY, raw]]);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
  const repo = new LocalWorkspaceRepository(storage),
    m = repo.load()!;
  expect(m.schemaVersion).toBe(13);
  expect(m.battingAudit).toEqual(obj.battingAudit);
  expect(m.battingAttempts).toEqual(obj.battingAttempts);
  expect(m.battingSessions).toEqual(obj.battingSessions);
  expect(m.migrationSource?.raw).toBe(raw);
  expect(map.get(V11_STORAGE_KEY)).toBe(raw);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 11, workspace: obj }))
      .battingAttempts,
  ).toEqual(obj.battingAttempts);
  const n = recordBattingAttempt(session(m, 'new'), 'new', 1, input('tee-miss'), meta('new-a'));
  const saved = repo.save(n, m.revision);
  expect(readBackup(serializeBackup(saved))).toEqual(saved);
  expect(repo.load()).toEqual(saved);
  map.set(V11_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(saved, saved.revision)).toThrow('구버전');
  expect(JSON.parse(map.get(STORAGE_KEY)!).battingAttempts).toHaveLength(2);
  expect(() =>
    new LocalWorkspaceRepository({
      getItem: (k) => (k === V11_STORAGE_KEY ? raw : null),
      setItem: () => {
        throw Error('quota');
      },
    }).load(),
  ).toThrow('quota');
  expect(map.get(V11_STORAGE_KEY)).toBe(raw + ' ');
});
