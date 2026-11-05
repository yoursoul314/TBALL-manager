// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
const db = new PGlite();
const owner = '10000000-0000-4000-8000-000000000001',
  other = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
let cohort: { id: string; token: string };
const payload = {
  name: '가상 신청자',
  grade: 2,
  classroom: '01',
  student_number: 1,
  pref1: 'SS',
  pref2: '1B',
  acknowledged: true,
};
async function role(user?: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec('set role ' + (user ? 'authenticated' : 'anon'));
}
async function rpc<T = unknown>(name: string, values: unknown[] = []) {
  const args = values.map((_, i) => '$' + (i + 1)).join(',');
  const r = await db.query<{ result: T }>(`select public.${name}(${args}) as result`, values);
  return r.rows[0].result;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(readFileSync('supabase/migrations/202611050001_student_registration.sql', 'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)', [owner, other, outsider]);
  await db.query('insert into tb_registration_private.teachers(user_id) values ($1),($2)', [
    owner,
    other,
  ]);
  await role(owner);
  cohort = await rpc('tb_registration_create', [
    {
      title: '가상 접수',
      organization: '테스트 수업',
      privacy_notice: '테스트 자료만 사용하는 수업용 선수 신청·검증 안내입니다.',
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      retention_days: 30,
      max_applications: 100,
    },
  ]);
}, 60000);
afterAll(async () => {
  await db.close();
});

