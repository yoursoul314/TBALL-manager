import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { comparisonRows, type ComparisonRow } from './comparison';
import { pairDecision } from './pairDecision';
const rows = () => {
  const r = comparisonRows(createDemoWorkspace(), ['green-1', 'green-2']);
  for (const row of r)
    for (const m of row.metrics) {
      m.sample = 15;
      m.source = 'same-trial';
      m.value = 70;
    }
  return r;
};
const value = (row: ComparisonRow, key: string, n: number | null) => {
  row.metrics.find((m) => m.key === key)!.value = n;
};
it('목적별 우선 검토·동점·타격수비 상충을 구분하며 가중 종합점수를 만들지 않는다', () => {
  const [a, b] = rows();
  value(a, 'batting-skill', 90);
  value(a, 'G', 60);
  expect(pairDecision(a, b, 'batting', 15).winnerId).toBe(a.player.id);
  expect(pairDecision(a, b, 'overall', 15).status).toBe('tradeoff');
  value(a, 'G', 70);
  expect(pairDecision(a, b, 'overall', 15).winnerId).toBe(a.player.id);
  value(a, 'batting-skill', 70);
  expect(pairDecision(a, b, 'overall', 15).status).toBe('tie');
  value(a, 'avg', 0.8);
  value(b, 'avg', 0.5);
  value(a, 'slg', 1);
  value(b, 'slg', 1.2);
  expect(pairDecision(a, b, 'game', 15).status).toBe('tradeoff');
});
it('미측정·표본 부족·다른 출처는 추천하지 않고 목적별 부족 항목을 알린다', () => {
  const [a, b] = rows();
  value(a, 'batting-skill', 90);
  b.metrics.find((m) => m.key === 'batting-skill')!.sample = 14;
  expect(pairDecision(a, b, 'batting', 15).winnerId).toBeNull();
  b.metrics.find((m) => m.key === 'batting-skill')!.sample = 15;
  b.metrics.find((m) => m.key === 'batting-skill')!.source = 'manual';
  expect(pairDecision(a, b, 'batting', 15).status).toBe('insufficient');
  value(b, 'G', null);
  expect(pairDecision(a, b, 'overall', 15).missing).toContain('G 땅볼');
});
it('포지션 추천은 같은 수비 배점과 필요한 능력의 최소 관찰 수를 요구한다', () => {
  const [a, b] = rows();
  value(a, '1B', 90);
  expect(pairDecision(a, b, 'position', 15, '1B').winnerId).toBe(a.player.id);
  b.defense.summary.mixedRubrics = true;
  expect(pairDecision(a, b, 'position', 15, '1B').status).toBe('insufficient');
  expect(() => pairDecision(a, a, 'batting', 15)).toThrow('서로 다른');
});
