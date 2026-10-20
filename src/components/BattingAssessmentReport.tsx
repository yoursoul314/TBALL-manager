import { useId, useState } from 'react';
import type { Workspace } from '../domain/model';
import { summarizeBatting } from '../assessment/battingSummary';
import { CONTACT_LABELS, TRAJECTORY_LABELS, RESULT_LABELS, zoneLabel } from '../config/batting';
import { STRENGTH_LABELS } from '../config/recording';
export const battingNumber = (value: number | null) =>
  value === null ? '평가 기록 없음' : value.toFixed(1);
export function BattingAssessmentReport({
  data,
  playerId,
  compact = false,
}: {
  data: Workspace;
  playerId: string;
  compact?: boolean;
}) {
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const report = summarizeBatting(data, playerId, { from, to });
  const chartId = useId();
  const points = report.daily.filter((d) => d.average !== null);
  const x = (i: number) => (points.length === 1 ? 300 : 45 + (i * 510) / (points.length - 1)),
    y = (n: number) => 185 - n * 15;
  const line = (key: 'average' | 'cumulative') =>
    points.map((d, i) => `${x(i)},${y(d[key]!)}`).join(' ');
  const percent = (n: number | null) => (n === null ? '미관찰' : `${(n * 100).toFixed(1)}%`);
  const maxZone = Math.max(1, ...Object.values(report.zones.counts));
  return (
    <section className="batting-report" aria-label="타격 기능평가 분석">
      <h3>타격 기능평가 · 성장 기록</h3>
      <div className="form-row period-filter">
        <label>
          분석 시작일
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          분석 종료일
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          전체 기간
        </button>
      </div>
      {from && to && from > to ? <p role="alert">분석 기간의 시작일을 확인하세요.</p> : null}
      <div className="batting-summary">
        <div>
          <small>누적 기능평가 점수 / 100</small>
          <strong data-testid="batting-score">{battingNumber(report.score)}</strong>
          <span>{report.provisional ? '진행 중 세션 포함 · 잠정 평균' : '완료 기록 기준'}</span>
        </div>
        <div>
          <small>누적 유효 평가</small>
          <strong>{report.count}회</strong>
          <span>{report.days}일 · 회차별 가중 평균</span>
        </div>
        <div>
          <small>최근 평가일</small>
          <strong>{report.recent?.date ?? '—'}</strong>
          <span>최근 평균 {battingNumber(report.recent?.average ?? null)} / 10</span>
        </div>
        <div>
          <small>최근 평가 변화 / 10</small>
          <strong>
            {report.change === null
              ? '비교 기록 없음'
              : `${report.change > 0 ? '+' : ''}${report.change.toFixed(1)}점`}
          </strong>
          <span>직전 평가일과 비교</span>
        </div>
      </div>
      <p className="hint">
        유효 {report.count}회 · 합계 {report.total}점 → 평균 {battingNumber(report.average)} × 10.
        미평가·취소 제외, 계산 중 반올림 없음.
      </p>
      <p className="callout">
        기능평가 점수 출처:{' '}
        {data.battingSettings.scoreSource === 'detailed' ? '신규 상세 기록' : '이전 수동 평가'} ·{' '}
        {battingNumber(report.selectedScore)} / 100
        <br />
        이전 수동 평가 {battingNumber(report.legacy)} / 100은 별도 참고 기록입니다. 두 점수를
        혼합하지 않습니다. 타격 기능·실전 결합 비율 및 최종 선발 알고리즘은 TODO입니다.
      </p>
      <details open={!compact}>
        <summary>성장 그래프 · 타구 분포 · 타격 성향</summary>
        <section className="direction-distribution">
          <h4>좌·중·우 분포 · 거리 미관찰 포함</h4>
          {Object.entries({ left: '좌측', center: '중앙', right: '우측' }).map(([key, label]) => (
            <span key={key}>
              {label} {report.directions.counts[key] ?? 0}회 ·{' '}
              {percent(report.directions.ratio(key))}{' '}
            </span>
          ))}
          <p className="hint">9구역 히트맵은 거리를 관찰한 타구만 포함합니다.</p>
        </section>
        <div className="batting-analysis-grid">
          <section>
            <h4>날짜별 평균과 누적 추세</h4>
            {points.length ? (
              <>
                <svg
                  className="batting-chart"
                  viewBox="0 0 600 225"
                  role="img"
                  aria-labelledby={chartId}
                >
                  <title id={chartId}>
                    날짜별 평균과 누적 평균, 1~10점. 아래 날짜별 기록에서 수치를 확인할 수 있습니다.
                  </title>
                  {[0, 5, 10].map((n) => (
                    <g key={n}>
                      <line x1="40" x2="560" y1={y(n)} y2={y(n)} stroke="#dfe5dc" />
                      <text x="10" y={y(n) + 4}>
                        {n}
                      </text>
                    </g>
                  ))}
                  <polyline
                    points={line('cumulative')}
                    fill="none"
                    stroke="#ba7025"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  />
                  <polyline points={line('average')} fill="none" stroke="#286348" strokeWidth="3" />
                  {points.map((d, i) => (
                    <g key={d.date}>
                      <circle cx={x(i)} cy={y(d.average!)} r="5" fill="#286348">
                        <title>
                          {d.date}: 날짜 평균 {battingNumber(d.average)}, 누적{' '}
                          {battingNumber(d.cumulative)}
                        </title>
                      </circle>
                      {(i === 0 || i === points.length - 1) && (
                        <text x={x(i)} y="213" textAnchor="middle">
                          {d.date.slice(5)}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>
                <p className="hint">● 초록 실선: 날짜 평균　 ┄ 황토 점선: 누적 평균</p>
              </>
            ) : (
              <p className="muted">점수를 저장하면 성장 추세가 표시됩니다.</p>
            )}
            <details>
              <summary>날짜별 평균 수치 보기 ({points.length}일)</summary>
              <ul className="daily-values">
                {report.daily.map((d) => (
                  <li key={d.date} data-testid="batting-day">
                    {d.date} · {d.count}회 · 평균 {battingNumber(d.average)} · 누적{' '}
                    {battingNumber(d.cumulative)} {d.provisional ? '(잠정)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section>
            <h4>타구 9구역 분포</h4>
            <div className="batting-heatmap" aria-label="기능평가 타구 히트맵">
              {(['far', 'middle', 'near'] as const).flatMap((r) =>
                (['left', 'center', 'right'] as const).map((d) => {
                  const zone = `${d}-${r}`,
                    n = report.zones.counts[zone] ?? 0;
                  return (
                    <div
                      key={zone}
                      style={{ background: `rgba(67, 133, 87, ${0.08 + (0.6 * n) / maxZone})` }}
                    >
                      <small>{zoneLabel(zone)}</small>
                      <b>{n}회</b>
                      <span>{report.zones.total ? percent(n / report.zones.total) : '미관찰'}</span>
                    </div>
                  );
                }),
              )}
            </div>
            <p className="hint">
              ⌂ 홈 · 방향을 관찰한 {report.zones.total}개 기준. 거리 기준은 각 세션의 구역 정의를
              따릅니다. 서로 다른 정의는 단순 비교에 주의하세요.
            </p>
          </section>
        </div>
        <div className="batting-ratios">
          {[
            ['타구 유형', report.trajectories, TRAJECTORY_LABELS],
            ['타구 강도', report.intensities, STRENGTH_LABELS],
            ['타격 정확성', report.contacts, CONTACT_LABELS],
            ['타격 결과', report.results, RESULT_LABELS],
          ].map(([title, dist, labels]) => {
            const values = dist as typeof report.trajectories;
            return (
              <section key={String(title)}>
                <h4>{String(title)}</h4>
                {Object.entries(labels).map(([key, label]) => (
                  <div className="batting-ratio" key={key}>
                    <span>{String(label)}</span>
                    <meter min="0" max="1" value={values.ratio(key) ?? 0} />
                    <b>{percent(values.ratio(key))}</b>
                  </div>
                ))}
                <small>관찰 {values.total}회 기준</small>
              </section>
            );
          })}
        </div>
        <div className="callout">
          <b>타격 성향</b>
          <p>{report.types.length ? report.types.join(' · ') : '확정된 유형 없음'}</p>
          <p>{report.classificationNote}</p>
          <small>
            정타·강도·유형별 비율은 해당 항목을 관찰한 회차만 분모에 포함합니다. 기능평가 기록은
            실전 PA·H에 합산하지 않습니다.
          </small>
        </div>
      </details>
    </section>
  );
}
