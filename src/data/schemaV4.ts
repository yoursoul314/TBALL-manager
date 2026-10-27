import { z } from 'zod';
import type { Workspace as CurrentWorkspace } from '../domain/model';
export type WorkspaceV4 = Omit<
  CurrentWorkspace,
  | 'schemaVersion'
  | 'migrationSource'
  | 'battingDays'
  | 'defenseAssessments'
  | 'defenseEvaluationChoices'
  | 'defenseDays'
  | 'comparisonSelection'
> & {
  schemaVersion: 4;
  migrationSource?: { schemaVersion: 2 | 3; raw: string };
};
type Workspace = WorkspaceV4;
import { ZONES } from '../config/batting';
import { parseWorkspaceV2 } from './schemaV2';
import { parseCurrentCommon } from './schemaCommon';
const id = z.string().min(1).max(120);
const text = z.string().trim().min(1).max(200);
const note = z.string().max(2000);
const time = z.iso.datetime();
const date = z.iso.date();
export const battingSessionSchema = z.object({
  id,
  playerId: id,
  date,
  sessionNumber: z.number().int().min(1),
  targetAttempts: z.number().int().min(1).max(200),
  assessor: text,
  purpose: text,
  note,
  status: z.enum(['in-progress', 'completed', 'cancelled']),
  zoneDefinitionVersion: id,
  createdAt: time,
  updatedAt: time,
});
export const battingAttemptSchema = z
  .object({
    id,
    sessionId: id,
    attemptNumber: z.number().int().min(1).max(200),
    result: z.enum(['fair', 'foul', 'miss']).nullable(),
    direction: z.enum(['left', 'center', 'right']).nullable().optional(),
    directionZone: z.enum(ZONES).nullable(),
    trajectory: z.enum(['ground', 'line', 'fly']).nullable(),
    intensity: z.enum(['strong', 'normal', 'weak']).nullable(),
    contactQuality: z.enum(['solid', 'normal', 'mishit']).nullable(),
    score: z.number().int().min(1).max(10).nullable(),
    note,
    status: z.enum(['active', 'cancelled']),
    createdAt: time,
    updatedAt: time,
  })
  .superRefine((a, ctx) => {
    if (a.direction != null && a.directionZone && !a.directionZone.startsWith(a.direction + '-'))
      ctx.addIssue({ code: 'custom', message: '방향과 9구역 불일치' });
    if (
      (a.result === 'miss' || a.result === null) &&
      [a.direction ?? null, a.directionZone, a.trajectory, a.intensity, a.contactQuality].some(
        (v) => v !== null,
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: '헛스윙·미측정의 타구 관찰은 해당 없음이어야 합니다',
      });
    if (a.result === null && a.score !== null)
      ctx.addIssue({ code: 'custom', message: '미측정 회차는 점수를 부여할 수 없습니다' });
  });
