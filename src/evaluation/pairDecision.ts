import type { ComparisonRow, ComparisonMetric } from './comparison';
import { ABILITIES, POSITION_LABELS, type Position } from '../config/positions';
export type PairPurpose = 'overall' | 'batting' | 'game' | 'position';
export const PAIR_PURPOSES = {
  overall: '타격 기능 + 수비 9능력',
  batting: '타격 기능평가 우선',
  game: '실전 타격 우선',
  position: '특정 수비 포지션 우선',
} as const;
export function pairDecision(
  a: ComparisonRow,
  b: ComparisonRow,
  purpose: PairPurpose,
  minimum: number,
  position: Position = '1B',
) {
  if (a.player.id === b.player.id) throw new Error('서로 다른 두 학생을 선택하세요');
  if (!Number.isInteger(minimum) || minimum < 1) throw new Error('최소 표본은 1 이상의 정수');
  const keys =
    purpose === 'overall'
      ? ['batting-skill', ...ABILITIES]
      : purpose === 'batting'
        ? ['batting-skill']
        : purpose === 'game'
          ? ['avg', 'slg']
          : [position];
  const evidence = keys.map((key) => {
    const left = a.metrics.find((m) => m.key === key)!,
      right = b.metrics.find((m) => m.key === key)!;
    const same =
      left.source === right.source &&
      (purpose !== 'position' ||
        (!a.defense.summary.mixedRubrics &&
          !b.defense.summary.mixedRubrics &&
          a.metrics.find((m) => m.key === 'G')!.source ===
            b.metrics.find((m) => m.key === 'G')!.source));
    const usable =
      same &&
      left.value !== null &&
      right.value !== null &&
      left.sample !== null &&
      right.sample !== null &&
      left.sample >= minimum &&
      right.sample >= minimum;
    const delta = usable ? left.value! - right.value! : null;
    return {
      left,
      right,
      usable,
      favored:
        delta === null || Math.abs(delta) < 1e-9 ? null : delta > 0 ? a.player.id : b.player.id,
    };
  });
  const missing = evidence.filter((e) => !e.usable).map((e) => e.left.label);
  const winners = new Set(evidence.flatMap((e) => (e.favored ? [e.favored] : [])));
  const status = missing.length
    ? 'insufficient'
    : winners.size === 0
      ? 'tie'
      : winners.size === 1
        ? 'preferred'
        : 'tradeoff';
  return {
    status,
    winnerId: status === 'preferred' ? [...winners][0] : null,
    evidence,
    missing,
    purposeLabel: purpose === 'position' ? POSITION_LABELS[position] : PAIR_PURPOSES[purpose],
  };
}
export const decisionNumber = (m: ComparisonMetric) =>
  m.value === null
    ? '미측정'
    : m.unit === 'rate'
      ? ['avg', 'slg'].includes(m.key)
        ? m.value.toFixed(3)
        : (m.value * 100).toFixed(1) + '%'
      : m.value.toFixed(1) + '점';
