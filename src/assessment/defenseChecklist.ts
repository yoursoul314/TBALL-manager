import { ABILITIES, type Ability } from '../config/positions';
import type { DefenseInput, DefenseOutcome, DefenseRevision } from '../domain/defenseAssessment';
import type { Workspace } from '../domain/model';
import { parseWorkspace } from '../data/schema';
export const emptyDefenseObservations = () =>
  Object.fromEntries(ABILITIES.map((k) => [k, null])) as Record<Ability, DefenseOutcome>;
export function saveDefenseAssessment(
  data: Workspace,
  playerId: string,
  input: DefenseInput,
  meta: { id: string; revisionId: string; at: string; author: string; reason: string },
  existingId?: string,
  cancel = false,
): Workspace {
  if (!data.players.some((p) => p.id === playerId && !p.archivedAt))
    throw new Error('등록된 평가 선수가 없습니다');
  const old = existingId
    ? data.defenseAssessments.find((r) => r.id === existingId && r.playerId === playerId)
    : undefined;
  if (existingId && !old) throw new Error('수정할 수비 평가가 없습니다');
  if (!old && data.defenseAssessments.some((r) => r.id === meta.id))
    throw new Error('이미 저장한 수비 평가입니다');
  if (cancel && (!old || old.revisions.at(-1)!.status === 'cancelled'))
    throw new Error('취소할 평가가 없습니다');
  if (!meta.reason.trim()) throw new Error('수정·취소 사유를 입력하세요');
  // New, restored, or moved observations consume one planned round; revisions do not.
  if (!cancel) {
    const target = data.defenseDays.find((d) => d.date === input.date)?.targetAttempts ?? null;
    const count = data.defenseAssessments.filter(
      (r) =>
        r.id !== old?.id &&
        r.playerId === playerId &&
        r.revisions.at(-1)!.date === input.date &&
        r.revisions.at(-1)!.status === 'active',
    ).length;
    if (target !== null && count >= target)
      throw new Error('설정한 수비 횟수를 완료했습니다. 추가 기록은 횟수를 늘린 후 저장하세요.');
  }
  const revision: DefenseRevision = {
    ...(cancel ? old!.revisions.at(-1)! : input),
    id: meta.revisionId,
    status: cancel ? 'cancelled' : 'active',
    changedAt: meta.at,
    changedBy: meta.author,
    reason: meta.reason,
  };
  const row = old
    ? { ...old, revisions: [...old.revisions, revision] }
    : { id: meta.id, playerId, createdAt: meta.at, revisions: [revision] };
  return parseWorkspace({
    ...data,
    defenseAssessments: old
      ? data.defenseAssessments.map((r) => (r.id === old.id ? row : r))
      : [...data.defenseAssessments, row],
  });
}
export function summarizeDefenseAssessments(
  data: Pick<Workspace, 'defenseAssessments'>,
  playerId: string,
  date?: string,
) {
  const rows = data.defenseAssessments
    .filter((r) => r.playerId === playerId)
    .map((r) => r.revisions.at(-1)!)
    .filter((r) => r.status === 'active' && (!date || r.date === date));
  const abilities = Object.fromEntries(
    ABILITIES.map((k) => {
      let count = 0,
        sum = 0,
        success = 0,
        partial = 0,
        failure = 0,
        notOffered = 0,
        unobserved = 0;
      for (const r of rows) {
        const outcome = r.observations[k];
        if (outcome === null) {
          unobserved++;
          continue;
        }
        if (outcome === 'not-offered') {
          notOffered++;
          continue;
        }
        count++;
        sum += (r.rubric[outcome] / r.rubric.success) * 100;
        if (outcome === 'success') success++;
        if (outcome === 'partial') partial++;
        if (outcome === 'failure') failure++;
      }
      return [
        k,
        {
          count,
          score: count ? sum / count : null,
          success,
          partial,
          failure,
          notOffered,
          unobserved,
        },
      ];
    }),
  ) as Record<
    Ability,
    {
      count: number;
      score: number | null;
      success: number;
      partial: number;
      failure: number;
      notOffered: number;
      unobserved: number;
    }
  >;
  const rubrics = new Set(rows.map((r) => JSON.stringify(r.rubric)));
  return { count: rows.length, abilities, mixedRubrics: rubrics.size > 1 };
}
