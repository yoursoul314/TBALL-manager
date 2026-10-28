import type { Workspace } from './model';
import type { BattingAssessmentDay } from './batting';
import type { DefenseAssessmentDay } from './defenseAssessment';
import type { FungoDay } from './fungo';
export type AssessmentDayRestart = { recordIds: string[] } & (
  | { kind: 'batting'; day: BattingAssessmentDay | null }
  | { kind: 'defense'; day: DefenseAssessmentDay | null }
  | { kind: 'fungo'; day: FungoDay | null }
);
export type AssessmentKind = 'batting' | 'defense' | 'fungo';
export type AssessmentRecordKind = AssessmentKind | 'batting-attempt';
export interface AssessmentManagerData {
  assessors: { id: string; name: string; createdAt: string; archivedAt: string | null }[];
  dayHistory: {
    id: string;
    kind: AssessmentKind;
    date: string;
    archived: boolean;
    at: string;
    actor: string;
    reason: string;
    affected: { id: string; revisionId: string }[];
    /** New evaluation on a deleted date; records remain cancelled. */
    restart?: AssessmentDayRestart;
  }[];
}
export function assessmentDayArchived(
  data: Pick<Workspace, 'assessmentManagement'>,
  kind: AssessmentKind,
  date: string,
) {
  return (
    data.assessmentManagement.dayHistory.filter((h) => h.kind === kind && h.date === date).at(-1)
      ?.archived ?? false
  );
}
export function assertAssessmentDayOpen(
  data: Pick<Workspace, 'assessmentManagement'>,
  kind: AssessmentKind,
  date: string,
) {
  if (assessmentDayArchived(data, kind, date))
    throw Error('삭제한 평가 날짜입니다. 삭제 목록에서 먼저 복원하세요');
}
