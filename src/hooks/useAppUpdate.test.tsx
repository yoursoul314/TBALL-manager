import { afterEach, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { useAppUpdate } from './useAppUpdate';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('새 버전을 표시하되 미저장 입력이 있으면 적용을 막는다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '99.0.0' }) }),
  );
  const { result } = renderHook(() => useAppUpdate(true));
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(() => result.current.apply());
  expect(result.current.message).toContain('저장하지 않은');
});
it('오프라인 확인 실패를 최신 버전이라고 표시하지 않는다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')));
  const { result } = renderHook(() => useAppUpdate(false));
  await waitFor(() => expect(result.current.checking).toBe(false));
  await act(() => result.current.check());
  expect(result.current.message).toContain('확인 실패');
  expect(result.current.available).toBe(false);
});
