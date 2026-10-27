import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { DefenseAssessmentPanel } from './DefenseAssessmentPanel';
import { AssessmentView } from './AssessmentView';
import { createDemoWorkspace } from '../data/seed';
import type { Workspace } from '../domain/model';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('체크 최소 입력·미관찰 null·다음 상황 초기화·정정·취소·프로필용 점수 일치', () => {
  let saved = createDemoWorkspace();
  function Harness() {
    const [d, setD] = useState(saved);
    return (
      <DefenseAssessmentPanel
        data={d}
        playerId="green-1"
        onSave={(v) => {
          saved = v;
          setD(v);
        }}
      />
    );
  }
  render(<Harness />);
  change('평가자·수정자', 'QA');
  click('G 땅볼 성공');
  click('A 송구 정확도 실패');
  click('수비 기록 저장 · 다음 상황');
  expect(saved.defenseAssessments).toHaveLength(1);
  expect(saved.defenseAssessments[0].revisions[0].observations.C).toBeNull();
  expect(screen.getByRole('button', { name: 'G 땅볼 미관찰' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const report = screen.getByRole('region', { name: '수비 체크리스트 분석' });
  expect(within(report).getByText('100.0점')).toBeInTheDocument();
  expect(within(report).getByText('0.0점')).toBeInTheDocument();
  fireEvent.click(screen.getByText('상황별 기록·정정 이력 (1건)'));
  click(saved.defenseAssessments[0].revisions[0].date + ' · 땅볼 수비 · 기록 · 수정');
  click('G 땅볼 부분 수행');
  change('수정·취소 사유', '두 손으로 잡는 과정 확인');
  click('수비 기록 정정 저장');
  expect(saved.defenseAssessments[0].revisions).toHaveLength(2);
  click(saved.defenseAssessments[0].revisions[0].date + ' · 땅볼 수비 · 기록 · 수정');
  change('수정·취소 사유', '중복 관찰 취소');
  click('이 수비 기록 취소');
  expect(saved.defenseAssessments[0].revisions.at(-1)?.status).toBe('cancelled');
  expect(within(report).queryByText('100.0점')).not.toBeInTheDocument();
});
it('저장 실패는 체크·수정 입력을 유지하고 미저장 선수 전환을 막는다', () => {
  const fail = vi.fn((_d: Workspace) => {
    throw new Error('저장 공간 오류');
  });
  render(<AssessmentView data={createDemoWorkspace()} onSave={fail} />);
  click('수비 체크리스트');
  click('수비 개인별 이전 기록');
  change('평가자·수정자', 'QA');
  click('G 땅볼 성공');
  click('다음 선수');
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 않은');
  click('수비 기록 저장 · 다음 상황');
  expect(
    screen.getAllByRole('alert').some((el) => el.textContent?.includes('저장 공간 오류')),
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'G 땅볼 성공' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByLabelText('평가자·수정자')).toHaveValue('QA');
  click('입력 되돌리기');
  click('다음 선수');
  expect(screen.getByLabelText('선수 선택')).toHaveValue('green-2');
});
it('상황 전환이 입력된 관찰을 지우지 않으며 기회 없음은 미측정으로 표시한다', () => {
  let saved = createDemoWorkspace();
  render(
    <DefenseAssessmentPanel
      data={saved}
      playerId="green-1"
      onSave={(v) => {
        saved = v;
      }}
    />,
  );
  change('평가자·수정자', 'QA');
  click('G 땅볼 기회 없음');
  click('송구 받아 처리');
  click('C 송구 포구 성공');
  click('수비 기록 저장 · 다음 상황');
  expect(saved.defenseAssessments[0].revisions[0].observations).toMatchObject({
    G: 'not-offered',
    C: 'success',
    B: null,
    A: null,
  });
});

it('체크 출처 적용 후 기능평가9항목이 환산값·미측정으로 표시되고 수동 기록을 유지한다', () => {
  let saved = createDemoWorkspace();
  function Harness() {
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
  const original = structuredClone(saved.assessments);
  render(<Harness />);
  click('수비 체크리스트');
  click('수비 개인별 이전 기록');
  change('평가자·수정자', 'QA');
  click('G 땅볼 부분 수행');
  click('수비 기록 저장 · 다음 상황');
  click('체크 점수를 수비 기능평가에 적용');
  click('기능평가');
  expect(screen.getByLabelText('땅볼')).toHaveValue(50);
  expect(screen.getByLabelText('땅볼')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('뜬공')).toHaveValue(null);
  expect(saved.assessments).toEqual(original);
  click('수비 체크리스트');
  click('수비 개인별 이전 기록');
  click('기존 수동 수비평가로 전환');
  click('기능평가');
  expect(screen.getByLabelText('땅볼')).toHaveValue(original[0].abilities.G);
  expect(screen.getByLabelText('땅볼')).not.toHaveAttribute('readonly');
});
