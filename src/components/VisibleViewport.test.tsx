import { afterEach, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useVisibleViewport } from './useVisibleViewport';
const original = Object.getOwnPropertyDescriptor(window, 'visualViewport');
afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(window, 'visualViewport', original);
  else Reflect.deleteProperty(window, 'visualViewport');
});
it('키보드 높이·이동·닫기에 맞춰 프레임을 갱신하고 입력과 버튼 터치 상태를 보존한다', () => {
  const viewport = Object.assign(new EventTarget(), {
    height: 768,
    width: 1024,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  function Host() {
    const ref = useVisibleViewport<HTMLDivElement>(true);
    return (
      <div ref={ref} data-testid="frame">
        <textarea aria-label="메모" />
        <button>저장</button>
      </div>
    );
  }
  render(<Host />);
  const frame = screen.getByTestId('frame'),
    input = screen.getByLabelText('메모');
  fireEvent.change(input, { target: { value: '유지할 메모' } });
  act(() => {
    input.focus();
    viewport.height = 420;
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event('resize'));
  });
  expect(frame.style.getPropertyValue('--visible-height')).toBe('420px');
  expect(frame.style.getPropertyValue('--visible-top')).toBe('120px');
  expect(frame.dataset.keyboard).toBe('true');
  act(() => screen.getByRole('button', { name: '저장' }).focus());
  expect(frame.dataset.keyboard).toBe('true');
  act(() => {
    viewport.height = 768;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('resize'));
  });
  expect(frame.dataset.keyboard).toBe('false');
  expect(input).toHaveValue('유지할 메모');
});
