import { ZoneHeatmap } from './ZoneHeatmap';
import { PairDecisionPanel } from './PairDecisionPanel';
import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { activePlayers } from '../domain/gameLibrary';
import { StudentFilters } from './StudentFilters';
import { PlayerAvatar } from './PlayerAvatar';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import {
  comparisonRows,
  comparisonInsights,
  saveComparisonSelection,
  type ComparisonMetric,
} from '../evaluation/comparison';
import { ABILITY_LABELS, POSITION_LABELS } from '../config/positions';
import { DIRECTION_LABELS, STRENGTH_LABELS, ERROR_LABELS } from '../config/recording';
import { TRAJECTORY_LABELS, CONTACT_LABELS, RESULT_LABELS, zoneLabel } from '../config/batting';
import { homeRunQualityLabel } from '../statistics/homeRuns';
import { Panel, Badge } from './ui';
const display = (m: ComparisonMetric, value = m.value) =>
  value === null
    ? '미측정'
    : m.unit === 'rate'
      ? ['avg', 'slg'].includes(m.key)
        ? value.toFixed(3)
        : (value * 100).toFixed(1) + '%'
      : m.unit === 'score'
        ? value.toFixed(1)
        : String(value);
const groups = {
  summary: '핵심 비교',
  batting: '타격 수치',
  defense: '수비 수치',
  positions: '포지션 적합도',
} as const;
export function ComparisonView({
  data,
  onSave,
  onProfile,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onProfile: (id: string) => void;
  onDirtyChange: (v: boolean) => void;
}) {
  const players = activePlayers(data),
    [filter, setFilter] = useState(emptyStudentFilter),
    [ids, setIds] = useState<string[]>(data.comparisonSelection?.playerIds ?? []),
    [candidateIds, setCandidateIds] = useState<string[]>(data.comparisonSelection?.playerIds ?? []),
    [note, setNote] = useState(data.comparisonSelection?.note ?? ''),
    [dirty, setDirty] = useState(false),
    [group, setGroup] = useState<keyof typeof groups>('summary'),
    [minimum, setMinimum] = useState(data.battingSettings.classification.minimumBalls),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const rows = comparisonRows(data, ids),
    shown = filterStudents(players, filter);
  const changed = () => {
    setDirty(true);
    onDirtyChange(true);
    setMessage('');
  };
  const validCandidates = candidateIds.filter((id) => players.some((p) => p.id === id && p.active));
  const labels: Record<string, string> = {
    ...DIRECTION_LABELS,
    ...STRENGTH_LABELS,
    ...TRAJECTORY_LABELS,
    ...CONTACT_LABELS,
    ...RESULT_LABELS,
    ...ERROR_LABELS,
    ...ABILITY_LABELS,
    ...POSITION_LABELS,
  };
  const mapLabel = (k: string) =>
    k.includes('-') && /^(left|center|right)-/.test(k)
      ? zoneLabel(k)
      : k.includes(':')
        ? k
            .split(':')
            .map(
              (v) =>
                (
                  ({
                    receive: '포구',
                    throw: '송구',
                    base: '베이스',
                    out: '아웃',
                    success: '성공',
                    failure: '실패',
                  }) as Record<string, string>
                )[v] ??
                labels[v] ??
                v,
            )
            .join(' ')
        : (labels[k] ?? k);
  const distributions = rows[0]
    ? [
        ...(
          ['directions', 'zones', 'trajectories', 'intensities', 'contacts', 'results'] as const
        ).map((key, i) => ({
          title: [
            '기능평가 타구 방향',
            '기능평가 9구역',
            '기능평가 타구 유형',
            '기능평가 강도',
            '기능평가 정확성',
            '기능평가 결과',
          ][i],
          values: rows.map((r) => r.batting[key].counts),
          homeRun: false,
        })),
        ...(
          [
            'directions',
            'zones',
            'qualities',
            'strengths',
            'homeRunQualities',
            'errorsByType',
            'fieldingActions',
            'fieldingTypes',
            'positionAttempts',
            'positionSuccesses',
          ] as const
        ).map((key, i) => ({
          title: [
            '실전 타구 방향',
            '실전 9구역',
            '실전 타구 유형',
            '실전 강도',
            '실전 홈런 타구 질',
            '실전 실책 유형',
            '실전 수비 행동',
            '실전 9능력 관찰 종류',
            '실전 포지션 관찰 기회',
            '실전 포지션 관찰 성공',
          ][i],
          values: rows.map((r) => r.maps[key]),
          homeRun: key === 'homeRunQualities',
        })),
      ]
    : [];
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">COMPARE & CHOOSE</div>
          <h1>선수 비교 & 선택</h1>
          <p>타격·수비의 근거를 나란히 확인하고 감독이 후보를 선택합니다.</p>
        </div>
        <Badge tone="amber">검토 후보 · 확정 엔트리 아님</Badge>
      </div>
      <Panel title="비교 학생 선택">
        <StudentFilters players={players} value={filter} onChange={setFilter} prefix="비교 학생" />
        <div className="bulk-actions">
          <button onClick={() => setIds([...new Set([...ids, ...shown.map((p) => p.id)])])}>
            표시 학생 비교 추가 · {shown.length}명
          </button>
          <button onClick={() => setIds([])}>비교 선택 해제</button>
          <b>비교 {rows.length}명</b>
        </div>
        <div className="assessment-student-picker">
          {shown.map((p) => (
            <label key={p.id} className="check student-pick">
              <input
                type="checkbox"
                aria-label={p.name + ' 비교 선택'}
                checked={ids.includes(p.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                }
              />
              <PlayerAvatar player={p} />
              <span>
                {p.name} · {p.number}번
              </span>
            </label>
          ))}
        </div>
      </Panel>
      {!!rows.length && (
        <>
          <Panel title="타격·수비 수치 비교">
            <p className="hint">
              운영 중 경기의 전체 기록(미완료 이닝 포함)과 누적 기능평가를 구분합니다. 출전·관찰이
              없으면 성공률은 미측정입니다. 타점·자살·보살·실책은 실제 기록된 건수이며 기록 누락을
              실패로 간주하지 않습니다.
            </p>
            <div className="tabs">
              {Object.entries(groups).map(([k, l]) => (
                <button
                  key={k}
                  aria-pressed={group === k}
                  onClick={() => setGroup(k as keyof typeof groups)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="comparison-table-wrap">
              <table className="metric-comparison">
                <thead>
                  <tr>
                    <th>지표 / 근거</th>
                    {rows.map((r) => (
                      <th key={r.player.id}>
                        <button onClick={() => onProfile(r.player.id)}>{r.player.name}</button>
                        <small>
                          수비: {r.defense.source === 'checklist' ? '체크 환산' : '수동 점수'}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows[0].metrics
                    .filter((m) => m.group === group)
                    .map((m) => (
                      <tr key={m.key}>
                        <th>{m.label}</th>
                        {rows.map((r) => {
                          const value = r.metrics.find((x) => x.key === m.key)!;
                          return (
                            <td key={r.player.id}>
                              <b>{display(value)}</b>
                              <small>
                                {value.sample === null
                                  ? '관찰 횟수 없음'
                                  : value.sample + '회 근거'}
                              </small>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="hint">
              수비 기능 점수는 학생별 적용 출처를 사용합니다. 필요한 능력 미측정 시 포지션 점수는
              계산하지 않습니다. 확정된 TYPE1 v2.0 가중치를 유지합니다.
            </p>
          </Panel>
          <PairDecisionPanel
            rows={rows}
            minimum={minimum}
            onMinimum={setMinimum}
            onCandidate={(id) => {
              setCandidateIds([...new Set([...candidateIds, id])]);
              changed();
            }}
          />
          <Panel title="기능평가 9구역 비교">
            <div className="zone-comparison">
              {rows.map((r) => (
                <ZoneHeatmap
                  key={r.player.id}
                  counts={r.batting.zones.counts}
                  label={r.player.name + ' · 9구역'}
                  unlocated={r.batting.observed - r.batting.zones.total}
                />
              ))}
            </div>
          </Panel>
          <Panel title="관찰에 근거한 장점·보완점">
            <p className="hint">
              같은 출처·배점과 최소 표본을 만족한 비교 학생들의 평균과 비교합니다. 상대적으로 유리한
              지표와 보완 검토 지표이며 절대 등급·최종 종합 순위가 아닙니다. 수동 점수는 관찰 횟수를
              알 수 없어 장단점을 단정하지 않습니다. 배점이 섞인 수비 기록은 비교 판단을 보류하며,
              점수와 비율의 차이를 서로 합산하거나 크기순으로 순위를 매기지 않습니다.
            </p>
            <div className="comparison-insights">
              {rows.map((r) => {
                const insight = comparisonInsights(r, rows, minimum);
                return (
                  <article key={r.player.id}>
                    <div className="button-row">
                      <PlayerAvatar player={r.player} />
                      <h3>{r.player.name}</h3>
                    </div>
                    <p>
                      유효 타격 평가 {r.batting.count}회 · 실전 {r.stats.pa}타석 · 수비 상황{' '}
                      {r.defense.summary.count}회
                    </p>
                    {r.defense.summary.mixedRubrics && (
                      <p className="alert">수비 기록에 여러 배점이 포함되어 있습니다.</p>
                    )}
                    {(['strengths', 'weaknesses'] as const).map((key) => (
                      <section key={key}>
                        <b>{key === 'strengths' ? '상대적 장점' : '보완 검토'}</b>
                        {insight[key].length ? (
                          <ul>
                            {insight[key].map((e) => (
                              <li key={e.metric.key}>
                                {e.metric.label} {display(e.metric)} · {e.metric.sample}회 (비교{' '}
                                {e.peers}명 평균 {display(e.metric, e.average)})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">판단 보류 · 표본/비교 대상 부족 또는 차이 없음</p>
                        )}
                      </section>
                    ))}
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label={r.player.name + ' 검토 후보'}
                        disabled={!r.player.active}
                        checked={candidateIds.includes(r.player.id)}
                        onChange={(e) => {
                          setCandidateIds(
                            e.target.checked
                              ? [...candidateIds, r.player.id]
                              : candidateIds.filter((id) => id !== r.player.id),
                          );
                          changed();
                        }}
                      />
                      {r.player.active ? '검토 후보로 선택' : '출전 불가'}
                    </label>
                  </article>
                );
              })}
            </div>
          </Panel>
          <Panel title="타구·수비 세부 분포">
            <p className="hint">
              항목별 관찰 건수와 해당 분포의 비율입니다. 방향·타구 유형·강도는 좋고 나쁨으로 자동
              판정하지 않습니다.
            </p>
            {distributions.map((d) => {
              const keys = [...new Set(d.values.flatMap((v) => Object.keys(v)))];
              return (
                <details key={d.title}>
                  <summary>{d.title}</summary>
                  {keys.length ? (
                    <div className="comparison-table-wrap">
                      <table className="metric-comparison">
                        <thead>
                          <tr>
                            <th>관찰 항목</th>
                            {rows.map((r) => (
                              <th key={r.player.id}>{r.player.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {keys.map((k) => (
                            <tr key={k}>
                              <th>{d.homeRun ? homeRunQualityLabel(k) : mapLabel(k)}</th>
                              {d.values.map((v, i) => {
                                const total = Object.values(v).reduce((a, b) => a + b, 0);
                                return (
                                  <td key={rows[i].player.id}>
                                    {total
                                      ? (v[k] ?? 0) +
                                        '회 · ' +
                                        (((v[k] ?? 0) / total) * 100).toFixed(1) +
                                        '%'
                                      : '미측정'}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>미측정</p>
                  )}
                </details>
              );
            })}
          </Panel>
        </>
      )}
      <Panel title="경기에서 불러올 검토 후보">
        <p>
          선택 {validCandidates.length}명 ·{' '}
          {validCandidates.map((id) => players.find((p) => p.id === id)!.name).join(', ') ||
            '선택 없음'}
        </p>
        <label>
          후보 선정 메모
          <textarea
            maxLength={2000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="button-row">
          <button
            className="primary"
            disabled={!dirty}
            onClick={() => {
              try {
                onSave(
                  saveComparisonSelection(data, validCandidates, note, new Date().toISOString()),
                );
                setDirty(false);
                onDirtyChange(false);
                setError('');
                setMessage(
                  '검토 후보를 저장했습니다. 새 경기에서 비교 후보 불러오기를 사용하세요.',
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : '저장 실패');
              }
            }}
          >
            검토 후보 저장
          </button>
          <button
            disabled={!dirty}
            onClick={() => {
              setCandidateIds(data.comparisonSelection?.playerIds ?? []);
              setNote(data.comparisonSelection?.note ?? '');
              setDirty(false);
              onDirtyChange(false);
              setError('');
            }}
          >
            후보 변경 되돌리기
          </button>
        </div>
        <p className="hint">
          선택은 감독의 검토 초안입니다. 경기별 팀 배정·10명 엔트리·감독 승인은 경기 생성 화면에서
          별도로 진행합니다.
        </p>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </Panel>
    </>
  );
}
