import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createDemoWorkspace } from '../data/seed';
import { LocalWorkspaceRepository, STORAGE_KEY } from '../data/repository';
import { createBattingSession, blankAttempt, recordBattingAttempt } from '../assessment/batting';
import { summarizeBatting } from '../assessment/battingSummary';
import { calculateStats } from '../statistics/calculate';
import { Profile } from './Players';
import type { Workspace } from '../domain/model';
const date = '2026-10-20';
const saved = () => new LocalWorkspaceRepository(localStorage).load()!;
async function openAssessment() {
  let d = createDemoWorkspace();
  d = createBattingSession(
    d,
    {
      playerId: 'green-1',
      date,
      targetAttempts: 10,
      assessor: '가상 코치',
      purpose: '검증',
      note: '',
    },
    { id: 'session', at: '2026-10-20T00:00:00Z', actor: '가상', reason: '신규' },
  );
  new LocalWorkspaceRepository(localStorage).save(d, 0);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '기능평가 & 팀워크' }));
  await user.click(screen.getByRole('button', { name: '개인별 이전 기록' }));
  fireEvent.change(screen.getByLabelText('평가 날짜'), { target: { value: date } });
  return user;
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
it('간편 필수 3터치 저장·관찰 null·다음 회차 초기화·중복 저장 차단', async () => {
  const user = await openAssessment();
  expect(screen.getByRole('button', { name: '기록 저장 · 다음 회차' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '정상 타격' }));
  await user.click(screen.getByRole('button', { name: '평가 8점' }));
  await user.dblClick(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(saved().battingAttempts).toHaveLength(1);
  expect(saved().battingAttempts[0]).toMatchObject({
    result: 'fair',
    score: 8,
    direction: null,
    directionZone: null,
    trajectory: null,
    intensity: null,
    contactQuality: null,
  });
  expect(screen.getByRole('heading', { name: '2회차 기록' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '평가 8점' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: '정상 타격' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByRole('button', { name: '기록 저장 · 다음 회차' })).toBeDisabled();
  expect(saved().battingSessions[0].status).toBe('in-progress');
  expect(calculateStats(saved().games[0], saved().events, saved().policy).rows).toEqual([]);
});
it('좌측만 선택하면 거리 생성 없이 방향 분포에 포함하고 모드 전환으로 초안을 잃지 않는다', async () => {
  const user = await openAssessment();
  await user.click(screen.getByRole('button', { name: '정상 타격' }));
  await user.click(screen.getByRole('button', { name: '좌측' }));
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  await user.click(screen.getByRole('button', { name: '간편 모드' }));
  await user.click(screen.getByRole('button', { name: '평가 7점' }));
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(saved().battingAttempts[0]).toMatchObject({ direction: 'left', directionZone: null });
  const report = summarizeBatting(saved(), 'green-1');
  expect(report.directions.total).toBe(1);
  expect(report.zones.total).toBe(0);
  expect(report.directions.ratio('left')).toBe(1);
});
it('마지막 기록 취소는 원본·감사 이력을 남기고 평균에서 제외한다', async () => {
  const user = await openAssessment();
  await user.click(screen.getByRole('button', { name: '헛스윙' }));
  await user.click(screen.getByRole('button', { name: '평가 3점' }));
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  await user.click(screen.getByRole('button', { name: '마지막 기록 취소' }));
  expect(saved().battingAttempts[0].status).toBe('cancelled');
  expect(saved().battingAudit.at(-1)).toMatchObject({
    before: { score: 3, status: 'active' },
    after: { score: 3, status: 'cancelled' },
  });
  expect(summarizeBatting(saved(), 'green-1').score).toBeNull();
});
it('미저장 선수·탭 이동은 경고하고 저장 공간 오류 후 초안과 원본을 보존한다', async () => {
  const user = await openAssessment();
  const raw = localStorage.getItem(STORAGE_KEY);
  await user.click(screen.getByRole('button', { name: '정상 타격' }));
  await user.click(screen.getByRole('button', { name: '평가 9점' }));
  await user.click(screen.getByRole('button', { name: '다음 선수' }));
  expect(screen.getByRole('alert')).toHaveTextContent('저장하지 않은');
  expect(screen.getByLabelText('선수 선택')).toHaveValue('green-1');
  await user.click(screen.getByRole('button', { name: '선수 & 팀' }));
  expect(screen.getByRole('button', { name: '평가 9점' })).toHaveAttribute('aria-pressed', 'true');
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(screen.getByRole('heading', { name: '1회차 기록' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '평가 9점' })).toHaveAttribute('aria-pressed', 'true');
  fail.mockRestore();
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(saved().battingAttempts[0].score).toBe(9);
});
it('경기 간편 결과는 주자 확인·심판 타임 전에 확정 불가, 상세 null로 정상 저장', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '경기 기록하기' }));
  await user.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  await user.click(screen.getByRole('button', { name: '2루타' }));
  const save = screen.getByRole('button', { name: '심판 타임 · 플레이 확정' });
  expect(save).toBeDisabled();
  expect(screen.getByLabelText('green-1 최종 위치')).toHaveValue('2');
  await user.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  expect(save).toBeDisabled();
  await user.click(screen.getByLabelText('심판 타임 선언 확인'));
  await user.click(save);
  expect(saved().events[1].payload).toMatchObject({
    result: 'double',
    direction: null,
    quality: null,
    distance: null,
    strength: null,
    fielding: [],
    details: [],
  });
  expect(screen.getByText('2번 타자')).toBeInTheDocument();
  const stats = calculateStats(saved().games[0], saved().events, saved().policy).rows[0];
  expect(stats).toMatchObject({
    pa: 1,
    hits: 1,
    totalBases: 2,
    fieldingAttempts: 0,
    directions: {},
    qualities: {},
  });
});
it('아웃 종류·위치 누락은 확인 차단, 확인 후 주자 변경은 재확인 필요', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '경기 기록하기' }));
  await user.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  await user.click(screen.getByRole('button', { name: '아웃' }));
  const confirm = screen.getByRole('button', { name: '샘플 선수 01 결과 확인' });
  expect(confirm).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('아웃 종류'), 'force');
  expect(confirm).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('아웃 위치'), '1');
  await user.click(confirm);
  await user.click(screen.getByLabelText('심판 타임 선언 확인'));
  await user.selectOptions(screen.getByLabelText('아웃 종류'), 'tag');
  expect(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' })).toBeDisabled();
});
it('수비 관찰 추가 시 미관찰을 기본으로 저장하며 실패로 집계하지 않는다', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '경기 기록하기' }));
  await user.click(screen.getByRole('button', { name: '2학년 티볼 연습 경기 경기 열기' }));
  await user.click(screen.getByRole('button', { name: '1루타' }));
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  await user.click(screen.getByRole('button', { name: '+ 수비 능력 관찰' }));
  await user.selectOptions(screen.getByLabelText('수비 난도 (선택)'), 'difficult');
  await user.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  await user.click(screen.getByLabelText('심판 타임 선언 확인'));
  await user.click(screen.getByRole('button', { name: '심판 타임 · 플레이 확정' }));
  expect(saved().events[1].payload).toMatchObject({
    fielding: [{ success: null, difficulty: 'difficult' }],
  });
  expect(
    calculateStats(saved().games[0], saved().events, saved().policy).rows.find(
      (r) => r.playerId === 'orange-1',
    ),
  ).toBeUndefined();
});
it('선수 프로필 모드는 분리되며 통합 보기에서도 공식 타석에 평가를 혼합하지 않는다', async () => {
  let d: Workspace = createDemoWorkspace();
  const meta = { id: 's', at: '2026-10-20T00:00:00Z', actor: '가상', reason: '검증' };
  d = createBattingSession(
    d,
    { playerId: 'green-1', date, targetAttempts: 10, assessor: '가상', purpose: '검증', note: '' },
    meta,
  );
  d = recordBattingAttempt(
    d,
    's',
    1,
    { ...blankAttempt(), result: 'fair', score: 8 },
    { ...meta, id: 'a' },
  );
  const user = userEvent.setup();
  render(<Profile id="green-1" data={d} onClose={() => {}} />);
  await user.click(screen.getByRole('button', { name: '실전 경기' }));
  expect(screen.getByRole('heading', { name: '실전 경기 기록' })).toBeVisible();
  expect(screen.getByTestId('batting-score')).not.toBeVisible();
  await user.click(screen.getByRole('button', { name: '기능평가' }));
  expect(screen.getByTestId('batting-score')).toHaveTextContent('80.0');
  expect(screen.queryByRole('heading', { name: '실전 경기 기록' })).toBeNull();
  expect(within(screen.getByRole('dialog')).getByText('0타석 · 0안타')).not.toBeVisible();
});

it('상세평가 전체 화면 닫기·다시 열기는 회차 초안을 보존한다', async () => {
  const user = await openAssessment();
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  expect(screen.getByRole('complementary', { name: '회차 기록지' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '정상 타격' }));
  await user.click(screen.getByRole('button', { name: '평가 8점' }));
  await user.click(screen.getByRole('button', { name: '좌 원거리' }));
  await user.click(screen.getByRole('button', { name: '전체 화면 닫기' }));
  expect(screen.getByRole('button', { name: '평가 8점' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  expect(screen.getByRole('button', { name: '좌 원거리' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: '기록 저장 · 다음 회차' }));
  expect(saved().battingAttempts[0]).toMatchObject({ score: 8, directionZone: 'left-far' });
  expect(saved().events).toEqual([]);
});
