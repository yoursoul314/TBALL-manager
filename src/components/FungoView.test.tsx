import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { FungoView } from './FungoView';
import { SelectionView } from './SelectionView';
import { PlayerEditor } from './PlayerEditor';
import { createDemoWorkspace } from '../data/seed';
import { parseWorkspace } from '../data/schema';
import { fungoScores, blankFungo } from '../domain/fungo';
import { saveFungo } from '../assessment/fungo';
import { createBattingSession, recordBattingAttempt, blankAttempt } from '../assessment/batting';
import { QUALITY_RUBRIC } from '../config/battingQuality';
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
afterEach(cleanup);
it('날짜 다중 학생·5구 관찰→정밀 조정·저장 실패 보존·다음 학생·수정·취소', () => {
  let saved = createDemoWorkspace(),
    fail = false;
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <FungoView
        data={d}
        onSave={(n) => {
          if (fail) throw Error('가상 저장 실패');
          saved = parseWorkspace(n);
          setD(saved);
        }}
      />
    );
  }
  render(<Host />);
  fill('새 펑고 날짜', '2026-10-27');
  fill('펑고 평가자', 'QA');
  fireEvent.click(screen.getByLabelText('샘플 선수 01 · 1번'));
  fireEvent.click(screen.getByLabelText('샘플 선수 02 · 2번'));
  click('펑고 날짜 · 학생 저장 (2명)');
  expect(saved.fungoDays[0].playerIds).toHaveLength(2);
  for (let i = 1; i <= 5; i++) {
    fireEvent.click(
      within(screen.getByRole('group', { name: i + '구 포구' })).getByRole('button', { name: '3' }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: i + '구 송구' })).getByRole('button', { name: '2' }),
    );
    fill(i + '구 송구 강도·공 빼기', '8');
  }
  click('다음 학생');
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 않은');
  click('정밀 모드');
  expect(screen.getByLabelText('정밀 F')).toHaveValue(10);
  fill('정밀 F', '7');
  click('간편 모드 · 5구');
  click('정밀 모드');
  expect(screen.getByLabelText('정밀 F')).toHaveValue(7);
  fail = true;
  click('저장 · 다음 학생');
  expect(screen.getByRole('alert')).toHaveTextContent('가상 저장 실패');
  expect(screen.getByLabelText('정밀 F')).toHaveValue(7);
  fail = false;
  click('저장 · 다음 학생');
  expect(saved.fungoAssessments).toHaveLength(1);
  expect(fungoScores(saved.fungoAssessments[0].revisions[0]).F).toBe(7);
  expect(screen.getByLabelText('펑고 평가 학생')).toHaveValue('green-2');
  expect(screen.getByLabelText('1구 송구 강도·공 빼기')).toHaveValue(null);
  click('이전 학생');
  click('펑고 기록 저장');
  expect(screen.getByRole('alert')).toHaveTextContent('사유');
  click('메모·정정');
  fill('수정·취소 사유', '관찰 확인 후 정정');
  click('펑고 기록 저장');
  expect(saved.fungoAssessments[0].revisions).toHaveLength(2);
  click('메모·정정');
  fill('수정·취소 사유', '중복 관찰 취소');
  click('기록 취소');
  expect(saved.fungoAssessments[0].revisions.at(-1)?.status).toBe('cancelled');
});
it('펑고 워터폴 배치와 설명·감독 승인 저장', () => {
  let saved = createDemoWorkspace();
  const at = '2026-10-27T01:00:00Z';
  for (const p of saved.players.slice(0, 12)) {
    const input = blankFungo('2026-10-27', 'QA');
    input.mode = 'precise';
    input.manual = { G: 8, F: 8, C: 8, T_acc: 8, T_pow: 8 };
    saved = saveFungo(saved, p.id, input, { id: p.id, revisionId: p.id + 'r', at, reason: 'QA' });
    saved = createBattingSession(
      saved,
      {
        playerId: p.id,
        date: input.date,
        targetAttempts: 5,
        assessor: 'QA',
        purpose: '검증',
        note: '',
        rubricVersion: QUALITY_RUBRIC,
      },
      { id: p.id + 's', at, actor: 'QA', reason: '신규' },
    );
    saved = recordBattingAttempt(
      saved,
      p.id + 's',
      1,
      { ...blankAttempt(), qualityGrade: 'solid', score: 4, result: 'fair' },
      { id: p.id + 'a', at, actor: 'QA', reason: '신규' },
    );
  }
  function Host() {
    const [d, setD] = useState(saved);
    return (
      <SelectionView
        data={d}
        onProfile={() => {}}
        onSave={(n) => {
          saved = parseWorkspace({ ...n, revision: n.revision + 1 });
          setD(saved);
        }}
      />
    );
  }
  render(<Host />);
  fill('추천 방식', 'waterfall');
  click('포지션 시뮬레이션');
  expect(saved.selections.at(-1)?.method).toBe('waterfall');
  expect(saved.selections.at(-1)?.status).toBe('draft');
  expect(screen.getByText('학생에게 설명하는 배정 근거')).toBeInTheDocument();
  expect(saved.selections.at(-1)?.assignments).toHaveLength(10);
  click('시범 배치 감독 승인');
  fill('승인 감독', 'QA');
  click('배치안 승인 저장');
  expect(saved.selections.at(-1)?.status).toBe('approved');
});
it('선수 1·2지망 편집 입력 제공', () => {
  const d = createDemoWorkspace();
  render(<PlayerEditor player={d.players[0]} data={d} onSave={() => {}} onClose={() => {}} />);
  fill('1지망 포지션', 'SS');
  fill('2지망 포지션', '1B');
  expect(screen.getByLabelText('1지망 포지션')).toHaveValue('SS');
  expect(screen.getByLabelText('2지망 포지션')).toHaveValue('1B');
});
