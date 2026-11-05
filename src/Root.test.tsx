import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const loaded = vi.hoisted(() => ({ coach: vi.fn() }));
vi.mock('./App', () => {
  loaded.coach();
  return { default: () => <div>교사 앱</div> };
});
import Root from './Root';
afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});
it('학생 주소는 교사 앱과 기존 로컬 기록 저장소를 열지 않음', async () => {
  history.replaceState(null, '', '/?register=1');
  const read = vi.spyOn(Storage.prototype, 'getItem');
  render(<Root />);
  expect(await screen.findByText('티볼 선수 등록 신청')).toBeInTheDocument();
  expect(loaded.coach).not.toHaveBeenCalled();
  // Supabase may read its own SDK debug flag; no coach workspace key may be accessed.
  expect(read.mock.calls.some(([key]) => key.startsWith('tb-manager.workspace.'))).toBe(false);
  expect(screen.queryByText('교사 앱')).toBeNull();
});
