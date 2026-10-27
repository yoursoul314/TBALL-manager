import { z } from 'zod';
const id = z.string().min(1).max(120),
  text = z.string().trim().min(1).max(200),
  n = z.number().min(0).max(10).nullable(),
  mark = z.number().int().min(0).max(3).nullable();
const scores = z.object({ G: n, F: n, C: n, T_acc: n, T_pow: n });
export const fungoAssessmentsSchema = z
  .array(
    z.object({
      id,
      playerId: id,
      revisions: z
        .array(
          z.object({
            id,
            at: z.iso.datetime(),
            by: text,
            reason: z.string().trim().min(1).max(2000),
            version: z.literal('fungo-five-v1'),
            status: z.enum(['active', 'cancelled']),
            date: z.iso.date(),
            assessor: text,
            mode: z.enum(['quick', 'precise']),
            balls: z
              .array(
                z.object({ kind: z.enum(['G', 'F', 'C']), catch: mark, throw: mark, power: n }),
              )
              .length(5),
            manual: scores,
            note: z.string().max(2000),
          }),
        )
        .min(1)
        .max(10000),
    }),
  )
  .max(100000);
export const fungoDaysSchema = z
  .array(z.object({ date: z.iso.date(), assessor: text, playerIds: z.array(id).max(2000) }))
  .max(20000);
