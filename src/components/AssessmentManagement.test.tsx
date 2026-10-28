import { expect, it, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useState } from 'react';
import { AssessmentView } from './AssessmentView';
import { createDemoWorkspace } from '../data/seed';
import { createAssessmentDay, startDayAssessments } from '../assessment/days';
import { recordBattingAttempt, blankAttempt } from '../assessment/batting';
import { summarizeBatting } from '../assessment/battingSummary';
import { AssessmentProvider, AssessorPicker } from './AssessorPicker';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const select = (label: string) =>
  fireEvent.click(
    within(screen.getByRole('group', { name: label })).getByRole('button', {
      name: /^(✓ )?가상 평가자$/,
    }),
  );
afterEach(cleanup);
it('평가자 등록 한 번 후 버튼으로 선택하고 날짜 전체 삭제·복원', () => {
  const at = '2026-10-28T01:00:00Z',
    date = '2026-10-28';
  let saved = createAssessmentDay(createDemoWorkspace(), {
    date,
    assessor: '이전 평가자',
    purpose: '평가',
    note: '',
    targetAttempts: 2,
    createdAt: at,
  });
  saved = startDayAssessments(saved, date, ['green-1'], {
    id: 's',
    at,
    actor: '이전 평가자',
    reason: '생성',
  });
  saved = recordBattingAttempt(
    saved,
    saved.battingSessions[0].id,
    1,
    { ...blankAttempt(), result: 'fair', score: 8 },
    { id: 'a', at, actor: '이전 평가자', reason: '기록' },
  );
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
  render(<Host />);
  click('평가자·기록 관리');
  fill('등록할 평가자', '가상 평가자');
  click('평가자 등록 저장');
  expect(saved.assessmentManagement.assessors).toHaveLength(1);
  expect(saved.battingSessions[0].assessor).toBe('이전 평가자');
  click('선택 날짜 삭제');
  expect(screen.getByRole('button', { name: '삭제 확인' })).toBeDisabled();
  select('처리 평가자');
  click('삭제 확인');
  expect(summarizeBatting(saved, 'green-1').count).toBe(0);
  expect(saved.battingAttempts[0].score).toBe(8);
  click('선택 날짜 복원');
  select('처리 평가자');
  click('복원 확인');
  expect(summarizeBatting(saved, 'green-1').score).toBe(80);
  click('타격 회차');
  click('기록 삭제');
  select('처리 평가자');
  click('삭제 확인');
  expect(summarizeBatting(saved, 'green-1').score).toBeNull();
  click('삭제한 기록');
  click('기록 복원');
  select('처리 평가자');
  click('복원 확인');
  expect(summarizeBatting(saved, 'green-1').score).toBe(80);
});
it('평가자 등록 실패는 이름을 유지하고 재시도 후 터치 선택 가능', () => {
  let saved = createDemoWorkspace(),
    fail = true;
  function Host() {
    const [d, setD] = useState(saved),
      [actor, setActor] = useState('');
    return (
      <AssessmentProvider
        data={d}
        onSave={(v) => {
          if (fail) throw Error('저장 실패');
          saved = v;
          setD(v);
        }}
      >
        <AssessorPicker label="테스트 평가자" value={actor} onChange={setActor} />
      </AssessmentProvider>
    );
  }
  render(<Host />);
  click('평가자 등록·관리');
  fill('등록할 평가자', '가상 평가자');
  click('평가자 등록 저장');
  expect(screen.getByRole('alert')).toHaveTextContent('저장 실패');
  expect(screen.getByLabelText('등록할 평가자')).toHaveValue('가상 평가자');
  expect(saved.assessmentManagement.assessors).toHaveLength(0);
  fail = false;
  click('평가자 등록 저장');
  click('평가자 선택으로');
  select('테스트 평가자');
  expect(screen.getByRole('button', { name: '✓ 가상 평가자' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
it('삭제 저장 실패 시 원본과 삭제 대화상자를 유지', () => {
  const date = '2026-10-28',
    at = '2026-10-28T01:00:00Z';
  let d = createAssessmentDay(createDemoWorkspace(), {
    date,
    assessor: 'QA',
    purpose: '평가',
    note: '',
    targetAttempts: 1,
    createdAt: at,
  });
  d.assessmentManagement.assessors = [
    { id: 'a', name: '가상 평가자', createdAt: at, archivedAt: null },
  ];
  render(
    <AssessmentView
      data={d}
      onSave={() => {
        throw Error('저장 공간 부족');
      }}
    />,
  );
  click('선택 날짜 삭제');
  select('처리 평가자');
  click('삭제 확인');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('저장 공간 부족');
  expect(d.assessmentManagement.dayHistory).toEqual([]);
});
