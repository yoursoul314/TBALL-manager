import { z } from 'zod';
const id = z.string().min(1),
  at = z.iso.datetime();
export const attendanceStatus = z.enum([
  'unmarked',
  'present',
  'absent',
  'late',
  'left',
  'restricted',
]);
const group = z.object({
  grade: z.enum(['1', '2', '3', 'unset']),
  classroom: z.string().min(1).max(100),
});
const student = group.extend({
  playerId: id,
  name: z.string().min(1).max(200),
  number: z.number().int(),
  studentNumber: z.number().int().positive().nullable().optional(),
  status: attendanceStatus,
});
export const classDaySchema = z
  .object({
    id,
    date: z.iso.date(),
    groups: z.array(group).max(100),
    students: z.array(student).max(10000),
    createdAt: at,
    updatedAt: at,
    history: z
      .array(z.object({ id, at, playerId: id, before: attendanceStatus, after: attendanceStatus }))
      .max(100000),
  })
  .superRefine((day, ctx) => {
    if (new Set(day.students.map((s) => s.playerId)).size !== day.students.length)
      ctx.addIssue({ code: 'custom', message: '출석부 학생 중복' });
    if (new Set(day.groups.map((g) => JSON.stringify(g))).size !== day.groups.length)
      ctx.addIssue({ code: 'custom', message: '출석부 학급 중복' });
    if (
      day.students.some(
        (s) => !day.groups.some((g) => g.grade === s.grade && g.classroom === s.classroom),
      )
    )
      ctx.addIssue({ code: 'custom', message: '출석부 학급 불일치' });
    if (
      new Set(day.history.map((h) => h.id)).size !== day.history.length ||
      day.history.some((h) => !day.students.some((s) => s.playerId === h.playerId))
    )
      ctx.addIssue({ code: 'custom', message: '출석 정정 이력 불일치' });
  });
export const entryAttendanceSchema = z.object({
  dayId: id,
  date: z.iso.date(),
  groups: z.array(group),
  checkedAt: at,
  students: z.array(student.extend({ eligible: z.boolean() })),
});
