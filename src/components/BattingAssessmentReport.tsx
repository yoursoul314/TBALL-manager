import {
  QUALITY_RUBRIC,
  LEGACY_RUBRIC,
  QUALITY_SCALE,
  rubricLabel,
} from '../config/battingQuality';
import type { BattingRubric } from '../domain/batting';
import { ZoneHeatmap } from './ZoneHeatmap';
import { useId, useState } from 'react';
import type { Workspace } from '../domain/model';
import { summarizeBatting } from '../assessment/battingSummary';
import { CONTACT_LABELS, TRAJECTORY_LABELS, RESULT_LABELS } from '../config/batting';
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
  const [rubric, setRubric] = useState<BattingRubric | 'auto'>('auto');
  const report = summarizeBatting(data, playerId, {
    from,
    to,
    ...(rubric === 'auto' ? {} : { rubric }),
  });
  const quality = report.rubric === QUALITY_RUBRIC;
  const chartId = useId();
  const points = report.daily.filter((d) => d.average !== null);
  const x = (i: number) => (points.length === 1 ? 300 : 45 + (i * 510) / (points.length - 1)),
    y = (n: number) => 185 - (quality ? ((n + 1) / 6) * 150 : n * 15);
  const line = (key: 'average' | 'cumulative') =>
    points.map((d, i) => `${x(i)},${y(d[key]!)}`).join(' ');
  const percent = (n: number | null) => (n === null ? '미관찰' : `${(n * 100).toFixed(1)}%`);
  return (
    <section className="batting-report" aria-label="타격 기능평가 분석">
      <h3>타격 기능평가 · 성장 기록</h3>
      <div className="form-row period-filter">
        <label>
          조회 평가 척도
          <select
            aria-label="조회 평가 척도"
            value={rubric}
            onChange={(e) => setRubric(e.target.value as BattingRubric | 'auto')}
          >
            <option value="auto">새 유효 기록 우선</option>
            <option value={QUALITY_RUBRIC}>타구 질 6단계 (−1~5점)</option>
            <option value={LEGACY_RUBRIC}>이전 수동 (1~10점)</option>
          </select>
        </label>
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
          <small>누적 기능평가 점수 / 100 · 타격 B {battingNumber(report.batting10)}/10</small>
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
          <span>
            최근 평균 {battingNumber(report.recent?.average ?? null)} ·{' '}
            {quality ? '−1~5점' : '1~10점'}
          </span>
        </div>
        <div>
          <small>최근 평가 변화 · {quality ? '−1~5점' : '1~10점'}</small>
          <strong>
            {report.change === null
              ? '비교 기록 없음'
              : `${report.change > 0 ? '+' : ''}${report.change.toFixed(1)}점`}
          </strong>
          <span>직전 평가일과 비교</span>
        </div>
      </div>
      <p className="hint">
        유효 {report.count}회 · 합계 {report.total}점 → 평균 {battingNumber(report.average)} ·{' '}
        {quality ? '(평균 + 1) ÷ 6 × 100' : '평균 × 10'}. 미평가·취소 제외, 계산 중 반올림 없음.
      </p>
      <p className="callout">
        조회 기능평가 점수 출처:{' '}
        {data.battingSettings.scoreSource === 'detailed' ? '신규 상세 기록' : '이전 수동 평가'} ·{' '}
        {battingNumber(report.selectedScore)} / 100
        <br />
        {rubricLabel(report.rubric)} 조회 중 · 척도끼리 평균을 합치지 않습니다. 새 유효 기록은 선수
        비교에 우선 사용합니다.
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
                    날짜별 평균과 누적 평균, {quality ? '−1~5점' : '1~10점'}. 아래 날짜별 기록에서
                    수치를 확인할 수 있습니다.
                  </title>
                  {(quality ? [-1, 0, 1, 2, 3, 4, 5] : [0, 5, 10]).map((n) => (
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
            <ZoneHeatmap
              counts={report.zones.counts}
              label="기능평가 타구 9구역"
              unlocated={report.observed - report.zones.total}
            />
          </section>
        </div>
        <div className="batting-ratios">
          {[
            ['타구 유형', report.trajectories, TRAJECTORY_LABELS],
            ...(!quality
              ? [
                  ['타구 강도', report.intensities, STRENGTH_LABELS],
                  ['타격 정확성', report.contacts, CONTACT_LABELS],
                ]
              : [
                  [
                    '타구 질 등급',
                    report.grades,
                    Object.fromEntries(
                      Object.entries(QUALITY_SCALE).map(([k, v]) => [k, v.score + '점 ' + v.label]),
                    ),
                  ],
                ]),
            [
              '타격 결과',
              report.results,
              quality ? { ...RESULT_LABELS, miss: '티 타격·헛스윙' } : RESULT_LABELS,
            ],
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
            등급과 선택 관찰의 비율은 해당 항목을 기록한 회차만 분모에 포함합니다. 기능평가 기록은
            실전 PA·H에 합산하지 않습니다.
          </small>
        </div>
      </details>
    </section>
  );
}
