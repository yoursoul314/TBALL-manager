import { afterEach, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it('경기 기록실에서 세 번의 파울 입력이 실제 삼진과 다음 타자로 연결된다', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /경기 기록하기/ }));
  const foul = () => screen.getByRole('button', { name: /^파울/ });
  await user.click(foul());
  await user.click(foul());
  await user.click(foul());
  expect(screen.getByText('삼진')).toBeInTheDocument();
  expect(screen.getByText('2번 타자')).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('tb-manager.workspace.v3')!).events).toHaveLength(3);
});
