import { useId, useState } from 'react';
import { zoneLabel } from '../config/batting';
const point = (r: number, a: number) => [
  300 + r * Math.cos((a * Math.PI) / 180),
  345 + r * Math.sin((a * Math.PI) / 180),
];
const sector = (inner: number, outer: number, a: number, b: number) => {
  const [x1, y1] = point(outer, a),
    [x2, y2] = point(outer, b),
    [x3, y3] = point(inner, b),
    [x4, y4] = point(inner, a);
  return (
    'M' +
    x1 +
    ',' +
    y1 +
    ' A' +
    outer +
    ',' +
    outer +
    ' 0 0 1 ' +
    x2 +
    ',' +
    y2 +
    ' L' +
    x3 +
    ',' +
    y3 +
    ' A' +
    inner +
    ',' +
    inner +
    ' 0 0 0 ' +
    x4 +
    ',' +
    y4 +
    ' Z'
  );
};
export function ZoneHeatmap({
  counts,
  label,
  unlocated = 0,
}: {
  counts: Record<string, number>;
  label: string;
  unlocated?: number;
}) {
  const [mode, setMode] = useState<'count' | 'percent'>('count'),
    title = useId();
  const cells = (['near', 'middle', 'far'] as const).flatMap((distance, r) =>
    (['left', 'center', 'right'] as const).map((direction, c) => ({
      zone: direction + '-' + distance,
      r,
      c,
    })),
  );
  const total = cells.reduce((sum, c) => sum + (counts[c.zone] ?? 0), 0);
  return (
    <figure className="zone-heatmap" aria-label={label}>
      <figcaption>
        <b>{label}</b>
        <span>거리까지 관찰 {total}회</span>
      </figcaption>
      <div className="button-row">
        <button aria-pressed={mode === 'count'} onClick={() => setMode('count')}>
          횟수
        </button>
        <button aria-pressed={mode === 'percent'} onClick={() => setMode('percent')}>
          비율
        </button>
      </div>
      <svg viewBox="0 0 600 375" role="img" aria-labelledby={title}>
        <title id={title}>
          {label} · 홈에서 바라본 좌·중·우 및 근·중·원거리. 색이 진할수록 관찰 비율이 높습니다.
        </title>
        {cells.map(({ zone, r, c }) => {
          const n = counts[zone] ?? 0,
            ratio = total ? n / total : 0,
            a = -145 + (c * 110) / 3,
            b = a + 110 / 3,
            [x, y] = point(80 + r * 100, (a + b) / 2);
          return (
            <g
              key={zone}
              data-zone={zone}
              aria-label={
                zoneLabel(zone) +
                ' ' +
                n +
                '회 ' +
                (total ? (ratio * 100).toFixed(1) + '%' : '미관찰')
              }
            >
              <path
                d={sector(30 + r * 100, 130 + r * 100, a, b)}
                fill={total ? 'hsl(146 33% ' + (96 - ratio * 65) + '%)' : '#eff2ec'}
                stroke="#fff"
                strokeWidth="3"
              />
              <text
                x={x}
                y={y - 8}
                textAnchor="middle"
                fill={ratio > 0.6 ? 'white' : '#204c3d'}
                fontSize="13"
              >
                {zoneLabel(zone)}
              </text>
              <text
                x={x}
                y={y + 15}
                textAnchor="middle"
                fill={ratio > 0.6 ? 'white' : '#204c3d'}
                fontWeight="700"
                fontSize="20"
              >
                {!total ? '—' : mode === 'count' ? n + '회' : (ratio * 100).toFixed(1) + '%'}
              </text>
            </g>
          );
        })}
        <text x="300" y="366" textAnchor="middle" fontSize="14">
          ⌂ 홈
        </text>
      </svg>
      <div className="heat-legend">
        <span>0%</span>
        <i />
        <span>100%</span>
      </div>
      <p className="hint">
        미관찰 구역은 추정하지 않습니다. 구역을 알 수 없는 결과 {unlocated}회는 이 비율에서
        제외합니다. 거리 기준은 평가 세션별 정의를 확인하세요.
      </p>
    </figure>
  );
}
