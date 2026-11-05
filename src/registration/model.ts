import { z } from 'zod';
import { POSITIONS } from '../config/positions';
import type { Player, Workspace } from '../domain/model';

export const applicationInput = z
  .object({
    name: z.string().trim().min(1, '이름을 입력하세요').max(80),
    grade: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    classroom: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, '반은 1~99 사이의 숫자입니다')
      .refine((v) => Number(v) > 0)
      .transform((v) => String(Number(v))),
    student_number: z.number().int().min(1).max(999),
    pref1: z.enum(POSITIONS).nullable(),
    pref2: z.enum(POSITIONS).nullable(),
    acknowledged: z.literal(true, { error: '등록 안내를 확인하세요' }),
  })
  .refine((v) => !v.pref1 || v.pref1 !== v.pref2, '1·2지망은 다르게 선택하세요');
export type ApplicationInput = z.infer<typeof applicationInput>;
export const cohortInput = z.object({
  title: z.string().trim().min(1).max(100),
  organization: z.string().trim().min(1).max(100),
  privacy_notice: z
    .string()
    .trim()
    .min(20, '학생에게 보여줄 수집 목적·문의처·처리 안내를 작성하세요')
    .max(2000),
  closes_at: z.iso.datetime(),
  retention_days: z.number().int().min(1).max(90),
  max_applications: z.number().int().min(1).max(500),
});
export type CohortInput = z.infer<typeof cohortInput>;
export interface Cohort extends CohortInput {
  id: string;
  enabled: boolean;
  created_at: string;
}
export interface Invitation extends CohortInput {
  id: string;
}
export interface Application extends Omit<ApplicationInput, 'acknowledged'> {
  id: string;
  cohort_id: string;
  status: 'pending' | 'approved' | 'rejected';
  player_id: string | null;
  created_at: string;
  expires_at: string;
}
export function matchingPlayers(data: Workspace, request: Application): Player[] {
  return data.players.filter(
    (p) =>
      p.grade === request.grade &&
      Number(p.classroom) === Number(request.classroom) &&
      p.studentNumber === request.student_number,
  );
}
/** Only additive. The server's stable player ID makes retry/import on another device idempotent. */
export function importApplication(data: Workspace, request: Application): Workspace {
  if (request.status !== 'approved' || !request.player_id)
    throw Error('감독이 승인한 신청만 추가할 수 있습니다.');
  if (data.players.some((p) => p.id === request.player_id)) return data;
  if (matchingPlayers(data, request).length)
    throw Error('학년·반·번호가 같은 기존 선수가 있습니다. 기존 선수 연결을 먼저 확인하세요.');
  const player: Player = {
    id: request.player_id,
    teamId: null,
    name: request.name,
    number: 0,
    active: true,
    grade: request.grade,
    classroom: request.classroom,
    studentNumber: request.student_number,
    pref1: request.pref1,
    pref2: request.pref2,
  };
  return { ...data, players: [...data.players, player] };
}
export const REGISTRATION_SETUP =
  '학생 등록 서버가 아직 연결되지 않았습니다. 담당 선생님께 등록 시작 여부를 확인하세요.';
