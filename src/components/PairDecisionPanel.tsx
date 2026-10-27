import { useState } from 'react';
import type { ComparisonRow } from '../evaluation/comparison';
import {
  pairDecision,
  decisionNumber,
  PAIR_PURPOSES,
  type PairPurpose,
} from '../evaluation/pairDecision';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { Panel } from './ui';
export function PairDecisionPanel({
  rows,
  minimum,
  onCandidate,
  onMinimum,
}: {
  rows: ComparisonRow[];
  minimum: number;
  onCandidate: (id: string) => void;
  onMinimum: (n: number) => void;
}) {
  const [leftId, setLeft] = useState(''),
    [rightId, setRight] = useState(''),
    [purpose, setPurpose] = useState<PairPurpose>('overall'),
    [position, setPosition] = useState<Position>('1B');
  if (rows.length < 2)
    return (
      <Panel title="두 선수 중 누구를 선택할까?">
        <p>비교할 학생을 두 명 이상 선택하세요.</p>
      </Panel>
    );
  const a = rows.find((r) => r.player.id === leftId) ?? rows[0],
    b =
      rows.find((r) => r.player.id === rightId && r.player.id !== a.player.id) ??
      rows.find((r) => r.player.id !== a.player.id)!;
  const result = pairDecision(a, b, purpose, minimum, position),
    winner = rows.find((r) => r.player.id === result.winnerId);
  return (
    <Panel title="두 선수 중 누구를 선택할까?">
      <div className="form-row">
        {(
          [
            ['첫 번째 비교 선수', a, setLeft],
            ['두 번째 비교 선수', b, setRight],
          ] as const
        ).map(([label, row, set]) => (
          <label key={label}>
            {label}
            <select aria-label={label} value={row.player.id} onChange={(e) => set(e.target.value)}>
              {rows.map((r) => (
                <option
                  key={r.player.id}
                  value={r.player.id}
                  disabled={label === '두 번째 비교 선수' && r.player.id === a.player.id}
                >
                  {r.player.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          선택 목적
          <select
            aria-label="선택 목적"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as PairPurpose)}
          >
            {Object.entries(PAIR_PURPOSES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {purpose === 'position' && (
          <label>
            판단할 수비 포지션
            <select
              aria-label="판단할 수비 포지션"
              value={position}
              onChange={(e) => setPosition(e.target.value as Position)}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        비교 분석 최소 관찰 수
        <input
          type="number"
          min="1"
          max="1000"
          value={minimum}
          onChange={(e) =>
            onMinimum(Math.max(1, Math.min(1000, Math.trunc(Number(e.target.value)) || 1)))
          }
        />
      </label>
      <div className="pair-verdict" role="status">
        <h3>
          {winner
            ? result.purposeLabel + ' 기준, ' + winner.player.name + ' 우선 검토'
            : result.status === 'insufficient'
              ? '아직 한 선수를 추천하기에는 자료가 부족합니다'
              : result.status === 'tie'
                ? '현재 비교 지표가 같아 우열을 가리기 어렵습니다'
                : '장점이 갈립니다. 필요한 역할에 따라 선택하세요.'}
        </h3>
        {winner && (
          <p>
            현재 비교 가능한 지표에서 뒤지는 항목 없이 더 높은 값이 있습니다. 이 목적이라면{' '}
            {winner.player.name} 선수를 먼저 검토하는 편이 좋겠습니다.
          </p>
        )}
        {!!result.missing.length && (
          <p>
            판단 보류 항목: {result.missing.join(', ')}. 두 선수 모두 같은 출처·배점으로 항목별{' '}
            {minimum}회 이상 관찰해야 합니다.
          </p>
        )}
        <ul>
          {result.evidence
            .filter((e) => e.usable)
            .map((e) => (
              <li key={e.left.key}>
                <b>{e.left.label}</b> · {a.player.name} {decisionNumber(e.left)} ({e.left.sample}회)
                / {b.player.name} {decisionNumber(e.right)} ({e.right.sample}회) —{' '}
                {e.favored
                  ? rows.find((r) => r.player.id === e.favored)!.player.name + ' 우위'
                  : '같음'}
              </li>
            ))}
        </ul>
        {winner && (
          <button
            className="primary"
            disabled={!winner.player.active}
            onClick={() => onCandidate(winner.player.id)}
          >
            {winner.player.name} 검토 후보에 추가
          </button>
        )}
      </div>
      <p className="hint">
        측정값을 목적별로 비교한 참고 판단입니다. 타격·수비를 임의 비율로 합산하지 않으며, 최종
        엔트리는 감독이 결정합니다. 평가 조건·최근 변화·출전 가능 여부도 확인하세요.
      </p>
    </Panel>
  );
}
