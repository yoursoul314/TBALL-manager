import { assertAssessmentDayOpen } from '../domain/assessmentManagement';
import { prepareNewAssessmentDay, type ManagementMeta } from './management';
import type { FungoDay } from '../domain/fungo';
import type { Workspace } from '../domain/model';
import {
  fungoScores,
  blankFungoScores,
  type FungoInput,
  type FungoRevision,
} from '../domain/fungo';
import { parseWorkspace } from '../data/schema';
export function saveFungo(
  data: Workspace,
  playerId: string,
  input: FungoInput,
  meta: { id: string; revisionId: string; at: string; reason: string },
  cancel = false,
) {
  assertAssessmentDayOpen(data, 'fungo', input.date);
  const old = currentFungoRecord(data, playerId, input.date);
  if (cancel && !old) throw Error('취소할 기록이 없습니다');
  if (!cancel && Object.values(fungoScores(input)).every((n) => n === null))
    throw Error('관찰 점수 또는 정밀 점수를 입력하세요');
  if (old && !meta.reason.trim()) throw Error('수정·취소 사유를 입력하세요');
  const revision: FungoRevision = {
    ...structuredClone(input),
    id: meta.revisionId,
    at: meta.at,
    by: input.assessor,
    reason: meta.reason,
    status: cancel ? 'cancelled' : 'active',
    version: 'fungo-five-v1',
  };
  const row = {
    id: old?.id ?? meta.id,
    playerId,
    revisions: [...(old?.revisions ?? []), revision],
  };
  return parseWorkspace({
    ...data,
    fungoAssessments: old
      ? data.fungoAssessments.map((r) => (r.id === old.id ? row : r))
      : [...data.fungoAssessments, row],
  });
}
export function latestFungo(data: Workspace, playerId: string) {
  const latest = data.fungoAssessments
    .filter((r) => r.playerId === playerId)
    .map((r) => r.revisions.at(-1)!)
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at))
    .at(-1);
  return { scores: latest ? fungoScores(latest) : blankFungoScores(), revision: latest ?? null };
}

export function currentFungoRecord(data: Workspace, playerId: string | undefined, date: string) {
  const rows = data.fungoAssessments.filter(
    (r) => r.playerId === playerId && r.revisions[0].date === date,
  );
  const previousIds = new Set(
    data.assessmentManagement.dayHistory
      .filter((h) => h.kind === 'fungo' && h.date === date)
      .flatMap((h) => h.restart?.recordIds ?? []),
  );
  return (
    rows.find((r) => r.revisions.at(-1)!.status === 'active') ??
    rows.filter((r) => !previousIds.has(r.id)).at(-1)
  );
}
export function saveFungoDay(data: Workspace, day: FungoDay, meta: ManagementMeta, edit = false) {
  if (!day.assessor.trim()) throw Error('등록된 평가자를 터치해 선택하세요');
  if (!day.playerIds.length) throw Error('평가 학생을 선택하세요');
  if (edit) {
    assertAssessmentDayOpen(data, 'fungo', day.date);
    if (!data.fungoDays.some((d) => d.date === day.date)) throw Error('평가 날짜가 없습니다');
  }
  const next = edit ? data : prepareNewAssessmentDay(data, 'fungo', day.date, meta);
  return parseWorkspace({
    ...next,
    fungoDays: [...next.fungoDays.filter((d) => d.date !== day.date), day],
  });
}
