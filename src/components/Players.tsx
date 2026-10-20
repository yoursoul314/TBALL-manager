import { summarizeBatting } from '../assessment/battingSummary';
import { BattingAssessmentReport } from './BattingAssessmentReport';
import {
  DIRECTION_LABELS,
  DISTANCE_LABELS,
  STRENGTH_LABELS,
  ERROR_LABELS,
} from '../config/recording';
import { useState } from 'react';
import { Search, Plus, ArrowUpRight } from 'lucide-react';
import { ABILITIES, ABILITY_LABELS, POSITIONS, POSITION_LABELS } from '../config/positions';
import { positionScore } from '../evaluation/score';
import type { Player, Workspace } from '../domain/model';
import { calculateStats } from '../statistics/calculate';
import { homeRunQualityLabel } from '../statistics/homeRuns';
import { Badge, Modal, Panel, Progress, Empty, fmt } from './ui';
export function Players({
  data,
  onSave,
  onProfile,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onProfile: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [team, setTeam] = useState('all');
  const [add, setAdd] = useState(false);
  const [addTeam, setAddTeam] = useState(false);
  const players = data.players.filter(
    (p) => (team === 'all' || p.teamId === team) && p.name.includes(filter),
  );
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">OUR PLAYERS</div>
          <h1>
            선수 & 팀<span className="title-dot">.</span>
          </h1>
          <p>숫자 너머, 선수 한 명 한 명의 가능성을 발견하세요.</p>
        </div>
        <div className="button-row">
          <button onClick={() => setAddTeam(true)}>팀 추가</button>
          <button className="primary" onClick={() => setAdd(true)}>
            <Plus size={18} />
            선수 등록
          </button>
        </div>
      </div>
      <div className="team-cards">
        {data.teams.map((t) => (
          <button
            key={t.id}
            className={'team-card ' + (team === t.id ? 'selected' : '')}
            onClick={() => setTeam(team === t.id ? 'all' : t.id)}
          >
            <span className="team-dot" style={{ background: t.color }} />
            <div>
              <b>{t.name}</b>
              <small>{data.players.filter((p) => p.teamId === t.id).length}명의 선수</small>
            </div>
            <ArrowUpRight size={20} />
          </button>
        ))}
      </div>
      <Panel
        title="선수 명단"
        action={
          <div className="search">
            <Search size={17} />
            <input
              aria-label="선수 검색"
              placeholder="선수 이름 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        }
      >
        <div className="player-grid">
          {players.map((p) => {
            const a = data.assessments.filter((a) => a.playerId === p.id).at(-1);
            const best = a
              ? POSITIONS.map((pos) => ({ pos, score: positionScore(a.abilities, pos) })).sort(
                  (a, b) => (b.score ?? -1) - (a.score ?? -1),
                )[0]
              : null;
            return (
              <button key={p.id} className="player-card" onClick={() => onProfile(p.id)}>
                <div className="player-card-top">
                  <span className="avatar">{String(p.number).padStart(2, '0')}</span>
                  <ArrowUpRight size={18} />
                </div>
                <h3>{p.name}</h3>
                <p>{data.teams.find((t) => t.id === p.teamId)?.name}</p>
                <div className="player-card-bottom">
                  <small>{best?.score != null ? '추천 포지션' : '기능평가 대기'}</small>
                  <b>{best?.score != null ? POSITION_LABELS[best.pos] : '미측정'}</b>
                </div>
              </button>
            );
          })}
        </div>
        {players.length === 0 && <Empty>검색 결과가 없습니다.</Empty>}
      </Panel>
      {add && (
        <Modal title="선수 등록" onClose={() => setAdd(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const player: Player = {
                id: crypto.randomUUID(),
                name: String(f.get('name')),
                number: Number(f.get('number')),
                teamId: String(f.get('team')),
                active: true,
              };
              onSave({ ...data, players: [...data.players, player] });
              setAdd(false);
            }}
          >
            <label>
              선수 이름
              <input name="name" required maxLength={80} placeholder="이름 또는 수업용 별칭" />
            </label>
            <div className="form-row">
              <label>
                등번호
                <input name="number" required type="number" min="0" max="999" defaultValue="1" />
              </label>
              <label>
                팀
                <select name="team">
                  {data.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="hint">
              새 선수는 이후 생성하는 경기 명단에 포함됩니다. 진행 중 경기의 명단은 고정됩니다.
            </p>
            <button className="primary wide">선수 저장</button>
          </form>
        </Modal>
      )}
      {addTeam && (
        <Modal title="새 팀 만들기" onClose={() => setAddTeam(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onSave({
                ...data,
                teams: [
                  ...data.teams,
                  {
                    id: crypto.randomUUID(),
                    name: String(f.get('name')),
                    color: String(f.get('color')),
                  },
                ],
              });
              setAddTeam(false);
            }}
          >
            <label>
              팀 이름
              <input name="name" required maxLength={80} />
            </label>
            <label>
              팀 색상
              <input name="color" type="color" defaultValue="#27795e" />
            </label>
            <button className="primary wide">팀 저장</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Profile({
  id,
  data,
  onClose,
}: {
  id: string;
  data: Workspace;
  onClose: () => void;
}) {
  const [view, setView] = useState<'combined' | 'assessment' | 'game'>('combined');
  const p = data.players.find((p) => p.id === id)!;
  const a = data.assessments.filter((a) => a.playerId === id).at(-1);
  const batting = summarizeBatting(data, id);
  const stats = data.games
    .flatMap(
      (game) =>
        calculateStats(
          game,
          data.events.filter((e) => e.gameId === game.id),
          data.policy,
        ).rows,
    )
    .filter((r) => r.playerId === id);
  const sum = (
    key:
      | 'totalBases'
      | 'pa'
      | 'hits'
      | 'atBats'
      | 'runs'
      | 'fieldingAttempts'
      | 'fieldingSuccesses'
      | 'violations',
  ) => stats.reduce((s, r) => s + r[key], 0);
  const distribution = (
    key:
      | 'positionAttempts'
      | 'positionSuccesses'
      | 'directions'
      | 'qualities'
      | 'homeRunQualities'
      | 'fieldingTypes'
      | 'runningTypes'
      | 'zones'
      | 'strengths'
      | 'fieldingActions'
      | 'errorsByType',
  ) =>
    stats.reduce(
      (acc, r) => {
        for (const [k, v] of Object.entries(r[key])) acc[k] = (acc[k] || 0) + v;
        return acc;
      },
      {} as Record<string, number>,
    );
  const labels: Record<string, string> = {
    left: '좌측',
    center: '중앙',
    right: '우측',
    ground: '땅볼',
    line: '직선타',
    ...STRENGTH_LABELS,
    ...ERROR_LABELS,
    ...Object.fromEntries(
      Object.entries(DIRECTION_LABELS).flatMap(([d, dl]) =>
        Object.entries(DISTANCE_LABELS).map(([r, rl]) => [d + '-' + r, dl + ' ' + rl]),
      ),
    ),
    ...Object.fromEntries(
      Object.entries({
        receive: '포구',
        throw: '송구',
        base: '베이스 처리',
        out: '아웃 기여',
      }).flatMap(([k, v]) => [
        [k + ':success', v + ' 성공'],
        [k + ':failure', v + ' 실패'],
      ]),
    ),
    fly: '뜬공',
    advance: '진루',
    'tag-up': '태그업',
    hold: '잔류',
    overrun: '오버런',
    lead: '리드 위반',
    steal: '도루 위반',
    slide: '슬라이딩 위반',
    ...ABILITY_LABELS,
  };
  return (
    <Modal title="스카우팅 프로필" onClose={onClose}>
      <div className="profile-hero">
        <span className="jersey">{String(p.number).padStart(2, '0')}</span>
        <div>
          <Badge>{data.teams.find((t) => t.id === p.teamId)?.name}</Badge>
          <h2>{p.name}</h2>
          <p>
            {a?.assessor === '가상 샘플 데이터'
              ? '가상 샘플 기능평가'
              : '경기 원본 이벤트 기반 분석'}
          </p>
        </div>
      </div>
      <div className="tabs" aria-label="프로필 분석 구분">
        {(
          [
            ['assessment', '기능평가'],
            ['game', '실전 경기'],
            ['combined', '통합 분석'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {l}
          </button>
        ))}
      </div>
      <div hidden={view !== 'combined'} className="profile-batting-comparison">
        <section>
          <h3>실전 경기</h3>
          <b>
            {sum('pa')}타석 · {sum('hits')}안타
          </b>
          <p>경기 원본 이벤트에서 계산</p>
        </section>
        <section>
          <h3>타격 기능평가</h3>
          <b>{batting.score?.toFixed(1) ?? '평가 기록 없음'} / 100</b>
          <p>{batting.count}회 유효 평가 · 경기 기록과 별도</p>
        </section>
      </div>
      <section hidden={view === 'assessment'}>
        <h3>실전 경기 기록</h3>
        <div className="mini-stats">
          <div>
            <small>타율</small>
            <b>{sum('atBats') ? fmt(sum('hits') / sum('atBats'), 3) : '—'}</b>
          </div>
          <div>
            <small>장타율</small>
            <b>{sum('atBats') ? fmt(sum('totalBases') / sum('atBats'), 3) : '미측정'}</b>
          </div>
          <div>
            <small>타석</small>
            <b>{sum('pa')}</b>
          </div>
          <div>
            <small>득점</small>
            <b>{sum('runs')}</b>
          </div>
          <div>
            <small>수비 성공</small>
            <b>
              {sum('fieldingAttempts')
                ? sum('fieldingSuccesses') + '/' + sum('fieldingAttempts')
                : '미측정'}
            </b>
          </div>
        </div>
        <div className="callout">
          관측이 없는 항목은 미측정으로 표시합니다. 희생플라이 등 미확정 정책에 따라 통계가 달라질
          수 있습니다.
        </div>
      </section>
      <section hidden={view === 'game'}>
        <BattingAssessmentReport data={data} playerId={id} />
        <details>
          <summary>회차별 평가점수</summary>
          <div className="attempt-sheet">
            {data.battingSessions
              .filter((s) => s.playerId === id)
              .map((s) => (
                <section key={s.id}>
                  <b>
                    {s.date} · {s.sessionNumber}차 {s.status === 'cancelled' ? '(취소)' : ''}
                  </b>
                  {data.battingAttempts
                    .filter((a) => a.sessionId === s.id)
                    .map((a) => (
                      <p key={a.id}>
                        {a.attemptNumber}회 ·{' '}
                        {a.status === 'cancelled'
                          ? '취소'
                          : a.score === null
                            ? '미평가'
                            : a.score + '점'}
                      </p>
                    ))}
                </section>
              ))}
          </div>
        </details>
        <h3>수비 능력 · 9개 지표</h3>
        {a ? (
          ABILITIES.map((k) => (
            <Progress
              key={k}
              value={a.abilities[k] ?? 0}
              label={
                k + ' · ' + ABILITY_LABELS[k] + (a.abilities[k] === undefined ? ' (미측정)' : '')
              }
            />
          ))
        ) : (
          <Empty>기능평가를 먼저 기록하세요.</Empty>
        )}
      </section>
      <section hidden={view === 'assessment'}>
        <h3>포지션별 수행 · 9능력 관찰 성공 / 평가 기회</h3>
        {Object.entries(distribution('positionAttempts')).length ? (
          Object.entries(distribution('positionAttempts')).map(([p, n]) => (
            <p key={p}>
              {POSITION_LABELS[p as keyof typeof POSITION_LABELS]} ·{' '}
              {distribution('positionSuccesses')[p] ?? 0}/{n}회
            </p>
          ))
        ) : (
          <p>미측정 · 수비 관찰 기록 없음</p>
        )}
        <div className="two-col profile-distributions">
          {(
            [
              'directions',
              'zones',
              'qualities',
              'homeRunQualities',
              'strengths',
              'fieldingTypes',
              'fieldingActions',
              'errorsByType',
              'runningTypes',
            ] as const
          ).map((key, i) => (
            <section key={key}>
              <h3>
                {
                  [
                    '타구 방향 (이전 기록 포함)',
                    '타구 9구역',
                    '타구 유형',
                    '홈런 타구 질',
                    '타구 강도',
                    '9능력 관찰',
                    '수비 동작',
                    '실책 유형',
                    '주루 유형',
                  ][i]
                }
              </h3>
              {Object.keys(distribution(key)).length ? (
                Object.entries(distribution(key)).map(([k, v]) => (
                  <div className="distribution" key={k}>
                    <span>
                      {key === 'homeRunQualities' ? homeRunQualityLabel(k) : labels[k] || k}
                    </span>
                    <b>{v}회</b>
                  </div>
                ))
              ) : (
                <p className="muted">아직 관찰 기록이 없습니다.</p>
              )}
            </section>
          ))}
        </div>
      </section>
    </Modal>
  );
}
