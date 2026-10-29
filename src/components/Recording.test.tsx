import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { STORAGE_KEY, LEGACY_STORAGE_KEY } from '../data/repository';
import { createDemoWorkspace } from '../data/seed';
import { replayGame } from '../engine/game';
import { calculateStats } from '../statistics/calculate';
import type { Workspace } from '../domain/model';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Workspace;
it('터치 필드맵 → 플레이 저장 → 과거 수정이 원본을 남기고 통계를 바꾼다', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByText(/서버 인증·접근 권한/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  await user.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  await user.click(screen.getByRole('button', { name: '1루타' }));
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  const commit = screen.getByRole('button', { name: /심판 타임 · 플레이 확정/ });
  expect(commit).toBeDisabled();
  expect(screen.getAllByRole('button', { name: /^[좌중우] (근거리|중거리|원거리)$/ })).toHaveLength(
    9,
  );
  await user.click(screen.getByRole('button', { name: '우 원거리' }));
  expect(screen.getByRole('button', { name: '우 원거리' })).toHaveAttribute('aria-pressed', 'true');
  await user.selectOptions(screen.getByLabelText('타구 강도'), 'strong');
  await user.selectOptions(screen.getByLabelText('타구 유형'), 'ground');
  await user.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  await user.click(screen.getByLabelText('심판 타임 선언 확인'));
  await user.click(commit);
  const first = saved();
  expect(first.events[1].payload).toMatchObject({
    type: 'END_PLAY',
    direction: 'right',
    distance: 'far',
    strength: 'strong',
    quality: 'ground',
  });
  await user.click(screen.getByText(/타순·플레이 기록 보기/));
  await user.click(screen.getByRole('button', { name: '플레이 수정 · 이력' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('수정자 별칭'), '테스트 기록원');
  await user.type(dialog.getByLabelText('수정 사유'), '타격 결과 확인');
  await user.click(dialog.getByRole('button', { name: '홈런' }));
  await user.click(dialog.getByRole('button', { name: '타점 인정' }));
  await user.click(dialog.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  await user.click(dialog.getByLabelText('심판 타임 선언 확인'));
  await user.click(dialog.getByRole('button', { name: '수정 이력 저장 · 전체 경기 재계산' }));
  const next = saved();
  expect(next.events).toHaveLength(3);
  expect(next.events[1]).toEqual(first.events[1]);
  expect(next.events[2].payload.type).toBe('REVISE_PLAY');
  const stats = calculateStats(next.games[0], next.events, next.policy).rows[0];
  expect(stats).toMatchObject({ hits: 1, totalBases: 4, runs: 1 });
  expect(replayGame(next.games[0], next.events).bases.away).toEqual({});
});
it('볼 데드 수비 포지션 변경 화면을 저장하고 라이브에서는 잠근다', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  await user.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  await user.click(screen.getByRole('button', { name: '수비 포지션 변경' }));
  await user.selectOptions(screen.getByLabelText('1루수 배치'), 'orange-1');
  await user.selectOptions(screen.getByLabelText('유격수 배치'), 'orange-2');
  await user.click(screen.getByRole('button', { name: '수비 배치 저장' }));
  expect(saved().events[0].payload).toEqual({
    type: 'DEFENSE',
    side: 'home',
    assignments: { '1B': 'orange-1', SS: 'orange-2' },
  });
  await user.click(screen.getByRole('button', { name: '1루타' }));
  expect(screen.getByRole('button', { name: '수비 포지션 변경' })).toBeDisabled();
});
it('팀워크 기회 없음은 미관찰로 저장하고 책임감·존중 원본을 화면에서 보존한다', async () => {
  const demo = createDemoWorkspace();
  localStorage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({
      ...demo,
      schemaVersion: 1,
      teamwork: [
        {
          id: 'old',
          playerId: 'green-1',
          gameId: null,
          recordedAt: demo.games[0].createdAt,
          category: 'respect',
          score: 5,
          note: '가상 이전 관찰',
          observer: '가상 교사',
        },
      ],
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '기능평가 & 팀워크' }));
  await user.click(screen.getByRole('button', { name: '팀워크 관찰' }));
  await user.selectOptions(screen.getByLabelText('평가 기회'), 'not-offered');
  expect(screen.getByLabelText('수행 결과')).toBeDisabled();
  await user.type(screen.getByLabelText('관찰한 행동'), '기회가 없었음');
  await user.type(screen.getByLabelText('관찰자 별칭'), '가상 교사');
  await user.click(screen.getByRole('button', { name: '관찰 저장' }));
  expect(saved().teamwork[0]).toMatchObject({ opportunity: 'not-offered', outcome: 'unobserved' });
  expect(saved().legacyTeamwork[0]).toMatchObject({ category: 'respect', score: 5 });
  expect(screen.getByText('존중 · 5/5 · 이전 데이터')).toBeInTheDocument();
});
it('추천은 자동 승인되지 않고 최종 선발 알고리즘은 TODO로 표시된다', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '선발 시뮬레이션' }));
  expect(screen.getByText(/최종 선발 알고리즘은 TODO/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '포지션 시뮬레이션' }));
  expect(screen.getByText('검토 대기')).toBeInTheDocument();
  expect(saved().selections[0]).toMatchObject({
    status: 'draft',
    approvedBy: null,
    approvedAt: null,
  });
});
