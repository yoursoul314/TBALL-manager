import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { STORAGE_KEY, serializeBackup, readBackup } from '../data/repository';
import type { Workspace } from '../domain/model';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it.each([
  ['땅볼형 낮게 굴러가는 타구', 'ground', 'strong', '강한 땅볼형'],
  ['직선타형 낮고 곧게 뻗는 타구', 'line', 'normal', '보통 강도의 직선타형'],
  ['뜬공형 높은 궤적으로 날아가는 타구', 'fly', 'weak', '약한 뜬공형'],
])('홈런 타구 질 %s 입력·이력·통계·백업에서 유지된다', async (button, quality, strength, label) => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  await user.click(screen.getByRole('button', { name: '홈런' }));
  await user.click(screen.getByRole('button', { name: '상세 모드' }));
  await user.click(screen.getByRole('button', { name: '우 원거리' }));
  await user.selectOptions(screen.getByLabelText('타구 강도'), strength);
  const commit = screen.getByRole('button', { name: /심판 타임 · 플레이 확정/ });
  expect(commit).toBeDisabled();
  await user.click(screen.getByRole('button', { name: button }));
  expect(screen.getByRole('group', { name: '홈런 타구 질' })).toHaveTextContent('홈런 · ' + label);
  await user.click(screen.getByRole('button', { name: '샘플 선수 01 결과 확인' }));
  await user.click(screen.getByLabelText('심판 타임 선언 확인'));
  await user.click(commit);
  expect(screen.getByText('홈런 · ' + label + ' · 1득점')).toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Workspace;
  expect(saved.events[1].payload).toMatchObject({ result: 'home-run', quality, strength });
  expect(readBackup(serializeBackup(saved)).events).toEqual(saved.events);
  await user.click(screen.getByRole('button', { name: '플레이 수정 · 이력' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: '상세 모드' }));
  expect(dialog.getByRole('button', { name: button })).toHaveAttribute('aria-pressed', 'true');
  expect(dialog.getByLabelText('타구 강도')).toHaveValue(strength);
  await user.click(dialog.getByRole('button', { name: '닫기' }));
  await user.click(screen.getByRole('button', { name: '경기 분석' }));
  expect(screen.getByRole('cell', { name: label + ' 1회' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '샘플 선수 01' }));
  const profile = within(screen.getByRole('dialog'));
  expect(profile.getByRole('heading', { name: '홈런 타구 질' })).toBeInTheDocument();
  expect(profile.getByText(label)).toBeInTheDocument();
});
