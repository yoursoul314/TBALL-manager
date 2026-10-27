import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useState } from 'react';
import App from '../App';
import { BattingDayView } from './BattingDayView';
import { NewGame } from './NewGame';
import { createDemoWorkspace } from '../data/seed';
import { createAssessmentDay } from '../assessment/days';
import { STORAGE_KEY } from '../data/repository';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
it('경기 학년·반 필터에서 여러 학생 선택을 유지하고 팀에 일괄 배정한다', () => {
  const d = createDemoWorkspace();
  d.players = d.players.map((p, i) => ({ ...p, grade: 2, classroom: i < 2 ? '1' : '2' }));
  render(<NewGame data={d} onCreate={() => {}} onClose={() => {}} />);
  click('등록 선수 불러오기');
  change('경기 선수 학년', '2');
  change('경기 선수 반', '1');
  click('검색 결과 전체 선택 · 2명');
  change('경기 선수 반', '2');
  expect(screen.getByText('선택 2명 · 표시 22명')).toBeInTheDocument();
  click('선택 학생 팀에 배정');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 2/10명' })).toBeInTheDocument();
  click('후공 엔트리 · 0/10명');
  click('등록 선수 불러오기');
  change('경기 선수 반', '1');
  expect(screen.queryByLabelText('샘플 선수 01 일괄 선택')).not.toBeInTheDocument();
});
it('날짜 생성 후 두 학생 평가·미저장 전환 차단·새로고침·학생별 점수 분리를 검증한다', () => {
  const d = createDemoWorkspace();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  let app = render(<App />);
  click('기능평가 & 팀워크');
  change('새 평가 날짜', '2026-10-26');
  change('공통 평가자', 'QA');
  change('공통 평가 목적', '날짜 평가');
  change('공통 타격 횟수', '1');
  click('평가 날짜 생성');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 평가 대상 선택'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 평가 대상 선택'));
  click('선택 학생 평가 시작');
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).battingSessions).toHaveLength(2);
  click('정상 타격');
  click('평가 8점');
  expect(screen.getByRole('button', { name: '다음 평가 학생' })).toBeDisabled();
  click('기록 저장 · 다음 회차');
  click('다음 평가 학생');
  click('정상 타격');
  click('평가 6점');
  click('기록 저장 · 다음 회차');
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(data.battingAttempts.map((a: { score: number }) => a.score)).toEqual([8, 6]);
  expect(data.battingAttempts[0].sessionId).not.toBe(data.battingAttempts[1].sessionId);
  app.unmount();
  app = render(<App />);
  click('기능평가 & 팀워크');
  expect(screen.getByLabelText('평가 날짜 선택')).toHaveValue('2026-10-26');
  click('2 학생 선택 · 2명');
  expect(screen.getByRole('button', { name: /샘플 선수 01.*1[/]1회/ })).toBeInTheDocument();
}, 15000);
it('일괄 평가 저장 실패 시 선택과 원본을 유지하여 재시도할 수 있다', () => {
  const data = createAssessmentDay(createDemoWorkspace(), {
    date: '2026-10-26',
    targetAttempts: 10,
    assessor: 'QA',
    purpose: '시험',
    note: '',
    createdAt: '2026-10-26T00:00:00.000Z',
  });
  const save = vi.fn().mockImplementationOnce(() => {
    throw Error('quota');
  });
  function Host() {
    const [d, setD] = useState(data);
    return (
      <BattingDayView
        data={d}
        onSave={(next) => {
          save(next);
          setD(next);
        }}
      />
    );
  }
  render(<Host />);
  click('학생 선택으로 →');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 평가 대상 선택'));
  click('선택 학생 평가 시작');
  expect(screen.getByRole('alert')).toHaveTextContent('quota');
  expect(screen.getByLabelText('샘플 선수 01 평가 대상 선택')).toBeChecked();
  expect(data.battingSessions).toEqual([]);
  click('선택 학생 평가 시작');
  expect(save).toHaveBeenCalledTimes(2);
  expect(
    within(screen.getByRole('navigation', { name: '평가 학생 이동' })).getByText('1/1명'),
  ).toBeInTheDocument();
});
