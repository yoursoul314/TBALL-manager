import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import StudentRegistration from './StudentRegistration';
import RegistrationManager from './RegistrationManager';
import { importApplication, applicationInput, type Application, type Cohort } from './model';
import { validRegistrationConfig, type RegistrationApi } from './api';
import { createDemoWorkspace } from '../data/seed';
import { LocalWorkspaceRepository } from '../data/repository';
import { parseWorkspace } from '../data/schema';
import { assertPublicRegistrationConfig } from './config';

const cohort: Cohort = {
  id: 'test-cohort',
  title: '가상 수업',
  organization: '검증 학교',
  privacy_notice: '가상 데이터만 입력하는 선수 등록 테스트 안내입니다.',
  closes_at: '2099-01-01T00:00:00Z',
  retention_days: 30,
  max_applications: 100,
  enabled: true,
  created_at: '2026-11-05T00:00:00Z',
};
const request: Application = {
  id: 'test-application',
  cohort_id: cohort.id,
  name: '가상 신청 학생',
  grade: 3,
  classroom: '9',
  student_number: 99,
  pref1: 'SS',
  pref2: '1B',
  status: 'pending',
  player_id: null,
  created_at: '2026-11-05T00:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
};
function fakeApi(): RegistrationApi {
  return {
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    cohorts: vi.fn().mockResolvedValue([cohort]),
    createCohort: vi.fn().mockResolvedValue({ id: cohort.id, token: 'a'.repeat(64) }),
    closeCohort: vi.fn().mockResolvedValue(undefined),
    rotateLink: vi.fn().mockResolvedValue('b'.repeat(64)),
    applications: vi.fn().mockResolvedValue([request]),
    invitation: vi.fn().mockResolvedValue(cohort),
    review: vi.fn().mockResolvedValue({ ...request, status: 'approved', player_id: 'reg-test' }),
    submit: vi.fn().mockResolvedValue('test-receipt'),
  };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it('미연결 시 학생 입력·전송이 비활성화되고 비밀 키 설정을 허용하지 않음', () => {
  render(<StudentRegistration api={null} />);
  expect(screen.getByRole('status')).toHaveTextContent('서버가 아직 연결되지');
  expect(screen.queryByLabelText('이름')).toBeNull();
  expect(
    validRegistrationConfig({ url: 'https://project.supabase.co', key: 'sb_secret_test' }),
  ).toBe(false);
  expect(
    validRegistrationConfig({ url: 'http://project.supabase.co', key: 'sb_publishable_test' }),
  ).toBe(false);
  expect(
    validRegistrationConfig({ url: 'https://project.supabase.co', key: 'sb_publishable_test' }),
  ).toBe(true);
  expect(() =>
    assertPublicRegistrationConfig({
      url: 'https://project.supabase.co',
      key: 'sb_secret_do-not-expose',
    }),
  ).toThrow('비밀 키');
  expect(() => assertPublicRegistrationConfig({})).not.toThrow();
});
it('학생은 정상 신청 후 접수번호를 보고 입력 개인정보를 기기 저장소에 남기지 않음', async () => {
  const api = fakeApi();
  const set = vi.spyOn(Storage.prototype, 'setItem');
  render(<StudentRegistration api={api} />);
  fireEvent.change(await screen.findByLabelText('이름'), { target: { value: '가상 신청 학생' } });
  fireEvent.change(screen.getByLabelText('학년'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('반'), { target: { value: '01' } });
  fireEvent.change(screen.getByLabelText('번호'), { target: { value: '7' } });
  fireEvent.click(screen.getByLabelText('등록 안내를 확인했습니다.'));
  fireEvent.click(screen.getByRole('button', { name: '등록 신청 보내기' }));
  expect(await screen.findByText('신청을 접수했습니다')).toBeVisible();
  expect(api.submit).toHaveBeenCalledWith(
    '',
    expect.any(String),
    expect.objectContaining({ classroom: '1', pref1: null, pref2: null }),
  );
  expect(JSON.stringify(set.mock.calls)).not.toContain('가상 신청 학생');
  expect(screen.queryByText('경기 기록실')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '다른 학생 등록 · 입력값 비우기' }));
  expect(screen.getByLabelText('이름')).toHaveValue('');
  expect(screen.getByLabelText('학년')).toHaveValue('');
  expect(screen.getByLabelText('등록 안내를 확인했습니다.')).not.toBeChecked();
});
it('전송 실패 시 입력 유지·동일 요청 ID로 재시도·빠른 중복 터치 차단', async () => {
  const api = fakeApi();
  vi.mocked(api.submit).mockRejectedValueOnce(Error('연결 실패')).mockResolvedValue('receipt');
  render(<StudentRegistration api={api} />);
  fireEvent.change(await screen.findByLabelText('이름'), { target: { value: '가상 신청 학생' } });
  fireEvent.change(screen.getByLabelText('학년'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('반'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('번호'), { target: { value: '7' } });
  fireEvent.click(screen.getByLabelText('등록 안내를 확인했습니다.'));
  fireEvent.click(screen.getByRole('button', { name: '등록 신청 보내기' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('연결 실패');
  expect(screen.getByLabelText('이름')).toHaveValue('가상 신청 학생');
  fireEvent.click(screen.getByRole('button', { name: '등록 신청 보내기' }));
  await screen.findByText('신청을 접수했습니다');
  expect(api.submit).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.submit).mock.calls[0][1]).toBe(vi.mocked(api.submit).mock.calls[1][1]);
});
it('승인 전 추가 불가·승인 후 재수입은 같은 선수·기존 기록과 백업 유지', () => {
  const data = createDemoWorkspace();
  const before = JSON.stringify(data);
  expect(() => importApplication(data, request)).toThrow('승인');
  const approved = { ...request, status: 'approved' as const, player_id: 'reg-test' };
  const next = importApplication(data, approved);
  expect(next.players).toHaveLength(data.players.length + 1);
  expect(next.players.at(-1)).toMatchObject({ teamId: null, number: 0, pref1: 'SS' });
  expect(importApplication(next, { ...approved, name: '임의 변경' })).toBe(next);
  expect(JSON.stringify(data)).toBe(before);
  expect(next.events).toBe(data.events);
  expect(next.assessments).toBe(data.assessments);
  expect(parseWorkspace(next).schemaVersion).toBe(16);
  const repo = new LocalWorkspaceRepository(localStorage);
  repo.save(next, 0);
  expect(new LocalWorkspaceRepository(localStorage).load()?.players.at(-1)).toMatchObject({
    id: 'reg-test',
  });
});
it('동일 학생 기존 선수 연결은 기존 이름·팀·평가를 덮어쓰지 않음', () => {
  const data = createDemoWorkspace();
  data.players[0] = { ...data.players[0], grade: 3, classroom: '09', studentNumber: 99 };
  const approved = { ...request, status: 'approved' as const, player_id: 'new-id' };
  expect(() => importApplication(data, approved)).toThrow('기존 선수');
  expect(importApplication(data, { ...approved, player_id: data.players[0].id })).toBe(data);
  expect(applicationInput.safeParse({ ...request, acknowledged: true, pref2: 'SS' }).success).toBe(
    false,
  );
});
async function login() {
  fireEvent.change(screen.getByLabelText('교사 이메일'), {
    target: { value: 'teacher@example.invalid' },
  });
  fireEvent.change(screen.getByLabelText('교사 비밀번호'), {
    target: { value: 'synthetic-test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: '교사 로그인' }));
  return await screen.findByRole('article', { name: '가상 신청 학생 등록 신청' });
}
it('감독 승인 후 로컬 저장 실패 시 승인 기록을 유지하고 재시도로 같은 ID만 저장', async () => {
  const api = fakeApi();
  const save = vi.fn().mockImplementationOnce(() => {
    throw Error('기기 용량 부족');
  });
  render(<RegistrationManager data={createDemoWorkspace()} onSave={save} api={api} />);
  const card = await login();
  fireEvent.click(within(card).getByRole('button', { name: '승인 · 선수 추가' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('기기 용량 부족');
  fireEvent.click(within(card).getByRole('button', { name: '이 기기 명단에 반영' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(api.review).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[1][0].players.at(-1).id).toBe(save.mock.calls[0][0].players.at(-1).id);
});
it('기존 학생이 겹치면 확인 전 승인 차단·반려는 로컬 선수 명단 변경 없음', async () => {
  const api = fakeApi();
  const data = createDemoWorkspace();
  data.players[0] = { ...data.players[0], grade: 3, classroom: '9', studentNumber: 99 };
  const save = vi.fn();
  render(<RegistrationManager data={data} onSave={save} api={api} />);
  const card = await login();
  expect(within(card).getByRole('button', { name: '기존 선수로 연결 · 승인' })).toBeDisabled();
  vi.mocked(api.review).mockResolvedValue({ ...request, status: 'rejected' });
  fireEvent.click(within(card).getByRole('button', { name: '반려' }));
  await waitFor(() => expect(api.review).toHaveBeenCalledWith(request.id, false));
  expect(save).not.toHaveBeenCalled();
});
