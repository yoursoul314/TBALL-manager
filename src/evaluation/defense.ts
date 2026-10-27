import type { Workspace } from '../domain/model';
import type { Ability } from '../config/positions';
import type { DefenseEvaluationChoice } from '../domain/defenseAssessment';
import { summarizeDefenseAssessments } from '../assessment/defenseChecklist';
import { parseWorkspace } from '../data/schema';
/** Source selection applies to all nine abilities; never fill missing checklist observations from manual scores. */
export function defenseEvaluation(data: Workspace, playerId: string) {
  const source =
    data.defenseEvaluationChoices.filter((c) => c.playerId === playerId).at(-1)?.source ?? 'manual';
  const summary = summarizeDefenseAssessments(data, playerId);
  const manual = data.assessments.filter((a) => a.playerId === playerId).at(-1)?.abilities ?? {};
  const abilities: Partial<Record<Ability, number>> =
    source === 'manual'
      ? manual
      : Object.fromEntries(
          Object.entries(summary.abilities)
            .filter(([, a]) => a.score !== null)
            .map(([k, a]) => [k, a.score!]),
        );
  return { source, abilities, summary, manual };
}
export function chooseDefenseEvaluation(
  data: Workspace,
  choice: DefenseEvaluationChoice,
): Workspace {
  if (!data.players.some((p) => p.id === choice.playerId && !p.archivedAt))
    throw new Error('등록된 선수가 없습니다');
  if (
    choice.source === 'checklist' &&
    !Object.values(summarizeDefenseAssessments(data, choice.playerId).abilities).some(
      (a) => a.count > 0,
    )
  )
    throw new Error('점수로 환산할 수비 관찰이 없습니다');
  return parseWorkspace({
    ...data,
    defenseEvaluationChoices: [...data.defenseEvaluationChoices, choice],
  });
}