const ratio = z.number().min(0).max(1).nullable();
export const battingSettingsSchema = z.object({
  scoreSource: z.enum(['detailed', 'legacy']),
  currentZoneVersion: id,
  zoneDefinitions: z
    .array(z.object({ version: id, near: text, middle: text, far: text }))
    .min(1)
    .max(1000),
  classification: z.object({
    minimumBalls: z.number().int().min(1).max(10000),
    strongRatio: ratio,
    solidRatio: ratio,
    sideRatio: z.number().min(0.5).max(1).nullable(),
    spreadMaxRatio: z
      .number()
      .min(1 / 3)
      .max(0.5)
      .nullable(),
  }),
});
const auditBase = {
  id,
  changedAt: time,
  changedBy: text,
  reason: z.string().trim().min(1).max(2000),
  originalId: id,
};
const battingSchema = z.object({
  schemaVersion: z.union([z.literal(3), z.literal(4)]),
  migrationSource: z
    .object({ schemaVersion: z.union([z.literal(2), z.literal(3)]), raw: z.string() })
    .optional(),
  battingSettings: battingSettingsSchema,
  battingSessions: z.array(battingSessionSchema).max(20000),
  battingAttempts: z.array(battingAttemptSchema).max(100000),
  battingAudit: z
    .array(
      z.discriminatedUnion('entity', [
        z.object({
          ...auditBase,
          entity: z.literal('session'),
          before: battingSessionSchema.nullable(),
          after: battingSessionSchema,
        }),
        z.object({
          ...auditBase,
          entity: z.literal('attempt'),
          before: battingAttemptSchema.nullable(),
          after: battingAttemptSchema,
        }),
      ]),
    )
    .max(200000),
});
const require = (v: unknown, message: string) => {
  if (!v) throw new Error(message);
};
export function parseWorkspaceV4(
  input: unknown,
  legacyV3 = false,
  historicalMembership = false,
  allowEmptyGames = false,
): Workspace {
  const batting = battingSchema.parse(input);
  if (batting.schemaVersion !== (legacyV3 ? 3 : 4)) throw new Error('스키마 이전이 필요합니다');
  const baseInput = { ...(input as object), schemaVersion: 2 };
  const common = legacyV3
    ? parseWorkspaceV2(baseInput)
    : parseCurrentCommon(baseInput, historicalMembership, allowEmptyGames);
  const data: Workspace = { ...common, ...batting, schemaVersion: 4 };
  const players = new Set(data.players.map((p) => p.id));
  const sessions = new Map(data.battingSessions.map((s) => [s.id, s]));
  const versions = data.battingSettings.zoneDefinitions.map((z) => z.version);
  require(new Set(versions).size === versions.length, '구역 정의 버전 중복');
  require(versions.includes(data.battingSettings.currentZoneVersion), '현재 구역 정의 없음');
  for (const records of [data.battingSessions, data.battingAttempts, data.battingAudit])
    require(new Set(records.map((r) => r.id)).size === records.length, '타격 평가 식별자 중복');
  require(new Set(data.battingSessions.map((s) => `${s.playerId}/${s.date}/${s.sessionNumber}`))
    .size === data.battingSessions.length, '같은 날짜의 세션 번호 중복');
  require(new Set(data.battingAttempts.map((a) => `${a.sessionId}/${a.attemptNumber}`)).size ===
    data.battingAttempts.length, '동일 세션 회차 번호 중복');
  const rounds = new Map<string, typeof data.battingAttempts>();
  for (const a of data.battingAttempts) {
    const s = sessions.get(a.sessionId);
    require(s && a.attemptNumber <= s.targetAttempts, '회차의 세션 또는 평가 횟수 오류');
    const list = rounds.get(a.sessionId) ?? [];
    list.push(a);
    rounds.set(a.sessionId, list);
  }
  for (const s of data.battingSessions) {
    require(players.has(s.playerId), '타격 평가 선수 없음');
    require(versions.includes(s.zoneDefinitionVersion), '평가 당시 구역 정의 없음');
    if (s.status === 'completed') {
      const attempts = rounds.get(s.id) ?? [];
      require(attempts.length === s.targetAttempts &&
        attempts.every(
          (a) => a.status === 'cancelled' || (a.result !== null && a.score !== null),
        ), '완료하려면 모든 회차를 평가하거나 취소하세요');
    }
  }
  // Reconstruct every revision from the creation snapshot; imported audit chains must match current rows.
  const history = new Map<string, object>();
  for (const a of data.battingAudit) {
    const key = `${a.entity}/${a.originalId}`;
    require(a.after.id === a.originalId &&
      (!a.before || a.before.id === a.originalId), '정정 원본 ID 불일치');
    require(JSON.stringify(history.get(key) ?? null) ===
      JSON.stringify(a.before), '정정 이력 연결 불일치');
    require(a.after.updatedAt === a.changedAt, '정정 시각 불일치');
    if (a.before) {
      require(a.before.createdAt === a.after.createdAt, '최초 생성 시각 변경 불가');
      if (a.entity === 'attempt')
        require(a.before.sessionId === a.after.sessionId &&
          a.before.attemptNumber === a.after.attemptNumber, '회차 식별 정보 변경 불가');
      if (a.entity === 'session')
        require(a.before.playerId === a.after.playerId &&
          a.before.zoneDefinitionVersion ===
            a.after.zoneDefinitionVersion, '평가 대상·구역 버전 변경 불가');
    }
    history.set(key, a.after);
  }
  for (const [entity, records] of [
    ['session', data.battingSessions],
    ['attempt', data.battingAttempts],
  ] as const)
    for (const record of records) {
      const key = `${entity}/${record.id}`;
      require(JSON.stringify(history.get(key)) ===
        JSON.stringify(record), '평가 원본 또는 최종 정정 이력 누락');
      history.delete(key);
    }
  require(history.size === 0, '정정 대상 기록 누락');
  return data;
}
