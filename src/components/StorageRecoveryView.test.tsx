import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StorageRecoveryView } from './StorageRecoveryView';
import { LocalWorkspaceRepository, V11_STORAGE_KEY } from '../data/repository';
import { createDemoWorkspace } from '../data/seed';
vi.mock('../hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ available: true, checking: false, message: '', check: vi.fn(), apply: vi.fn() }) }));
afterEach(cleanup);
it('quota 원인을 명확히 안내하고 저장이 계속 실패해도 원본을 쓰지 않고 확인·백업 제공', () => {
  const raw = JSON.stringify({ ...createDemoWorkspace(), schemaVersion: 11 });
  const write = vi.fn(() => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); });
  const repository = new LocalWorkspaceRepository({ getItem: (key) => key === V11_STORAGE_KEY ? raw : null, setItem: write });
  render(<StorageRecoveryView error="The quota has been exceeded." repository={repository} />);
  expect(screen.getByRole('heading', { name: '브라우저 저장 공간이 부족합니다' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '기존 기록 확인' }));
  expect(screen.getByLabelText('검증된 기존 기록')).toHaveTextContent('선수 24명');
  expect(screen.getByRole('button', { name: '검증된 기록 JSON 백업' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '새 버전 적용' })).toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});
it('스키마 오류를 용량 문제로 오인하지 않고 원문 복구만 제공', () => {
  const repository = new LocalWorkspaceRepository({ getItem: () => 'corrupt', setItem: vi.fn() });
  render(<StorageRecoveryView error="평가 원본 또는 최종 정정 이력 누락" repository={repository} />);
  expect(screen.getByRole('heading', { name: '저장된 데이터를 확인해야 합니다' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '기존 기록 확인' }));
  expect(screen.queryByRole('button', { name: '검증된 기록 JSON 백업' })).not.toBeInTheDocument();
});
