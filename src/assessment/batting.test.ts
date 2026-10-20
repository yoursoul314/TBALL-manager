import { beforeEach, expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import {
  createBattingSession,
  recordBattingAttempt,
  reviseBattingAttempt,
  reviseBattingSession,
  blankAttempt,
} from './batting';
import { summarizeBatting } from './battingSummary';
import { parseWorkspace } from '../data/schema';
import { migrateWorkspace } from '../data/migration';
import {
  LocalWorkspaceRepository,
  STORAGE_KEY,
  V2_STORAGE_KEY,
  readBackup,
  serializeBackup,
} from '../data/repository';
import { calculateStats } from '../statistics/calculate';
import { ZONES } from '../config/batting';
let serial = 0;
export const meta = (reason = '평가 기록') => ({
  id: `assessment-${++serial}`,
  at: new Date('2026-10-20T01:00:00Z').toISOString(),
  actor: '가상 평가자',
  reason,
});
export function session(data = createDemoWorkspace(), date = '2026-10-13', targetAttempts = 10) {
  return createBattingSession(
    data,
    {
      playerId: data.players[0].id,
      date,
      targetAttempts,
      assessor: '가상 평가자',
      purpose: '연습 평가',
      note: '',
    },
    meta(),
  );
}
export function rounds(data: ReturnType<typeof createDemoWorkspace>, scores: (number | null)[]) {
  const s = data.battingSessions.at(-1)!;
  for (const [i, score] of scores.entries())
    data = recordBattingAttempt(
      data,
      s.id,
      i + 1,
      {
        ...blankAttempt(),
        result: 'fair',
        score,
        directionZone: 'left-far',
        trajectory: 'line',
        intensity: 'strong',
        contactQuality: 'solid',
      },
      meta(),
    );
  return data;
}
const summary = (data: ReturnType<typeof createDemoWorkspace>) =>
  summarizeBatting(data, data.players[0].id);
beforeEach(() => localStorage.clear());
it('날짜별 신규 세션, 기본 10회와 같은 날짜 복수 세션 번호를 보존한다', () => {
  const d = session(session());
  expect(d.battingSessions.map((s) => s.sessionNumber)).toEqual([1, 2]);
  expect(d.battingSessions[0]).toMatchObject({
    date: '2026-10-13',
    targetAttempts: 10,
    status: 'in-progress',
    zoneDefinitionVersion: 'zone-unset-v1',
  });
});
it('10회 평가를 합산하여 100점으로 환산하고 완료 상태를 구분한다', () => {
  let d = rounds(session(), Array(10).fill(9));
  expect(summary(d)).toMatchObject({ count: 10, average: 9, score: 90, provisional: true });
  d = reviseBattingSession(d, d.battingSessions[0].id, { status: 'completed' }, meta('완료'));
  expect(summary(d).provisional).toBe(false);
});
it('날짜 평균을 재평균하지 않고 회차 수로 가중한다', () => {
  let d = rounds(session(), [10]);
  d = rounds(session(d, '2026-10-16'), [2, 2, 2]);
  expect(summary(d)).toMatchObject({ count: 4, score: 40, average: 4 });
  expect(summary(d).daily.map((x) => x.average)).toEqual([10, 2]);
});
it('15회 총점126은 84점, 표시 전 계산값을 반올림하지 않는다', () => {
  let d = rounds(session(), [8, 8, 8, 8, 7]);
  d = rounds(session(d, '2026-10-16'), [8, 8, 8, 9, 9]);
  d = rounds(session(d, '2026-10-20'), [9, 9, 9, 9, 9]);
  expect(summary(d)).toMatchObject({ count: 15, total: 126, average: 8.4, score: 84, days: 3 });
  expect(summary(d).daily.at(-1)?.cumulative).toBe(8.4);
  expect(summarizeBatting(d, d.players[0].id, { from: '2026-10-16', to: '2026-10-16' }).score).toBe(
    84,
  );
});
it('미측정·미평가를 제외하고 분모0은 null이다', () => {
  let d = session();
  expect(summary(d).score).toBeNull();
  d = rounds(d, [null, 7, null]);
  expect(summary(d)).toMatchObject({ count: 1, score: 70 });
});
it('수정·회차 취소·복원 시 재계산하고 원본과 정정 사유를 보존한다', () => {
  let d = rounds(session(), [4, 8]);
  const original = structuredClone(d.battingAttempts[0]);
  d = reviseBattingAttempt(d, original.id, { ...original, score: 10 }, meta('판정 정정'));
  expect(summary(d).score).toBe(90);
  expect(d.battingAudit.at(-1)).toMatchObject({
    originalId: original.id,
    before: original,
    after: { score: 10 },
    reason: '판정 정정',
  });
  d = reviseBattingAttempt(
    d,
    original.id,
    { ...d.battingAttempts[0], status: 'cancelled' },
    meta('오입력 취소'),
  );
  expect(summary(d).score).toBe(80);
  d = reviseBattingAttempt(
    d,
    original.id,
    { ...d.battingAttempts[0], status: 'active' },
    meta('복원'),
  );
  expect(summary(d).score).toBe(90);
});
it('세션 취소는 회차 원본을 남기고 평균에서 제외한다', () => {
  let d = rounds(session(), [9]);
  d = reviseBattingSession(d, d.battingSessions[0].id, { status: 'cancelled' }, meta('평가 취소'));
  expect(summary(d).score).toBeNull();
  expect(d.battingAttempts).toHaveLength(1);
});
it('동일 회차 신규 저장과 순서를 건너뛴 신규 기록을 차단한다', () => {
  const d = rounds(session(), [8]),
    id = d.battingSessions[0].id;
  expect(() => recordBattingAttempt(d, id, 1, blankAttempt(), meta())).toThrow('중복');
  expect(() => recordBattingAttempt(d, id, 3, blankAttempt(), meta())).toThrow('이전 회차');
  expect(() =>
    parseWorkspace({
      ...d,
      battingAttempts: [...d.battingAttempts, { ...d.battingAttempts[0], id: 'duplicate' }],
    }),
  ).toThrow('번호 중복');
});
it('9구역과 유형·강도·정확성을 독립적으로 저장·조회한다', () => {
  let d = session();
  for (const [i, zone] of ZONES.entries())
    d = recordBattingAttempt(
      d,
      d.battingSessions[0].id,
      i + 1,
      {
        ...blankAttempt(),
        result: 'fair',
        score: 5,
        directionZone: zone,
        trajectory: 'ground',
        intensity: 'strong',
        contactQuality: 'mishit',
      },
      meta(),
    );
  expect(Object.keys(summary(d).zones.counts).sort()).toEqual([...ZONES].sort());
  expect(d.battingAttempts[0]).toMatchObject({
    trajectory: 'ground',
    intensity: 'strong',
    contactQuality: 'mishit',
  });
});
it('헛스윙은 관찰값을 null로, 파울은 선택 관찰을 허용하고 점수를 추정하지 않는다', () => {
  let d = session();
  const id = d.battingSessions[0].id;
  d = recordBattingAttempt(
    d,
    id,
    1,
    {
      ...blankAttempt(),
      result: 'miss',
      score: 2,
      trajectory: 'fly',
      directionZone: 'right-near',
      intensity: 'strong',
      contactQuality: 'solid',
    },
    meta(),
  );
  expect(d.battingAttempts[0]).toMatchObject({
    score: 2,
    trajectory: null,
    directionZone: null,
    intensity: null,
    contactQuality: null,
  });
  d = recordBattingAttempt(d, id, 2, { ...blankAttempt(), result: 'foul' }, meta());
  expect(d.battingAttempts[1].score).toBeNull();
  d = recordBattingAttempt(
    d,
    id,
    3,
    { ...blankAttempt(), result: 'foul', trajectory: 'line' },
    meta(),
  );
  expect(d.battingAttempts[2].trajectory).toBe('line');
});
it('미측정 회차 임시 저장, 부분 완료 평균과 세션 완료 검증', () => {
  let d = rounds(session(), [8]);
  d = recordBattingAttempt(d, d.battingSessions[0].id, 2, blankAttempt(), meta());
  expect(summary(d)).toMatchObject({ score: 80, provisional: true });
  expect(() =>
    reviseBattingSession(d, d.battingSessions[0].id, { status: 'completed' }, meta()),
  ).toThrow('모든 회차');
  expect(() =>
    reviseBattingSession(d, d.battingSessions[0].id, { targetAttempts: 1 }, meta()),
  ).toThrow('평가 횟수');
});
it('날짜 정정은 날짜별 그래프를 재계산하고 같은 날짜 세션 번호 충돌을 피한다', () => {
  let d = rounds(session(), [8]);
  d = session(d, '2026-10-16');
  d = reviseBattingSession(d, d.battingSessions[0].id, { date: '2026-10-16' }, meta('평가일 정정'));
  expect(d.battingSessions[0].sessionNumber).toBe(2);
  expect(summary(d).daily.map((x) => x.date)).toEqual(['2026-10-16']);
});
it('v2 백업 및 기기 저장을 v3로 이전해 수동 점수·원문을 보존한다', () => {
  const demo = createDemoWorkspace(),
    old = { ...demo, schemaVersion: 2 },
    raw = JSON.stringify(old);
  localStorage.setItem(V2_STORAGE_KEY, raw);
  const d = new LocalWorkspaceRepository(localStorage).load()!;
  expect(localStorage.getItem(V2_STORAGE_KEY)).toBe(raw);
  expect(d.migrationSource?.raw).toBe(raw);
  expect(d.assessments).toEqual(demo.assessments);
  expect(d.battingAttempts).toEqual([]);
  expect(
    readBackup(JSON.stringify({ format: 'tb-manager-backup', version: 2, workspace: old })),
  ).toEqual(d);
  expect(readBackup(serializeBackup(d))).toEqual(d);
  expect(migrateWorkspace(d)).toEqual(d);
});
it('v2 구버전 탭 변경 감지·공간 부족 시 두 원본을 덮어쓰지 않는다', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 2 });
  localStorage.setItem(V2_STORAGE_KEY, raw);
  const repo = new LocalWorkspaceRepository(localStorage),
    d = repo.load()!,
    v3 = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(V2_STORAGE_KEY, raw + ' ');
  expect(() => repo.save(d, d.revision)).toThrow('구버전 탭');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(v3);
  const full = new LocalWorkspaceRepository({
    getItem: (k) => (k === V2_STORAGE_KEY ? raw : null),
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(() => full.load()).toThrow('quota');
  expect(JSON.parse(full.recoverySnapshot()).v2).toBe(raw);
});
it('원본 이력 누락·변경 사유 누락·점수0·소수·범위 초과를 거부한다', () => {
  const d = rounds(session(), [8]),
    a = d.battingAttempts[0];
  expect(() => parseWorkspace({ ...d, battingAudit: [] })).toThrow('이력 누락');
  expect(() => reviseBattingAttempt(d, a.id, { ...a, score: 9 }, meta(''))).toThrow();
  for (const score of [0, 1.5, 11])
    expect(() => reviseBattingAttempt(d, a.id, { ...a, score }, meta())).toThrow();
  expect(() => parseWorkspace({ ...d, battingAttempts: [{ ...a, score: 9 }] })).toThrow(
    '정정 이력',
  );
});
it('평가 당시 구역 정의는 새 버전 추가 후에도 유지된다', () => {
  let d = session();
  d = {
    ...d,
    battingSettings: {
      ...d.battingSettings,
      currentZoneVersion: 'zone-2',
      zoneDefinitions: [
        ...d.battingSettings.zoneDefinitions,
        { version: 'zone-2', near: '10m 이내', middle: '10m 초과 20m 이내', far: '20m 초과' },
      ],
    },
  };
  d = session(d);
  expect(d.battingSessions.map((s) => s.zoneDefinitionVersion)).toEqual([
    'zone-unset-v1',
    'zone-2',
  ]);
});
it('기능평가와 기존 수동 점수는 혼합하지 않고 경기 PA/H 및 모든 스탯을 변경하지 않는다', () => {
  const base = createDemoWorkspace();
  base.events = [
    {
      schemaVersion: 2,
      id: 'start',
      gameId: base.games[0].id,
      sequence: 1,
      deviceId: 'test',
      recordedAt: '2026-10-20T00:00:00Z',
      payload: { type: 'START_PLAY' },
    },
    {
      schemaVersion: 2,
      id: 'end',
      gameId: base.games[0].id,
      sequence: 2,
      deviceId: 'test',
      recordedAt: '2026-10-20T00:00:00Z',
      payload: {
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'left',
        quality: 'ground',
        fielding: [],
        outcomes: [{ playerId: base.players[0].id, to: 1, action: 'advance' }],
      },
    },
  ];
  const before = calculateStats(base.games[0], base.events, base.policy),
    d = rounds(session(base), [9]);
  expect(before.rows.find((r) => r.playerId === base.players[0].id)).toMatchObject({
    pa: 1,
    hits: 1,
  });
  expect(calculateStats(d.games[0], d.events, d.policy)).toEqual(before);
  expect(d.assessments).toEqual(base.assessments);
  expect(summary(d)).toMatchObject({
    score: 90,
    selectedScore: 90,
    legacy: base.assessments[0].battingSkill,
  });
  expect(
    summary({ ...d, battingSettings: { ...d.battingSettings, scoreSource: 'legacy' } })
      .selectedScore,
  ).toBe(base.assessments[0].battingSkill);
});
it('불충분 표본과 미확정 경계값은 유형 판정을 보류한다', () => {
  const d = rounds(session(createDemoWorkspace(), '2026-10-13', 20), Array(15).fill(8));
  expect(summary(d).types).toEqual([]);
  expect(summary(d).classificationNote).toContain('TODO');
  const configured = {
    ...d,
    battingSettings: {
      ...d.battingSettings,
      classification: {
        minimumBalls: 15,
        strongRatio: 0.8,
        solidRatio: 0.8,
        sideRatio: 0.7,
        spreadMaxRatio: null,
      },
    },
  };
  expect(summary(configured).types).toEqual(['강타형', '정확성 중심형', '좌측 집중형']);
  expect(summary(rounds(session(), [8])).classificationNote).toContain('1/15');
});
it('관찰하지 않은 지표는 비율 분모에 넣지 않는다', () => {
  let d = session();
  d = recordBattingAttempt(
    d,
    d.battingSessions[0].id,
    1,
    { ...blankAttempt(), result: 'miss', score: 1 },
    meta(),
  );
  d = recordBattingAttempt(
    d,
    d.battingSessions[0].id,
    2,
    { ...blankAttempt(), result: 'fair', score: 9, intensity: 'strong' },
    meta(),
  );
  expect(summary(d).intensities.ratio('strong')).toBe(1);
  expect(summary(d).results.ratio('fair')).toBe(0.5);
  expect(summary(d).contacts.ratio('solid')).toBeNull();
});
it('새 저장소 인스턴스로 재로드해 세션·회차·이력과 계산을 복원한다', () => {
  const d = rounds(session(), [7, 8, 9]),
    saved = new LocalWorkspaceRepository(localStorage).save(d, 0);
  const loaded = new LocalWorkspaceRepository(localStorage).load()!;
  expect(loaded).toEqual(saved);
  expect(summary(loaded).score).toBe(80);
});
