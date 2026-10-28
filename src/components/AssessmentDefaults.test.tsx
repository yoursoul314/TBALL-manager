import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { createDemoWorkspace } from '../data/seed';
import { AssessmentView } from './AssessmentView';
import { AssessmentProvider, AssessorPicker } from './AssessorPicker';
import {
  LAST_ASSESSOR_KEY,
  lastAssessorName,
  rememberAssessor,
} from '../data/assessmentPreferences';
import { LocalWorkspaceRepository } from '../data/repository';
import { resetWorkspace } from '../domain/reset';
const at = '2026-10-28T01:00:00Z';
const fixture = () => {
  const d = createDemoWorkspace();
  d.assessmentManagement.assessors = [
    { id: 'assessor-a', name: '가상 A', createdAt: at, archivedAt: null },
    { id: 'assessor-b', name: '가상 B', createdAt: at, archivedAt: null },
  ];
  return d;
};
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const group = (label: string) => within(screen.getByRole('group', { name: label }));
const selected = (label: string, name: string) =>
  expect(group(label).getByRole('button', { name: '✓ ' + name })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});
it('새 타격/수비 날짜 기본 목적과 마지막 평가자 변경·재마운트 기억, 과거 기록 보존', () => {
  let saved = fixture();
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <AssessmentView
        data={d}
        onSave={(v) => {
          saved = v;
          setD(v);
        }}
      />
    );
  }
  let view = render(<Host />);
  selected('공통 평가 목적 선택', '타격 평가');
  expect(screen.getByLabelText('공통 평가 목적', { exact: true })).toHaveValue('타격 평가');
  fireEvent.click(group('공통 평가자').getByRole('button', { name: '가상 A' }));
  fill('새 평가 날짜', '2026-10-27');
  click('평가 날짜 생성');
  expect(saved.battingDays[0]).toMatchObject({ assessor: '가상 A', purpose: '타격 평가' });
  click('1 날짜·설정');
  click('새 평가 날짜 만들기');
  selected('공통 평가자', '가상 A');
  selected('공통 평가 목적 선택', '타격 평가');
  click('수비 체크리스트');
  selected('수비 공통 평가자', '가상 A');
  selected('수비 평가 목적 선택', '수비 평가');
  fireEvent.click(group('수비 공통 평가자').getByRole('button', { name: '가상 B' }));
  fill('새 수비 평가 날짜', '2026-10-28');
  click('수비 평가 날짜 생성');
  expect(saved.defenseDays[0]).toMatchObject({ assessor: '가상 B', purpose: '수비 평가' });
  expect(saved.battingDays[0].assessor).toBe('가상 A');
  expect(localStorage.getItem(LAST_ASSESSOR_KEY)).toBe('assessor-b');
  view.unmount();
  view = render(<Host />);
  click('새 평가 날짜 만들기');
  selected('공통 평가자', '가상 B');
});
it('사용 중지/없는 ID는 자동 선택하지 않고, 기존 기록/처리자에는 기본값을 덮지 않음', () => {
  const d = fixture();
  rememberAssessor('assessor-a');
  d.assessmentManagement.assessors[0].archivedAt = at;
  expect(lastAssessorName(d)).toBe('');
  rememberAssessor('missing');
  expect(lastAssessorName(d)).toBe('');
  rememberAssessor('assessor-b');
  render(
    <AssessmentProvider data={d} onSave={() => {}}>
      <AssessorPicker label="새 평가자" name="assessor" remember />
      <AssessorPicker label="기존 기록" defaultValue="이전 기록원" />
      <AssessorPicker label="처리 평가자" />
    </AssessmentProvider>,
  );
  selected('새 평가자', '가상 B');
  selected('기존 기록', '이전 기록원');
  expect(group('처리 평가자').getByText('등록한 평가자를 선택하세요.')).toBeInTheDocument();
});
it('기억 저장 실패에도 현재 평가자 선택은 유지하고 평가 원본을 저장하지 않음', () => {
  const d = fixture(),
    save = vi.fn();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  render(
    <AssessmentProvider data={d} onSave={save}>
      <AssessorPicker label="새 평가자" name="assessor" remember />
    </AssessmentProvider>,
  );
  fireEvent.click(group('새 평가자').getByRole('button', { name: '가상 A' }));
  selected('새 평가자', '가상 A');
  expect(screen.getByRole('status')).toHaveTextContent('기억에 실패');
  expect(save).not.toHaveBeenCalled();
});
it('전체 초기화는 마지막 평가자 ID를 제거하고 기록 초기화는 유지', () => {
  const repo = new LocalWorkspaceRepository(localStorage);
  let d = repo.save(fixture(), 0);
  rememberAssessor('assessor-a');
  d = repo.save(resetWorkspace(d, 'evaluations', at), d.revision);
  expect(lastAssessorName(d)).toBe('가상 A');
  repo.resetAll(resetWorkspace(d, 'all', at), d.revision);
  expect(localStorage.getItem(LAST_ASSESSOR_KEY)).toBeNull();
});
it('미리보기는 sessionStorage에서만 기억하여 실제 기기 선호값을 변경하지 않음', () => {
  rememberAssessor('assessor-a');
  window.history.replaceState({}, '', '/?preview=1');
  rememberAssessor('assessor-b');
  expect(lastAssessorName(fixture())).toBe('가상 B');
  expect(localStorage.getItem(LAST_ASSESSOR_KEY)).toBe('assessor-a');
  window.history.replaceState({}, '', '/');
  expect(lastAssessorName(fixture())).toBe('가상 A');
});
