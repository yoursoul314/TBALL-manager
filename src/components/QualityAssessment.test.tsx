import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createDemoWorkspace } from '../data/seed';
import { createBattingSession } from '../assessment/batting';
import { BattingAssessmentPanel } from './BattingAssessmentPanel';
import { summarizeBatting } from '../assessment/battingSummary';
import { QUALITY_RUBRIC } from '../config/battingQuality';
import { LocalWorkspaceRepository } from '../data/repository';
import App from '../App';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('6단계·9구역·실패 입력 유지·다음 회차 초기화·0/음수 저장·새로고침·정정', () => {
  let saved = createBattingSession(
      createDemoWorkspace(),
      {
        playerId: 'green-1',
        date: '2026-10-27',
        targetAttempts: 3,
        assessor: 'QA',
        purpose: '검증',
        note: '',
        rubricVersion: QUALITY_RUBRIC,
      },
      { id: 's', at: '2026-10-27T01:00:00Z', actor: 'QA', reason: '신규' },
    ),
    fail = true;
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <BattingAssessmentPanel
        data={d}
        playerId="green-1"
        initialDate="2026-10-27"
        initialDetailed
        onSave={(n) => {
          if (fail) throw Error('저장 실패');
          saved = n;
          setD(n);
        }}
      />
    );
  }
  const view = render(<Host />);
  expect(screen.queryByRole('button', { name: '평가 3점' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '타구 강도' })).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: '타격 정확성' })).not.toBeInTheDocument();
  click('5점 장타성 정타(배럴)');
  click('우 원거리');
  fireEvent.click(screen.getByText('타구 유형 추가 관찰 · 선택'));
  click('직선타');
  click('메모·정정');
  fill('회차 메모', '가상 관찰');
  click('기록 저장 · 다음 회차');
  expect(saved.battingAttempts).toHaveLength(0);
  expect(screen.getByLabelText('회차 메모')).toHaveValue('가상 관찰');
  fail = false;
  click('기록 저장 · 다음 회차');
  expect(saved.battingAttempts[0]).toMatchObject({
    score: 5,
    qualityGrade: 'barrel',
    directionZone: 'right-far',
    intensity: null,
    contactQuality: null,
  });
  expect(screen.getByRole('button', { name: '5점 장타성 정타(배럴)' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  click('0점 일반 파울');
  expect(screen.getByRole('button', { name: '기록 저장 · 다음 회차' })).toBeEnabled();
  click('기록 저장 · 다음 회차');
  click('-1점 티 타격 파울·헛스윙');
  expect(screen.getByRole('button', { name: '우 원거리' })).toBeDisabled();
  click('기록 저장 · 다음 회차');
  expect(summarizeBatting(saved, 'green-1')).toMatchObject({ count: 3, total: 4 });
  expect(summarizeBatting(saved, 'green-1').score).toBeCloseTo(350 / 9);
  new LocalWorkspaceRepository(localStorage).save(saved, 0);
  const restored = new LocalWorkspaceRepository(localStorage).load()!;
  expect(restored.battingAttempts).toEqual(saved.battingAttempts);
  click('기록지 조회');
  fireEvent.click(screen.getByRole('listitem', { name: '1회차 5점' }));
  click('4점 강한 땅볼·단타성 직선타');
  click('메모·정정');
  fill('회차 수정 사유', '영상 검토');
  click('정정 저장 · 다음 회차');
  expect(saved.battingAttempts[0].score).toBe(4);
  expect(saved.battingAttempts[0].trajectory).toBe('line');
  expect(
    saved.battingAudit.some(
      (a) => a.entity === 'attempt' && a.before?.score === 5 && a.after.score === 4,
    ),
  ).toBe(true);
  view.unmount();
});
it('날짜 생성의 기본 척도는6단계이며 다중 학생 세션에 같은 버전 저장', () => {
  render(<App />);
  click('기능평가 & 팀워크');
  fill('새 평가 날짜', '2026-10-28');
  fill('공통 평가자', 'QA');
  fill('공통 평가 목적', '타구 질');
  expect(screen.getByLabelText('날짜 평가 척도')).toHaveValue(QUALITY_RUBRIC);
  click('평가 날짜 생성');
  for (const n of ['01', '02'])
    fireEvent.click(screen.getByLabelText('샘플 선수 ' + n + ' 평가 대상 선택'));
  click('선택 학생 평가 시작');
  const d = new LocalWorkspaceRepository(localStorage).load()!;
  expect(d.battingSessions).toHaveLength(2);
  expect(d.battingSessions.every((s) => s.rubricVersion === QUALITY_RUBRIC)).toBe(true);
  expect(screen.getByRole('button', { name: '5점 장타성 정타(배럴)' })).toBeVisible();
});