it('가입한 계정만으로 교사 권한을 얻지 못하고 담당 교사만 자기 접수를 조회', async () => {
  await role(outsider);
  await expect(rpc('tb_registration_cohorts')).rejects.toThrow('담당 교사');
  await role(other);
  expect(await rpc('tb_registration_cohorts')).toEqual([]);
  await expect(rpc('tb_registration_applications', [cohort.id])).rejects.toThrow('담당 교사');
  await expect(rpc('tb_registration_close', [cohort.id])).rejects.toThrow('담당 교사');
});
it('학생은 초대 안내만 읽고 명단·원본 테이블·관리 함수에 접근할 수 없음', async () => {
  await role();
  expect(await rpc('tb_registration_invitation', [cohort.token])).toMatchObject({
    title: '가상 접수',
  });
  expect(await rpc('tb_registration_invitation', [cohort.token])).not.toHaveProperty('owner_id');
  await expect(db.query('select * from tb_registration_private.applications')).rejects.toThrow(
    /permission denied/,
  );
  await expect(rpc('tb_registration_applications', [cohort.id])).rejects.toThrow(
    /permission denied/,
  );
  await expect(rpc('tb_registration_purge')).rejects.toThrow(/permission denied/);
});
it('안내 확인 없이 제출 불가, 서버에서도 학년·포지션 검증', async () => {
  await role();
  await expect(
    rpc('tb_registration_submit', [
      cohort.token,
      crypto.randomUUID(),
      { ...payload, acknowledged: false },
    ]),
  ).rejects.toThrow('등록 안내');
  await expect(
    rpc('tb_registration_submit', [cohort.token, crypto.randomUUID(), { ...payload, grade: 4 }]),
  ).rejects.toThrow(/check constraint/);
  await expect(
    rpc('tb_registration_submit', [cohort.token, crypto.randomUUID(), { ...payload, pref2: 'SS' }]),
  ).rejects.toThrow(/check constraint/);
});
it('재전송·동시 신청은 한 건으로 유지하고 기존 신청 내용을 덮어쓰지 않음', async () => {
  await role();
  const clientId = crypto.randomUUID();
  const [a, b] = await Promise.all([
    rpc('tb_registration_submit', [cohort.token, clientId, payload]),
    rpc('tb_registration_submit', [cohort.token, clientId, payload]),
  ]);
  expect(a).toBe(b);
  await expect(
    rpc('tb_registration_submit', [cohort.token, clientId, { ...payload, name: '바뀐 이름' }]),
  ).rejects.toThrow('앞서 전송');
  await expect(
    rpc('tb_registration_submit', [
      cohort.token,
      crypto.randomUUID(),
      { ...payload, classroom: '1' },
    ]),
  ).rejects.toThrow('같은 학년');
  await role(owner);
  const rows = await rpc<Record<string, unknown>[]>('tb_registration_applications', [cohort.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: payload.name, classroom: '1', status: 'pending' });
});
it('다른 교사의 승인 차단·승인 재시도 안정 ID·학생의 임의 승인 차단', async () => {
  await role(owner);
  const rows = await rpc<{ id: string }[]>('tb_registration_applications', [cohort.id]);
  await role(other);
  await expect(rpc('tb_registration_review', [rows[0].id, true, null])).rejects.toThrow(
    '접근할 수 없',
  );
  await role();
  await expect(rpc('tb_registration_review', [rows[0].id, true, null])).rejects.toThrow(
    /permission denied/,
  );
  await role(owner);
  const a = await rpc<{ player_id: string }>('tb_registration_review', [rows[0].id, true, null]);
  const b = await rpc<{ player_id: string }>('tb_registration_review', [rows[0].id, true, null]);
  expect(a.player_id).toBe('reg-' + rows[0].id);
  expect(b.player_id).toBe(a.player_id);
  await expect(rpc('tb_registration_review', [rows[0].id, true, 'different'])).rejects.toThrow(
    '이미 승인',
  );
});
it('기존 선수 연결은 기존 ID 유지·반려 후 확인하여 승인 가능', async () => {
  await role();
  const id = await rpc<string>('tb_registration_submit', [
    cohort.token,
    crypto.randomUUID(),
    { ...payload, student_number: 2 },
  ]);
  await role(owner);
  expect(await rpc('tb_registration_review', [id, false, null])).toMatchObject({
    status: 'rejected',
    player_id: null,
  });
  expect(await rpc('tb_registration_review', [id, true, 'local-existing-player'])).toMatchObject({
    status: 'approved',
    player_id: 'local-existing-player',
  });
});
it('보관 기한 지난 신청은 조회·승인에서 제외되고 실제 삭제', async () => {
  await db.exec('reset role');
  await db.exec(
    "update tb_registration_private.applications set expires_at=now()-interval '1 second'",
  );
  await role(owner);
  expect(await rpc('tb_registration_applications', [cohort.id])).toEqual([]);
  await db.exec('reset role');
  const n = await db.query<{ n: number }>(
    'select count(*)::int as n from tb_registration_private.applications',
  );
  expect(n.rows[0].n).toBe(0);
});
it('새 링크 발급 시 이전 링크 만료·마감 후 신규 신청 차단', async () => {
  await role(owner);
  const token = await rpc<string>('tb_registration_rotate', [cohort.id]);
  await role();
  await expect(rpc('tb_registration_invitation', [cohort.token])).rejects.toThrow('마감된');
  expect(await rpc('tb_registration_invitation', [token])).toMatchObject({ id: cohort.id });
  await role(owner);
  await rpc('tb_registration_close', [cohort.id]);
  await role();
  await expect(
    rpc('tb_registration_submit', [token, crypto.randomUUID(), payload]),
  ).rejects.toThrow('마감된');
});
it('서버의 접수 정원·날짜 제한과 해지된 교사 권한을 강제', async () => {
  await role(owner);
  const input = {
    title: '정원 테스트',
    organization: '가상 수업',
    privacy_notice: '테스트 자료만 사용하는 선수 신청 안내입니다.',
    closes_at: new Date(Date.now() + 86400000).toISOString(),
    retention_days: 1,
    max_applications: 1,
  };
  await expect(
    rpc('tb_registration_create', [{ ...input, closes_at: '2020-01-01T00:00:00Z' }]),
  ).rejects.toThrow('90일 이내');
  const cap = await rpc<{ id: string; token: string }>('tb_registration_create', [input]);
  await role();
  await rpc('tb_registration_submit', [cap.token, crypto.randomUUID(), payload]);
  await expect(
    rpc('tb_registration_submit', [
      cap.token,
      crypto.randomUUID(),
      { ...payload, student_number: 8 },
    ]),
  ).rejects.toThrow('인원이 찼');
  await db.exec('reset role');
  await db.query('update tb_registration_private.teachers set enabled=false where user_id=$1', [
    other,
  ]);
  await role(other);
  await expect(rpc('tb_registration_cohorts')).rejects.toThrow('담당 교사');
});
