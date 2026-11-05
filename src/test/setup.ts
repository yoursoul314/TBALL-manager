import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    value() {
      this.setAttribute('open', '');
    },
    configurable: true,
  });
}
