import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { createDemoWorkspace } from '../data/seed';
import { DefenseAssessmentPanel } from './DefenseAssessmentPanel';
import { ZoneHeatmap } from './ZoneHeatmap';
import { ManualLineupEditor } from './ManualLineupEditor';
afterEach(cleanup);
it('수비 집중 모드는 펼치기 없이 9능력을 모두 보여주고 저장 실패 시 학생을 유지한다', () => {
  const next = vi.fn(),
    save = vi.fn(() => {
      throw new Error('저장 공간 오류');
    });
  render(
    <DefenseAssessmentPanel
      data={createDemoWorkspace()}
      playerId="green-1"
      managedDay={{ date: '2026-10-27', assessor: 'QA' }}
      initialFocused
      onSave={save}
      navigation={{ index: 1, total: 2, onSavedNext: next }}
    />,
  );
  expect(screen.getAllByRole('button', { name: /^[GFCALQMJB] .* 미관찰$/ })).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'Q 첫 반응 성공' }));
  fireEvent.click(screen.getByRole('button', { name: '수비 기록 저장 · 다음 상황' }));
  expect(next).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Q 첫 반응 성공' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
it('9구역 시각화는 관찰한 구역만 분모에 넣고 공통 비율 색상을 사용한다', () => {
  const v = render(
    <ZoneHeatmap counts={{ 'left-far': 3, 'center-near': 1 }} label="QA 9구역" unlocated={2} />,
  );
  expect(v.container.querySelectorAll('[data-zone]')).toHaveLength(9);
  expect(screen.getByLabelText('좌 원거리 3회 75.0%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '비율' }));
  expect(screen.getByText('75.0%')).toBeInTheDocument();
  expect(screen.getByText(/구역을 알 수 없는 결과 2회/)).toBeInTheDocument();
});
it('수동 배치 저장 실패 시 입력을 유지하고 저장 성공 후에만 편집을 닫는다', () => {
  let fail = true;
  const close = vi.fn(),
    save = vi.fn(() => {
      if (fail) throw new Error('저장 실패');
    });
  const d = createDemoWorkspace();
  render(<ManualLineupEditor data={d} teamId={d.teams[0].id} onSave={save} onClose={close} />);
  fireEvent.click(screen.getByRole('button', { name: '샘플 선수 01 1루수 배치' }));
  fireEvent.click(screen.getByRole('button', { name: '수동 배치안 저장' }));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('저장 실패');
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: '수동 배치안 저장' }));
  expect(close).toHaveBeenCalledOnce();
  expect(save.mock.calls).toHaveLength(2);
});
