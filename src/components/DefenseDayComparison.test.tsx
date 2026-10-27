import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { createDemoWorkspace } from '../data/seed';
import { createDefenseDay, addDefenseParticipants } from '../assessment/defenseDays';
import { DefenseDayView } from './DefenseDayView';
import { ComparisonView } from './ComparisonView';
import { NewGame } from './NewGame';
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('날짜 생성 후 여러 학생을 추가하고 저장 성공 시만 다음 학생으로 이동하며 관찰을 초기화한다', () => {
  let saved = createDemoWorkspace(),
    fail = false;
  function Harness() {
    const [d, setD] = useState(saved);
    return (
      <DefenseDayView
        data={d}
        onSave={(v) => {
          if (fail) throw new Error('저장 공간 오류');
          saved = v;
          setD(v);
        }}
      />
    );
  }
  render(<Harness />);
  change('새 수비 평가 날짜', '2026-10-27');
  change('수비 공통 평가자', 'QA');
  click('수비 평가 날짜 생성');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 수비 평가 대상 선택'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 수비 평가 대상 선택'));
  click('선택 학생 수비 평가 시작');
  expect(saved.defenseDays[0].playerIds).toEqual(['green-1', 'green-2']);
  click('G 땅볼 성공');
  expect(screen.getByRole('button', { name: '다음 수비 학생' })).toBeDisabled();
  fail = true;
  click('수비 기록 저장 · 다음 학생');
  expect(saved.defenseAssessments).toHaveLength(0);
  expect(screen.getByRole('alert')).toHaveTextContent('저장 공간 오류');
  expect(screen.getByRole('button', { name: 'G 땅볼 성공' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fail = false;
  click('수비 기록 저장 · 다음 학생');
  expect(saved.defenseAssessments[0].playerId).toBe('green-1');
  expect(
    screen.getByRole('heading', { name: '수비 상황 체크리스트 · 샘플 선수 02' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'G 땅볼 미관찰' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  click('G 땅볼 실패');
  click('수비 기록 저장 · 다음 학생');
  expect(saved.defenseAssessments[1].playerId).toBe('green-2');
  click('집중 모드 끝내기');
  expect(screen.getByText('100.0')).toBeInTheDocument();
  expect(screen.getByText('0.0')).toBeInTheDocument();
});
it('미저장 기록은 날짜 변경을 차단하고 기존 개별 날짜도 조회할 수 있다', () => {
  const at = '2026-10-27T02:00:00.000Z';
  let d = createDefenseDay(createDemoWorkspace(), {
    date: '2026-10-27',
    assessor: 'QA',
    purpose: '수비',
    note: '',
    playerIds: [],
    createdAt: at,
  });
  d = addDefenseParticipants(d, '2026-10-27', ['green-1']);
  d = createDefenseDay(d, {
    date: '2026-10-26',
    assessor: 'QA',
    purpose: '수비',
    note: '',
    playerIds: [],
    createdAt: at,
  });
  render(<DefenseDayView data={d} onSave={() => {}} />);
  click('G 땅볼 성공');
  change('수비 날짜 선택', '2026-10-26');
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 않은');
  expect(screen.getByLabelText('수비 날짜 선택')).toHaveValue('2026-10-27');
});
it('비교 학생과 검토 후보를 구분하고 후보 저장 후 경기에서 불러와 수동으로 팀 배정한다', () => {
  let saved = createDemoWorkspace();
  const view = render(
    <ComparisonView
      data={saved}
      onSave={(d) => {
        saved = d;
      }}
      onProfile={() => {}}
      onDirtyChange={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText('샘플 선수 01 비교 선택'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 비교 선택'));
  change('비교 분석 최소 관찰 수', '1.5');
  expect(screen.getByLabelText('비교 분석 최소 관찰 수')).toHaveValue(1);
  fireEvent.click(screen.getByLabelText('샘플 선수 02 검토 후보'));
  change('후보 선정 메모', '수비 관찰 추가 예정');
  click('검토 후보 저장');
  expect(saved.comparisonSelection?.playerIds).toEqual(['green-2']);
  expect(saved.comparisonSelection?.status).toBe('draft');
  view.unmount();
  render(<NewGame data={saved} onCreate={() => {}} onClose={() => {}} />);
  click('비교 후보 불러오기');
  expect(screen.getByText('선택 1명 · 표시 24명')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '선공 엔트리 · 0/10명' })).toBeInTheDocument();
  click('선택 학생 팀에 배정');
  expect(screen.getByRole('button', { name: '선공 엔트리 · 1/10명' })).toBeInTheDocument();
});
