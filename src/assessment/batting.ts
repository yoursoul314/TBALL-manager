import type { Workspace } from '../domain/model';
import type {
  BattingAssessmentSession as Session,
  BattingAssessmentAttempt as Attempt,
} from '../domain/batting';
import { parseWorkspace } from '../data/schema';
export interface ChangeMeta {
  id: string;
  at: string;
  actor: string;
  reason: string;
}
export type SessionInput = Pick<
  Session,
  'playerId' | 'date' | 'targetAttempts' | 'assessor' | 'purpose' | 'note'
>;
export type AttemptInput = Pick<
  Attempt,
  | 'result'
  | 'direction'
  | 'directionZone'
  | 'trajectory'
  | 'intensity'
  | 'contactQuality'
  | 'score'
  | 'note'
  | 'status'
>;
export const blankAttempt = (): AttemptInput => ({
  result: null,
  direction: null,
  directionZone: null,
  trajectory: null,
  intensity: null,
  contactQuality: null,
  score: null,
  note: '',
  status: 'active',
});
const auditMeta = (m: ChangeMeta) => ({
  id: m.id + '-audit',
  changedAt: m.at,
  changedBy: m.actor,
  reason: m.reason,
});
const nextNumber = (d: Workspace, playerId: string, date: string, except?: string) =>
  1 +
  Math.max(
    0,
    ...d.battingSessions
      .filter((s) => s.playerId === playerId && s.date === date && s.id !== except)
      .map((s) => s.sessionNumber),
  );
export function createBattingSession(
  data: Workspace,
  input: SessionInput,
  meta: ChangeMeta,
): Workspace {
  const session: Session = {
    ...input,
    id: meta.id,
    sessionNumber: nextNumber(data, input.playerId, input.date),
    status: 'in-progress',
    zoneDefinitionVersion: data.battingSettings.currentZoneVersion,
    createdAt: meta.at,
    updatedAt: meta.at,
  };
  return parseWorkspace({
    ...data,
    battingSessions: [...data.battingSessions, session],
    battingAudit: [
      ...data.battingAudit,
      {
        ...auditMeta(meta),
        entity: 'session',
        originalId: session.id,
        before: null,
        after: structuredClone(session),
      },
    ],
  });
}
export function reviseBattingSession(
  data: Workspace,
  id: string,
  patch: Partial<
    Pick<Session, 'date' | 'targetAttempts' | 'assessor' | 'purpose' | 'note' | 'status'>
  >,
  meta: ChangeMeta,
): Workspace {
  const before = data.battingSessions.find((s) => s.id === id);
  if (!before) throw new Error('평가 세션 없음');
  const after: Session = { ...before, ...patch, updatedAt: meta.at };
  if (after.date !== before.date)
    after.sessionNumber = nextNumber(data, after.playerId, after.date, id);
  return parseWorkspace({
    ...data,
    battingSessions: data.battingSessions.map((s) => (s.id === id ? after : s)),
    battingAudit: [
      ...data.battingAudit,
      {
        ...auditMeta(meta),
        entity: 'session',
        originalId: id,
        before: structuredClone(before),
        after: structuredClone(after),
      },
    ],
  });
}
function normalized(input: AttemptInput): AttemptInput {
  if (input.result === null)
    return {
      ...input,
      direction: null,
      directionZone: null,
      trajectory: null,
      intensity: null,
      contactQuality: null,
      score: null,
    };
  if (input.result === 'miss')
    return {
      ...input,
      direction: null,
      directionZone: null,
      trajectory: null,
      intensity: null,
      contactQuality: null,
    };
  return input;
}
export function recordBattingAttempt(
  data: Workspace,
  sessionId: string,
  attemptNumber: number,
  input: AttemptInput,
  meta: ChangeMeta,
): Workspace {
  if (
    data.battingAttempts.some((a) => a.sessionId === sessionId && a.attemptNumber === attemptNumber)
  )
    throw new Error('동일 세션 회차 번호 중복');
  const session = data.battingSessions.find((s) => s.id === sessionId);
  if (!session || session.status !== 'in-progress')
    throw new Error('진행 중인 세션에서 기록하세요');
  // Missing rounds may be saved explicitly as unmeasured; new records are entered in order.
  if (
    attemptNumber > 1 &&
    !data.battingAttempts.some(
      (a) => a.sessionId === sessionId && a.attemptNumber === attemptNumber - 1,
    )
  )
    throw new Error('이전 회차를 먼저 저장하세요');
  const after: Attempt = {
    ...normalized(input),
    id: meta.id,
    sessionId,
    attemptNumber,
    createdAt: meta.at,
    updatedAt: meta.at,
  };
  return parseWorkspace({
    ...data,
    battingAttempts: [...data.battingAttempts, after],
    battingAudit: [
      ...data.battingAudit,
      {
        ...auditMeta(meta),
        entity: 'attempt',
        originalId: after.id,
        before: null,
        after: structuredClone(after),
      },
    ],
  });
}
export function reviseBattingAttempt(
  data: Workspace,
  id: string,
  input: AttemptInput,
  meta: ChangeMeta,
): Workspace {
  const before = data.battingAttempts.find((a) => a.id === id);
  if (!before) throw new Error('평가 회차 없음');
  if (data.battingSessions.find((s) => s.id === before.sessionId)?.status === 'cancelled')
    throw new Error('취소 세션은 먼저 진행 중으로 복원하세요');
  const after: Attempt = { ...before, ...normalized(input), updatedAt: meta.at };
  return parseWorkspace({
    ...data,
    battingAttempts: data.battingAttempts.map((a) => (a.id === id ? after : a)),
    battingAudit: [
      ...data.battingAudit,
      {
        ...auditMeta(meta),
        entity: 'attempt',
        originalId: id,
        before: structuredClone(before),
        after: structuredClone(after),
      },
    ],
  });
}
