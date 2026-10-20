import { useState } from 'react';
import { Download } from 'lucide-react';
import type { Workspace } from '../domain/model';
import { calculateStats } from '../statistics/calculate';
import { homeRunQualityLabel } from '../statistics/homeRuns';
import { csvCell, downloadFile } from '../data/repository';
import { Badge, Panel, Empty, fmt } from './ui';
export function StatsView({
  data,
  onProfile,
}: {
  data: Workspace;
  onProfile: (id: string) => void;
}) {
  const [gameId, setGameId] = useState(data.games[0].id);
  const [scope, setScope] = useState<'record' | 'selection'>('record');
  const game = data.games.find((g) => g.id === gameId)!;
  const report = calculateStats(
    game,
    data.events.filter((e) => e.gameId === gameId),
    data.policy,
    scope,
  );
  const exportCSV = () => {
    const rows = [
      [
        '선수',
        '팀',
        '타석',
        '타수',
        '안타',
        '홈런',
        '홈런 타구 질',
        '타율',
        '득점',
        'RBI',
        'FC',
        '자살 PO',
        '보살 A',
        '실책 E',
        '실책 추가 진루 베이스',
        '9구역 분포',
        '강도 분포',
        '실책 유형',
        '수비 동작',
        '삼진',
        '수비 시도',
        '수비 성공',
        '주루 아웃',
        '주루 위반',
        '통계 범위',
        '정책 버전',
        '미확정 정책',
      ],
      ...report.rows.map((r) => {
        const p = data.players.find((p) => p.id === r.playerId)!;
        return [
          p.name,
          data.teams.find((t) => t.id === p.teamId)?.name,
          r.pa,
          r.atBats,
          r.hits,
          r.homeRuns,
          JSON.stringify(
            Object.fromEntries(
              Object.entries(r.homeRunQualities).map(([key, count]) => [
                homeRunQualityLabel(key),
                count,
              ]),
            ),
          ),
          fmt(r.battingAverage, 3),
          r.runs,
          r.rbi,
          r.fieldersChoices,
          r.putouts,
          r.assists,
          r.errors,
          r.errorAdvanceBases,
          JSON.stringify(r.zones),
          JSON.stringify(r.strengths),
          JSON.stringify(r.errorsByType),
          JSON.stringify(r.fieldingActions),
          r.strikeouts,
          r.fieldingAttempts,
          r.fieldingSuccesses,
          r.runningOuts,
          r.violations,
          scope,
          report.policyVersion,
          report.provisional ? 'YES' : 'NO',
        ];
      }),
    ];
    downloadFile(
      'TB-Manager-stats.csv',
      '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">GAME INSIGHTS</div>
          <h1>
            기록이 알려주는 것<span className="title-dot">.</span>
          </h1>
          <p>원본 이벤트로 다시 계산한, 근거 있는 선수 통계.</p>
        </div>
        <button className="primary" onClick={exportCSV}>
          <Download size={18} />
          CSV 내보내기
        </button>
      </div>
      <div className="toolbar">
        <select aria-label="통계 경기" value={gameId} onChange={(e) => setGameId(e.target.value)}>
          {data.games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="통계 범위"
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="record">전체 기록 통계</option>
          <option value="selection">선발용 통계 (정책 적용)</option>
        </select>
        {report.provisional && <Badge tone="amber">임시 정책 적용</Badge>}
      </div>
      <Panel
        title="선수별 경기 지표"
        action={<Badge tone="neutral">{report.rows.length}명 관측</Badge>}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  '선수',
                  '타석',
                  '타수',
                  '안타',
                  '홈런',
                  '홈런 타구 질',
                  '타율',
                  '득점',
                  'RBI',
                  'FC',
                  'PO / A / E',
                  '실책 진루',
                  '삼진',
                  '수비 성공/시도',
                  '주루 아웃',
                  '위반',
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.playerId}>
                  <td>
                    <button className="text-button" onClick={() => onProfile(r.playerId)}>
                      {data.players.find((p) => p.id === r.playerId)?.name}
                    </button>
                  </td>
                  <td>{r.pa}</td>
                  <td>{r.atBats}</td>
                  <td>{r.hits}</td>
                  <td>{r.homeRuns}</td>
                  <td>
                    {Object.entries(r.homeRunQualities).map(([key, count]) => (
                      <div key={key}>
                        {homeRunQualityLabel(key)} {count}회
                      </div>
                    ))}
                    {!r.homeRuns && '—'}
                  </td>
                  <td>
                    <b>{fmt(r.battingAverage, 3)}</b>
                  </td>
                  <td>{r.runs}</td>
                  <td>{r.rbi}</td>
                  <td>{r.fieldersChoices}</td>
                  <td>
                    {r.putouts} / {r.assists} / {r.errors}
                  </td>
                  <td>{r.errorAdvanceBases}</td>
                  <td>{r.strikeouts}</td>
                  <td>
                    {r.fieldingSuccesses}/{r.fieldingAttempts}
                  </td>
                  <td>{r.runningOuts}</td>
                  <td>{r.violations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.rows.length === 0 && (
          <Empty>아직 집계할 기록이 없습니다. 경기 기록실에서 첫 플레이를 남겨 보세요.</Empty>
        )}
        <p className="hint">
          미측정 비율은 —로 표시합니다. 수비 성공률은 입력된 관찰 횟수를 분모로 하며, 공식 야구
          수비율로 해석하지 않습니다. RBI·PO·A·E는 기록원의 별도 판정 기록만 집계합니다. 미기록은
          자동 추정하지 않습니다.
        </p>
      </Panel>
    </>
  );
}
