import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createAssessmentTestWorkspace } from '../test/assessment';
import { createDefenseDay } from '../assessment/defenseDays';
import { saveDefenseAssessment, emptyDefenseObservations } from '../assessment/defenseChecklist';
import { DEFAULT_DEFENSE_RUBRIC } from '../domain/defenseAssessment';
import { DefenseAssessmentPanel } from './DefenseAssessmentPanel';
const at = '2026-10-28T01:00:00Z',
  date = '2026-10-28';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
afterEach(cleanup);
it('할당횟수 미설정은 저장해도 임의로 다음 학생을 선택하지 않는다', () => {
  let saved = createAssessmentTestWorkspace();
  const next = vi.fn();
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <DefenseAssessmentPanel
        data={d}
        playerId="green-1"
        managedDay={{ date, assessor: 'QA' }}
        onSave={(v) => {
          saved = v;
          setD(v);
        }}
        navigation={{ index: 1, total: 2, next: () => {}, onSavedNext: next }}
      />
    );
  }
  render(<Host />);
  click('G 땅볼 성공');
  click('수비 기록 저장 · 다음 상황');
  expect(saved.defenseAssessments).toHaveLength(1);
  expect(next).not.toHaveBeenCalled();
});
it('과거 기록 정정/취소는 학생을 이동하지 않고 취소 회차만 다시 채워야 이동한다', () => {
  let saved = createDefenseDay(createAssessmentTestWorkspace(), {
    date,
    assessor: 'QA',
    purpose: '수비',
    note: '',
    playerIds: ['green-1', 'green-2'],
    targetAttempts: 1,
    createdAt: at,
  });
  saved = saveDefenseAssessment(
    saved,
    'green-1',
    {
      date,
      assessor: 'QA',
      situation: 'ground',
      observations: { ...emptyDefenseObservations(), G: 'success' },
      error: null,
      note: '',
      rubric: DEFAULT_DEFENSE_RUBRIC,
    },
    { id: 'r', revisionId: 'original', at, author: 'QA', reason: '최초' },
  );
  const original = structuredClone(saved.defenseAssessments[0].revisions[0]),
    next = vi.fn();
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <DefenseAssessmentPanel
        data={d}
        playerId="green-1"
        managedDay={{ date, assessor: 'QA' }}
        onSave={(v) => {
          saved = v;
          setD(v);
        }}
        navigation={{ index: 1, total: 2, next: () => {}, onSavedNext: next }}
      />
    );
  }
  render(<Host />);
  click(date + ' · 땅볼 수비 · 기록 · 수정');
  click('G 땅볼 부분 수행');
  fireEvent.change(screen.getByLabelText('수정·취소 사유'), { target: { value: '정정' } });
  click('수비 기록 정정 저장');
  expect(next).not.toHaveBeenCalled();
  click(date + ' · 땅볼 수비 · 기록 · 수정');
  fireEvent.change(screen.getByLabelText('수정·취소 사유'), { target: { value: '중복 취소' } });
  click('이 수비 기록 취소');
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByLabelText('수비 기록 진행')).toHaveTextContent('남은 1회');
  click('G 땅볼 성공');
  click('수비 기록 저장 · 다음 학생');
  expect(next).toHaveBeenCalledOnce();
  expect(saved.defenseAssessments[0].revisions[0]).toEqual(original);
  expect(saved.defenseAssessments[0].revisions.at(-1)?.status).toBe('cancelled');
});
