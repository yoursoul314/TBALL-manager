import { z } from 'zod';
import { ABILITIES } from '../config/positions';
import { DEFENSE_SITUATIONS, DEFENSE_ERRORS } from '../domain/defenseAssessment';
const id = z.string().min(1).max(120),
  text = z.string().trim().min(1).max(200);
export const defenseRubricSchema = z
  .object({
    version: z.literal('defense-checklist-trial-v1'),
    success: z.number().positive().max(100),
    partial: z.number().min(0).max(100),
    failure: z.number().min(0).max(100),
  })
  .refine(
    (r) => r.success > r.partial && r.partial >= r.failure,
    '성공 > 부분 수행 ≥ 실패 점수여야 합니다',
  );
export const defenseRevisionSchema = z.object({
  id,
  date: z.iso.date(),
  situation: z.enum(
    Object.keys(DEFENSE_SITUATIONS) as [
      keyof typeof DEFENSE_SITUATIONS,
      ...(keyof typeof DEFENSE_SITUATIONS)[],
    ],
  ),
  observations: z.record(
    z.enum(ABILITIES),
    z.enum(['success', 'partial', 'failure', 'not-offered']).nullable(),
  ),
  error: z
    .enum(
      Object.keys(DEFENSE_ERRORS) as [
        keyof typeof DEFENSE_ERRORS,
        ...(keyof typeof DEFENSE_ERRORS)[],
      ],
    )
    .nullable(),
  note: z.string().max(2000),
  assessor: text,
  rubric: defenseRubricSchema,
  status: z.enum(['active', 'cancelled']),
  changedAt: z.iso.datetime(),
  changedBy: text,
  reason: z.string().trim().min(1).max(2000),
});
export const defenseAssessmentsSchema = z
  .array(
    z.object({
      id,
      playerId: id,
      createdAt: z.iso.datetime(),
      revisions: z.array(defenseRevisionSchema).min(1).max(1000),
    }),
  )
  .max(100000)
  .superRefine((rows, ctx) => {
    const ids = new Set<string>(),
      revisions = new Set<string>();
    for (const r of rows) {
      if (ids.has(r.id)) ctx.addIssue({ code: 'custom', message: '수비 평가 ID 중복' });
      ids.add(r.id);
      let at = r.createdAt;
      if (r.revisions[0].changedAt !== r.createdAt || r.revisions[0].status !== 'active')
        ctx.addIssue({ code: 'custom', message: '수비 평가 원본 이력 오류' });
      for (const v of r.revisions) {
        if (revisions.has(v.id) || Date.parse(v.changedAt) < Date.parse(at))
          ctx.addIssue({ code: 'custom', message: '수비 평가 정정 ID·시각 오류' });
        revisions.add(v.id);
        at = v.changedAt;
      }
    }
  });
