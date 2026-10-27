import { beforeEach, expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import { createBattingSession, recordBattingAttempt, blankAttempt } from '../assessment/batting';
import { migrateWorkspace } from './migration';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V3_STORAGE_KEY,
  readBackup,
  serializeBackup,
} from './repository';
import { summarizeBatting } from '../assessment/battingSummary';
function old() {
  let d = createDemoWorkspace();
  const m = { id: 'session', at: '2026-10-20T00:00:00Z', actor: '가상', reason: '검증' };
  d = createBattingSession(
    d,
    {
      playerId: 'green-1',
      date: '2026-10-20',
      targetAttempts: 10,
      assessor: '가상',
      purpose: '검증',
      note: '',
    },
    m,
  );
  const { direction: _, ...input } = blankAttempt();
  d = recordBattingAttempt(
    d,
    'session',
    1,
    { ...input, result: 'fair', directionZone: 'left-far', score: 8 },
    { ...m, id: 'attempt' },
  );
  return { ...d, schemaVersion: 3 };
}
beforeEach(() => localStorage.clear());
it('v3 원문·수동 평가·세션·회차·감사 이력을 변경 없이 보존하고 v4 JSON 왕복', () => {
  const source = old(),
    raw = JSON.stringify(source);
  localStorage.setItem(V3_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    d = repo.load()!;
  expect(d.schemaVersion).toBe(11);
  expect(d.migrationSource?.raw).toBe(raw);
  expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  expect(d.assessments).toEqual(source.assessments);
  expect(d.battingAttempts).toEqual(source.battingAttempts);
  expect(d.battingAudit).toEqual(source.battingAudit);
  expect(d.battingAttempts[0]).not.toHaveProperty('direction');
  expect(summarizeBatting(d, 'green-1').directions.counts).toEqual({ left: 1 });
  expect(repo.load()).toEqual(d);
  expect(migrateWorkspace(d)).toEqual(d);
  expect(readBackup(serializeBackup(d))).toEqual(d);
});
it('v3 백업 복원 지원·없는 관찰을 생성하지 않고 점수 보존', () => {
  const source = old();
  const d = readBackup(
    JSON.stringify({ format: 'tb-manager-backup', version: 3, workspace: source }),
  );
  expect(d.battingAttempts[0].intensity).toBeNull();
  expect(summarizeBatting(d, 'green-1').score).toBe(80);
});
it('v3→v4 저장 실패에도 원본 키 유지·v4 생성 없음', () => {
  const raw = JSON.stringify(old());
  localStorage.setItem(V3_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository({
    getItem: (k) => localStorage.getItem(k),
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => repo.load()).toThrow('quota');
  expect(localStorage.getItem(V3_STORAGE_KEY)).toBe(raw);
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
});
it('v4 이전 후 구버전 탭이 v3를 변경하면 저장 차단·복구 스냅샷에 두 원본 유지', () => {
  localStorage.setItem(V3_STORAGE_KEY, JSON.stringify(old()));
  const repo = new LocalWorkspaceRepository(localStorage),
    d = repo.load()!;
  const before = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(V3_STORAGE_KEY, JSON.stringify({ ...old(), revision: 7 }));
  expect(() => repo.save(d, d.revision)).toThrow('구버전');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  const snapshot = JSON.parse(repo.recoverySnapshot());
  expect(snapshot.v3).toBe(localStorage.getItem(V3_STORAGE_KEY));
  expect(snapshot.v11).toBe(before);
});
