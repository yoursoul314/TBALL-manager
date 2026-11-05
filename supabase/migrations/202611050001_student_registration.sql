-- Additive migration: no existing browser workspace or game data is uploaded.
begin;
create schema if not exists tb_registration_private;
revoke all on schema tb_registration_private from public, anon, authenticated;

create table tb_registration_private.teachers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true
);
create table tb_registration_private.cohorts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  organization text not null check (length(organization) between 1 and 100),
  privacy_notice text not null check (length(privacy_notice) between 20 and 2000),
  token_hash bytea not null unique,
  closes_at timestamptz not null,
  retention_days integer not null check (retention_days between 1 and 90),
  max_applications integer not null check (max_applications between 1 and 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table tb_registration_private.applications (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references tb_registration_private.cohorts(id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(name) between 1 and 80),
  grade integer not null check (grade between 1 and 3),
  classroom text not null check (classroom ~ '^[1-9][0-9]?$'),
  student_number integer not null check (student_number between 1 and 999),
  pref1 text check (pref1 in ('1B','2B','SS','3B','HP','P','LF','CF1','CF2','RF')),
  pref2 text check (pref2 in ('1B','2B','SS','3B','HP','P','LF','CF1','CF2','RF')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  player_id text check (length(player_id) between 1 and 120),
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz not null,
  check (pref1 is null or pref2 is null or pref1 <> pref2),
  check ((status = 'approved') = (player_id is not null)),
  unique(cohort_id, client_id),
  unique(cohort_id, grade, classroom, student_number)
);
create index on tb_registration_private.applications(expires_at);
create table tb_registration_private.audit (
  id bigint generated always as identity primary key,
  cohort_id uuid references tb_registration_private.cohorts(id) on delete cascade,
  application_id uuid references tb_registration_private.applications(id) on delete cascade,
  actor uuid,
  action text not null,
  at timestamptz not null default now()
);
-- No direct table access, including authenticated students or non-owner teachers.
alter table tb_registration_private.teachers enable row level security;
alter table tb_registration_private.cohorts enable row level security;
alter table tb_registration_private.applications enable row level security;
alter table tb_registration_private.audit enable row level security;
revoke all on all tables in schema tb_registration_private from public, anon, authenticated;
revoke all on all sequences in schema tb_registration_private from public, anon, authenticated;

create function public.tb_registration_teacher() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from tb_registration_private.teachers where user_id = auth.uid() and enabled) then
    raise exception 'TBREG:등록된 담당 교사만 신청함을 사용할 수 있습니다.';
  end if;
  return true;
end $$;

create function public.tb_registration_purge() returns void
language sql security definer set search_path = '' as $$
  delete from tb_registration_private.applications where expires_at <= now();
  delete from tb_registration_private.cohorts where closes_at + retention_days * interval '1 day' <= now();
$$;

create function public.tb_registration_create(input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c tb_registration_private.cohorts;
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public.tb_registration_teacher();
  perform public.tb_registration_purge();
  if (input->>'closes_at')::timestamptz <= now() or (input->>'closes_at')::timestamptz > now() + interval '90 days' then
    raise exception 'TBREG:접수 마감은 현재부터 90일 이내로 지정하세요.';
  end if;
  if (select count(*) from tb_registration_private.cohorts where owner_id = auth.uid()) >= 50 then
    raise exception 'TBREG:보관 중인 접수는 최대 50개입니다.';
  end if;
  insert into tb_registration_private.cohorts(owner_id,title,organization,privacy_notice,token_hash,closes_at,retention_days,max_applications)
    values(auth.uid(),btrim(input->>'title'),btrim(input->>'organization'),btrim(input->>'privacy_notice'),
      sha256(convert_to(token,'UTF8')),(input->>'closes_at')::timestamptz,(input->>'retention_days')::int,(input->>'max_applications')::int)
    returning * into c;
  insert into tb_registration_private.audit(cohort_id,actor,action) values(c.id,auth.uid(),'create');
  return jsonb_build_object('id',c.id,'token',token);
end $$;

create function public.tb_registration_cohorts() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tb_registration_teacher();
  perform public.tb_registration_purge();
  return coalesce((select jsonb_agg(to_jsonb(c) - 'token_hash' - 'owner_id' order by created_at desc)
    from tb_registration_private.cohorts c where owner_id = auth.uid()),'[]'::jsonb);
end $$;

create function public.tb_registration_close(cohort uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tb_registration_teacher();
  update tb_registration_private.cohorts set enabled=false where id=cohort and owner_id=auth.uid();
  if not found then raise exception 'TBREG:해당 접수의 담당 교사가 아닙니다.'; end if;
  insert into tb_registration_private.audit(cohort_id,actor,action) values(cohort,auth.uid(),'close');
end $$;

create function public.tb_registration_rotate(cohort uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public.tb_registration_teacher();
  update tb_registration_private.cohorts set token_hash=sha256(convert_to(token,'UTF8'))
    where id=cohort and owner_id=auth.uid() and enabled and closes_at>now();
  if not found then raise exception 'TBREG:사용 가능한 접수가 아닙니다.'; end if;
  insert into tb_registration_private.audit(cohort_id,actor,action) values(cohort,auth.uid(),'rotate-link');
  return token;
end $$;

create function public.tb_registration_invitation(invite_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c tb_registration_private.cohorts;
begin
  if length(invite_token) <> 64 then raise exception 'TBREG:사용할 수 없거나 마감된 초대 링크입니다.'; end if;
  select * into c from tb_registration_private.cohorts
    where token_hash=sha256(convert_to(invite_token,'UTF8')) and enabled and closes_at>now();
  if not found then raise exception 'TBREG:사용할 수 없거나 마감된 초대 링크입니다.'; end if;
  return to_jsonb(c) - 'token_hash' - 'owner_id' - 'created_at' - 'enabled';
end $$;

create function public.tb_registration_submit(invite_token text, client_id uuid, input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c tb_registration_private.cohorts;
  previous tb_registration_private.applications;
  request_id uuid;
  room text;
begin
  if length(invite_token) <> 64 or client_id is null then raise exception 'TBREG:초대 링크를 확인하세요.'; end if;
  -- Serialize cap/duplicates/close even when several students submit at once.
  select * into c from tb_registration_private.cohorts
    where token_hash=sha256(convert_to(invite_token,'UTF8')) for update;
  if not found or not c.enabled or c.closes_at<=now() then raise exception 'TBREG:사용할 수 없거나 마감된 초대 링크입니다.'; end if;
  if input->'acknowledged' is distinct from 'true'::jsonb then raise exception 'TBREG:등록 안내를 확인하세요.'; end if;
  if btrim(input->>'classroom') !~ '^[0-9]{1,2}$' then raise exception 'TBREG:반을 확인하세요.'; end if;
  room := (btrim(input->>'classroom')::int)::text;
  select * into previous from tb_registration_private.applications a
    where a.cohort_id=c.id and a.client_id=tb_registration_submit.client_id and a.expires_at>now();
  if found then
    if previous.name=btrim(input->>'name') and previous.grade=(input->>'grade')::int
      and previous.classroom=room and previous.student_number=(input->>'student_number')::int
      and previous.pref1 is not distinct from input->>'pref1' and previous.pref2 is not distinct from input->>'pref2' then
      return previous.id;
    end if;
    raise exception 'TBREG:앞서 전송된 신청이 있습니다. 담당 선생님께 수정을 요청하세요.';
  end if;
  delete from tb_registration_private.applications where cohort_id=c.id and expires_at<=now();
  if exists(select 1 from tb_registration_private.applications where cohort_id=c.id
      and grade=(input->>'grade')::int and classroom=room and student_number=(input->>'student_number')::int) then
    raise exception 'TBREG:같은 학년·반·번호로 접수된 신청이 있습니다. 담당 선생님께 확인하세요.';
  end if;
  if (select count(*) from tb_registration_private.applications where cohort_id=c.id) >= c.max_applications then
    raise exception 'TBREG:접수 인원이 찼습니다. 담당 선생님께 확인하세요.';
  end if;
  -- Per-invitation burst cap, shared by all devices. Replays do not consume it.
  if (select count(*) from tb_registration_private.applications where cohort_id=c.id and created_at>now()-interval '1 minute') >= 60 then
    raise exception 'TBREG:신청이 집중되고 있습니다. 잠시 후 같은 화면에서 다시 전송하세요.';
  end if;
  insert into tb_registration_private.applications(cohort_id,client_id,name,grade,classroom,student_number,pref1,pref2,expires_at)
    values(c.id,client_id,btrim(input->>'name'),(input->>'grade')::int,room,(input->>'student_number')::int,
      input->>'pref1',input->>'pref2',now()+c.retention_days*interval '1 day') returning id into request_id;
  insert into tb_registration_private.audit(cohort_id,application_id,action) values(c.id,request_id,'submit');
  return request_id;
end $$;

create function public.tb_registration_applications(cohort uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.tb_registration_teacher();
  if not exists(select 1 from tb_registration_private.cohorts where id=cohort and owner_id=auth.uid()) then
    raise exception 'TBREG:해당 접수의 담당 교사가 아닙니다.';
  end if;
  perform public.tb_registration_purge();
  return coalesce((select jsonb_agg(to_jsonb(a) - 'client_id' order by created_at)
    from tb_registration_private.applications a where cohort_id=cohort and expires_at>now()),'[]'::jsonb);
end $$;

create function public.tb_registration_review(application uuid, approve boolean, existing_player_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a tb_registration_private.applications;
begin
  perform public.tb_registration_teacher();
  select r.* into a from tb_registration_private.applications r
    join tb_registration_private.cohorts c on c.id=r.cohort_id
    where r.id=application and c.owner_id=auth.uid() and r.expires_at>now() for update of r;
  if not found then raise exception 'TBREG:접근할 수 없거나 보관 기간이 지난 신청입니다.'; end if;
  -- Approved IDs are immutable so retries on different devices cannot duplicate players.
  if a.status='approved' then
    if approve and (existing_player_id is null or existing_player_id=a.player_id) then return to_jsonb(a)-'client_id'; end if;
    raise exception 'TBREG:이미 승인한 신청은 변경할 수 없습니다. 선수 화면에서 수정하세요.';
  end if;
  update tb_registration_private.applications set
    status=case when approve then 'approved' else 'rejected' end,
    player_id=case when approve then coalesce(existing_player_id,'reg-'||a.id::text) else null end,
    reviewed_at=now() where id=application returning * into a;
  insert into tb_registration_private.audit(cohort_id,application_id,actor,action)
    values(a.cohort_id,a.id,auth.uid(),a.status);
  return to_jsonb(a)-'client_id';
end $$;

revoke all on function public.tb_registration_teacher(), public.tb_registration_purge(),
  public.tb_registration_create(jsonb), public.tb_registration_cohorts(), public.tb_registration_close(uuid),
  public.tb_registration_rotate(uuid), public.tb_registration_invitation(text),
  public.tb_registration_submit(text,uuid,jsonb), public.tb_registration_applications(uuid),
  public.tb_registration_review(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.tb_registration_invitation(text), public.tb_registration_submit(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.tb_registration_teacher(), public.tb_registration_create(jsonb),
  public.tb_registration_cohorts(), public.tb_registration_close(uuid), public.tb_registration_rotate(uuid),
  public.tb_registration_applications(uuid), public.tb_registration_review(uuid,boolean,text) to authenticated;
commit;
