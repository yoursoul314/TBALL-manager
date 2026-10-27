import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { createDemoWorkspace } from '../data/seed';
import { DefenseDayView } from './DefenseDayView';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('날짜별 수비 횟수 저장·진행·한도와 설정 저장 실패 시 입력 보존', () => {
  let saved = createDemoWorkspace(),
    fail = false;
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <DefenseDayView
        data={d}
        onSave={(v) => {
          if (fail) throw Error('quota');
          saved = v;
          setD(v);
        }}
      />
    );
  }
  render(<Host />);
  fill('새 수비 평가 날짜', '2026-10-27');
  fill('수비 공통 평가자', 'QA');
  fill('학생당 수비 횟수', '1');
  click('수비 평가 날짜 생성');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 수비 평가 대상 선택'));
  click('선택 학생 수비 평가 시작');
  expect(saved.defenseDays[0].targetAttempts).toBe(1);
  for (const text of [
    '몸 앞에서 땅볼 잡기',
    '동료의 송구 받기',
    '목표에 정확히 던지기',
    '베이스 밟기·태그',
  ])
    expect(screen.getByText(text)).toBeVisible();
  click('G 땅볼 성공');
  click('수비 기록 저장 · 다음 상황');
  expect(screen.getByLabelText('수비 기록 진행')).toHaveTextContent('1 / 1회 · 완료');
  expect(screen.getByRole('button', { name: '수비 기록 저장 · 다음 상황' })).toBeDisabled();
  click('G 땅볼 부분 수행');
  click('수비 횟수 설정');
  fill('학생당 수비 횟수', '2');
  fail = true;
  click('횟수 저장');
  expect(screen.getByRole('alert')).toHaveTextContent('quota');
  expect(screen.getByLabelText('학생당 수비 횟수')).toHaveValue(2);
  expect(saved.defenseDays[0].targetAttempts).toBe(1);
  fail = false;
  click('횟수 저장');
  expect(saved.defenseDays[0].targetAttempts).toBe(2);
  expect(screen.getByRole('button', { name: '수비 기록 저장 · 다음 상황' })).toBeEnabled();
  expect(saved.defenseAssessments).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'G 땅볼 부분 수행' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  click('수비 기록 저장 · 다음 상황');
  expect(saved.defenseAssessments).toHaveLength(2);
  expect(screen.getByLabelText('수비 기록 진행')).toHaveTextContent('2 / 2회 · 완료');
});
