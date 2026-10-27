import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { LocalWorkspaceRepository, STORAGE_KEY } from '../data/repository';
import { createBattingSession, recordBattingAttempt, blankAttempt } from '../assessment/batting';
import { summarizeBatting } from '../assessment/battingSummary';
import { Profile } from './Players';
import { BattingAssessmentSettings } from './BattingAssessmentSettings';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('날짜별 회차 입력·저장·새로고침 후 유지·정정과 프로필 누적 평균이 연결된다', async () => {
  const user = userEvent.setup();
  let app = render(<App />);
  await user.click(screen.getByRole('button', { name: '기능평가 & 팀워크' }));
  await user.click(screen.getByRole('button', { name: '개인별 이전 기록' }));
  fireEvent.change(screen.getByLabelText('평가 날짜'), { target: { value: '2026-10-20' } });
  fireEvent.change(screen.getByLabelText('세션 평가자'), { target: { value: '가상 코치' } });
  fireEvent.change(screen.getByLabelText('평가 목적'), { target: { value: '테스트 연습' } });
  await user.click(screen.getByRole('button', { name: '평가 세션 생성' }));
  await user.click(screen.getByRole('button', { name: '정상 타격' }));
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  await user.click(screen.getByRole('button', { name: '좌 원거리' }));
  await user.click(screen.getByRole('button', { name: '직선타' }));
  await user.click(
    within(screen.getByRole('group', { name: '타구 강도' })).getByRole('button', { name: '강' }),
  );
  await user.click(screen.getByRole('button', { name: '정타' }));
  expect(screen.getByRole('button', { name: '기록 저장 · 다음 회차' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '평가 8점' }));
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(screen.getByTestId('batting-score')).toHaveTextContent('80.0');
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).battingAttempts[0]).toMatchObject({
    score: 8,
    directionZone: 'left-far',
    trajectory: 'line',
    intensity: 'strong',
    contactQuality: 'solid',
  });
  app.unmount();
  app = render(<App />);
  await user.click(screen.getByRole('button', { name: '기능평가 & 팀워크' }));
  await user.click(screen.getByRole('button', { name: '개인별 이전 기록' }));
  fireEvent.change(screen.getByLabelText('평가 날짜'), { target: { value: '2026-10-20' } });
  expect(screen.getByTestId('batting-score')).toHaveTextContent('80.0');
  await user.click(screen.getByRole('button', { name: '평가 10점' }));
  fireEvent.change(screen.getByLabelText('회차 수정 사유'), {
    target: { value: '영상 확인 후 정정' },
  });
  await user.click(screen.getByRole('button', { name: '정정 저장 · 다음 회차' }));
  expect(screen.getByTestId('batting-score')).toHaveTextContent('100.0');
  const d = new LocalWorkspaceRepository(localStorage).load()!;
  expect(d.battingAudit.at(-1)).toMatchObject({
    before: { score: 8 },
    after: { score: 10 },
    reason: '영상 확인 후 정정',
  });
  app.unmount();
  render(<Profile data={d} id={d.players[0].id} onClose={() => {}} />);
  expect(screen.getByTestId('batting-score')).toHaveTextContent(
    summarizeBatting(d, d.players[0].id).score!.toFixed(1),
  );
  expect(screen.getByTestId('batting-day')).toHaveTextContent(
    '2026-10-20 · 1회 · 평균 10.0 · 누적 10.0',
  );
  expect(screen.getByRole('img', { name: /날짜별 평균과 누적 평균/ })).toBeInTheDocument();
}, 20000);
it('헛스윙은 필드맵이 비활성화되고 파울은 실제 관찰 선택 시 입력 가능하다', async () => {
  const data = createDemoWorkspace(),
    now = new Date().toISOString(),
    date = now.slice(0, 10);
  const d = createBattingSession(
    data,
    {
      playerId: data.players[0].id,
      date,
      targetAttempts: 10,
      assessor: '가상 코치',
      purpose: '관찰 테스트',
      note: '',
    },
    { id: 'test-session', at: now, actor: '가상 코치', reason: '신규' },
  );
  new LocalWorkspaceRepository(localStorage).save(d, 0);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '기능평가 & 팀워크' }));
  await user.click(screen.getByRole('button', { name: '개인별 이전 기록' }));
  fireEvent.change(screen.getByLabelText('평가 날짜'), { target: { value: date } });
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  await user.click(screen.getByRole('button', { name: '헛스윙' }));
  expect(screen.getByRole('button', { name: '좌 원거리' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '파울' }));
  expect(screen.getByRole('button', { name: '좌 원거리' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /이 파울의 실제 타구/ }));
  expect(screen.getByRole('button', { name: '좌 원거리' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: '좌 원거리' }));
  await user.click(screen.getByRole('button', { name: '평가 4점' }));
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(new LocalWorkspaceRepository(localStorage).load()!.battingAttempts[0]).toMatchObject({
    result: 'foul',
    score: 4,
    directionZone: 'left-far',
    trajectory: null,
    intensity: null,
    contactQuality: null,
  });
});
it('프로필의 기간별 그래프와 누적 평균은 같은 회차 집계를 사용한다', () => {
  let d = createDemoWorkspace();
  let i = 0;
  const m = () => ({
    id: `graph-${++i}`,
    at: '2026-10-20T00:00:00Z',
    actor: '가상',
    reason: '테스트',
  });
  for (const [date, scores] of [
    ['2026-10-13', [10]],
    ['2026-10-20', [4, 4, 4]],
  ] as const) {
    d = createBattingSession(
      d,
      {
        playerId: d.players[0].id,
        date,
        targetAttempts: 10,
        assessor: '가상',
        purpose: '그래프',
        note: '',
      },
      m(),
    );
    for (const [j, score] of scores.entries())
      d = recordBattingAttempt(
        d,
        d.battingSessions.at(-1)!.id,
        j + 1,
        { ...blankAttempt(), result: 'fair', score },
        m(),
      );
  }
  render(<Profile data={d} id={d.players[0].id} onClose={() => {}} />);
  expect(screen.getByTestId('batting-score')).toHaveTextContent('55.0');
  expect(screen.getAllByTestId('batting-day')[1]).toHaveTextContent('평균 4.0 · 누적 5.5');
  fireEvent.change(screen.getByLabelText('분석 시작일'), { target: { value: '2026-10-20' } });
  expect(screen.getByTestId('batting-score')).toHaveTextContent('40.0');
  expect(screen.getAllByTestId('batting-day')).toHaveLength(1);
});
it('구역 정의 변경은 새 버전으로 저장하고 분석 경계값 기본은 미확정이다', async () => {
  const onSave = vi.fn(),
    d = createDemoWorkspace(),
    user = userEvent.setup();
  render(<BattingAssessmentSettings data={d} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText('근거리 기준'), { target: { value: '10m 이내' } });
  fireEvent.change(screen.getByLabelText('중거리 기준'), {
    target: { value: '10m 초과 20m 이내' },
  });
  fireEvent.change(screen.getByLabelText('원거리 기준'), { target: { value: '20m 초과' } });
  await user.click(screen.getByRole('button', { name: '새 구역 정의 버전 저장' }));
  expect(onSave.mock.calls[0][0].battingSettings.zoneDefinitions).toHaveLength(2);
  expect(onSave.mock.calls[0][0].battingSettings.classification.strongRatio).toBeNull();
});
