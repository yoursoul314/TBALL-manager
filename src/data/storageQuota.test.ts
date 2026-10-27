import { afterEach, expect, it } from 'vitest';
import { createDemoWorkspace } from './seed';
import { migrateWorkspace } from './migration';
import { LocalWorkspaceRepository, STORAGE_KEY, V11_STORAGE_KEY, serializeBackup, readBackup } from './repository';
import { decodeStorageText, encodeStorageText } from './storageCodec';
import { blankAttempt, createBattingSession, recordBattingAttempt } from '../assessment/batting';

function legacyChain() {
  const meta = { id: 'quota-session', at: '2026-10-27T00:00:00Z', actor: 'QA', reason: '가상 기록' };
  let data = createBattingSession(createDemoWorkspace(), { playerId: 'green-1', date: '2026-10-26', targetAttempts: 10, assessor: 'QA', purpose: '검증', note: '' }, meta);
  data = recordBattingAttempt(data, meta.id, 1, { ...blankAttempt(), result: 'fair', score: 8, directionZone: 'left-far', intensity: 'strong' }, { ...meta, id: 'quota-attempt' });
  const entries = new Map<string, string>();
  const baselines: Record<string, string> = {};
  let previous: string | undefined;
  for (let version = 8; version <= 11; version++) {
    const raw = JSON.stringify({ ...data, schemaVersion: version, ...baselines, ...(previous ? { migrationSource: { schemaVersion: version - 1, raw: previous } } : {}) });
    entries.set('tb-manager.workspace.v' + version, raw);
    baselines['_v' + version + 'Baseline'] = raw;
    previous = raw;
  }
  return { entries, data };
}
function cappedStorage(entries: Map<string, string>, capacity: number) {
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const total = [...entries].reduce((n, [k, v]) => n + (k === key ? 0 : k.length + v.length), 0) + key.length + value.length;
      if (total > capacity) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      entries.set(key, value);
    },
    removeItem: (key: string) => { entries.delete(key); },
  };
}
afterEach(() => localStorage.clear());
it('중첩된 v8~v11 원본 때문에 실패하던 이전을 압축 저장하고 원본·평가·감사 이력을 모두 보존', () => {
  const { entries, data } = legacyChain(), originals = new Map(entries);
  const used = [...entries].reduce((n, [k, v]) => n + k.length + v.length, 0);
  const source = entries.get(V11_STORAGE_KEY)!;
  const uncompressed = JSON.stringify({ ...migrateWorkspace(JSON.parse(source), source), ...Object.fromEntries([...entries].map(([k,v]) => ['_v' + k.split('v').at(-1) + 'Baseline', v])) });
  const storage = cappedStorage(entries, used + Math.floor(uncompressed.length / 4));
  expect(() => storage.setItem(STORAGE_KEY, uncompressed)).toThrow('quota');
  const repo = new LocalWorkspaceRepository(storage), loaded = repo.load()!;
  expect(loaded.battingAttempts).toEqual(data.battingAttempts);
  expect(loaded.battingAudit).toEqual(data.battingAudit);
  expect(loaded.assessments).toEqual(data.assessments);
  expect(loaded.events).toEqual(data.events);
  expect(loaded.migrationSource?.raw).toBe(source);
  expect(entries.get(STORAGE_KEY)!.length).toBeLessThan(uncompressed.length / 4);
  for (const [key, raw] of originals) expect(entries.get(key)).toBe(raw);
  expect(new LocalWorkspaceRepository(storage).load()).toEqual(loaded);
  const next = repo.save({ ...loaded, players: loaded.players.map((p, i) => i ? p : { ...p, name: '가상 수정 학생' }) }, loaded.revision);
  expect(repo.load()).toEqual(next);
  expect(readBackup(serializeBackup(next))).toEqual(next);
  expect(JSON.parse(repo.recoverySnapshot()).v11).toBe(source);
  entries.set(V11_STORAGE_KEY, source + ' ');
  const before = entries.get(STORAGE_KEY);
  expect(() => repo.save(next, next.revision)).toThrow('구버전');
  expect(entries.get(STORAGE_KEY)).toBe(before);
});
it('실제 여유 공간이 전혀 없으면 원본 유지·실패 반환, 쓰기 없는 검증·JSON 백업은 가능', () => {
  const { entries } = legacyChain(), originals = [...entries];
  const repo = new LocalWorkspaceRepository(cappedStorage(entries, 0));
  expect(() => repo.load()).toThrow('quota');
  const verified = repo.load(false)!;
  expect(verified.battingAttempts[0].score).toBe(8);
  expect(readBackup(serializeBackup(verified))).toEqual(verified);
  expect([...entries]).toEqual(originals);
});
it('이미 존재하는 큰 v12 일반 JSON도 압축 저장 후 리비전 보호를 유지', () => {
  const { entries } = legacyChain(), repo = new LocalWorkspaceRepository(cappedStorage(entries, Infinity));
  const loaded = repo.load()!;
  const plain = decodeStorageText(entries.get(STORAGE_KEY)!);
  entries.set(STORAGE_KEY, plain);
  expect(repo.load()).toEqual(loaded);
  const saved = repo.save(loaded, loaded.revision);
  expect(repo.load()).toEqual(saved);
  expect(() => repo.save(loaded, loaded.revision)).toThrow('다른 탭');
});
it('한글·이모지·이스케이프·중첩 문자열을 글자 단위로 그대로 복원하고 손상은 차단', () => {
  const raw = JSON.stringify({ text: '학생 🥎 한글 \" 줄\n'.repeat(20000) });
  const encoded = encodeStorageText(raw);
  expect(decodeStorageText(encoded)).toBe(raw);
  const envelope = JSON.parse(encoded); envelope.checksum = 'invalid';
  expect(() => decodeStorageText(JSON.stringify(envelope))).toThrow('무결성');
  expect(decodeStorageText('{}')).toBe('{}');
});
it('작은 기록도 용량 오류일 때만 압축 재시도하고 원래 저장본은 삭제하지 않는다', () => {
  const data = createDemoWorkspace(), raw = JSON.stringify(data), entries = new Map<string,string>();
  const repo = new LocalWorkspaceRepository(cappedStorage(entries, Math.floor(raw.length / 2)));
  const saved = repo.save(data, 0);
  expect(repo.load()).toEqual(saved);
});
it('압축된 최신 키가 손상되면 과거 기록으로 조용히 되돌리거나 덮어쓰지 않는다', () => {
  const { entries } = legacyChain(), repo = new LocalWorkspaceRepository(cappedStorage(entries, Infinity));
  repo.load();
  const envelope = JSON.parse(entries.get(STORAGE_KEY)!); envelope.length++;
  const corrupt = JSON.stringify(envelope); entries.set(STORAGE_KEY, corrupt);
  expect(() => repo.load()).toThrow('무결성');
  expect(entries.get(STORAGE_KEY)).toBe(corrupt);
});
