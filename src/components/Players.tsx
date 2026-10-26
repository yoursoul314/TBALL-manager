import { setTeamArchived, setPlayerArchived } from '../domain/gameLibrary';
import type { Team } from '../domain/model';
import { PlayerEditor } from './PlayerEditor';
import { PlayerAvatar } from './PlayerAvatar';
import { gradeLabel } from '../domain/roster';
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
  const [playerTrash, setPlayerTrash] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);
  const [teamTrash, setTeamTrash] = useState(false);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [filter, setFilter] = useState(''),
    [team, setTeam] = useState('all'),
    [grade, setGrade] = useState('all'),
    [availability, setAvailability] = useState('all');
  const [add, setAdd] = useState(false),
    [editing, setEditing] = useState<Player | null>(null),
    [addTeam, setAddTeam] = useState(false),
    [error, setError] = useState('');
  const players = data.players.filter(
    (p) =>
      Boolean(p.archivedAt) === playerTrash &&
      (team === 'all' || p.teamId === team) &&
      (grade === 'all' || String(p.grade ?? 'unset') === grade) &&
      (availability === 'all' || p.active === (availability === 'active')) &&
      filter
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .every((q) =>
          [
            p.name,
            gradeLabel(p),
            p.classroom ?? '',
            String(p.number),
            String(p.studentNumber ?? ''),
          ]
            .join(' ')
            .toLocaleLowerCase()
            .includes(q),
        ),
  );
  return (
    <>
      <div className="page-title management-heading">
        <div>
          <div className="eyebrow">OUR PLAYERS</div>
          <h1>
            선수 & 팀<span className="title-dot">.</span>
          </h1>
          <p>학년과 팀을 독립적으로 관리하고, 경기마다 출전 명단을 정하세요.</p>
        </div>
        <div className="button-row management-actions">
          <button
            onClick={() => {
              setError('');
              setAddTeam(true);
            }}
          >
            팀 추가
          </button>
          <button
            className="primary"
            onClick={() => {
              setError('');
              setAdd(true);
            }}
          >
            <Plus size={18} />
            선수 등록
          </button>
        </div>
      </div>
      <p className="management-help">
        학생은 팀 선택 없이 등록합니다. 새 경기에서 등록 선수를 불러와 팀에 배정하세요.
      </p>

      <div className="tabs" aria-label="팀 목록 구분">
        <button aria-pressed={!teamTrash} onClick={() => setTeamTrash(false)}>
          운영 팀
        </button>
        <button aria-pressed={teamTrash} onClick={() => setTeamTrash(true)}>
          삭제된 팀 · {data.teams.filter((t) => t.archivedAt).length}
        </button>
      </div>
      {teamTrash && (
        <p className="callout">
          소속 선수·사진·평가·과거 경기는 그대로 보존됩니다. 팀을 복원하거나 선수 정보에서 소속을
          변경할 수 있습니다.
        </p>
      )}
      <div className="team-cards">
        {data.teams
          .filter((t) => Boolean(t.archivedAt) === teamTrash)
          .map((t) => (
            <div className="team-card-shell" key={t.id}>
              <button
                key={t.id}
                className={'team-card ' + (team === t.id ? 'selected' : '')}
                onClick={() => setTeam(team === t.id ? 'all' : t.id)}
              >
                <span className="team-dot" style={{ background: t.color }} />
                <div>
                  <b>{t.name}</b>
                  <small>
                    이전 소속{' '}
                    {data.players.filter((p) => p.teamId === t.id && !p.archivedAt).length}명 · 출전
                    가능{' '}
                    {
                      data.players.filter((p) => p.teamId === t.id && p.active && !p.archivedAt)
                        .length
                    }
                    명
                  </small>
                </div>
                <ArrowUpRight size={20} />
              </button>
              {t.archivedAt ? (
                <button
                  aria-label={t.name + ' 팀 복원'}
                  onClick={() => {
                    try {
                      onSave(setTeamArchived(data, t.id, false, new Date().toISOString()));
                      setError('');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : '복원 실패');
                    }
                  }}
                >
                  팀 복원
                </button>
              ) : (
                <button
                  aria-label={t.name + ' 팀 삭제'}
                  onClick={() => {
                    setError('');
                    setDeletingTeam(t);
                  }}
                >
                  팀 삭제
                </button>
              )}
            </div>
          ))}
      </div>
      <div className="tabs player-list-tabs" aria-label="선수 목록 구분">
        <button
          aria-pressed={!playerTrash}
          onClick={() => {
            setPlayerTrash(false);
            setFilter('');
          }}
        >
          등록 선수 · {data.players.filter((p) => !p.archivedAt).length}
        </button>
        <button
          aria-pressed={playerTrash}
          onClick={() => {
            setPlayerTrash(true);
            setFilter('');
          }}
        >
          삭제된 선수 · {data.players.filter((p) => p.archivedAt).length}
        </button>
      </div>
      {playerTrash && (
        <p className="callout">
          삭제된 선수의 사진·평가·과거 경기는 보존됩니다. 복원하면 평가와 새 경기 명단에 다시
          표시됩니다.
        </p>
      )}
      <div className="toolbar roster-filters">
        <label>
          학년 필터
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="all">전체 학년</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}학년
              </option>
            ))}
            <option value="unset">미설정</option>
          </select>
        </label>
        <label>
          팀 필터
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">전체 팀</option>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.archivedAt ? ' (삭제된 팀)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          출전 가능 여부
          <select value={availability} onChange={(e) => setAvailability(e.target.value)}>
            <option value="all">전체</option>
            <option value="active">출전 가능 선수</option>
            <option value="inactive">출전 불가 선수</option>
          </select>
        </label>
      </div>
      <Panel
        title="선수 명단"
        action={
          <div className="search">
            <Search size={17} />
            <input
              aria-label="선수 검색"
              placeholder="이름·학년·반·등번호 검색"
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
              <div key={p.id} className="player-card-shell">
                <button className="player-card" onClick={() => onProfile(p.id)}>
                  <div className="player-card-top">
                    <PlayerAvatar player={p} />
                    <ArrowUpRight size={18} />
                  </div>
                  <h3>{p.name}</h3>
                  <p>
                    {gradeLabel(p)} ·{' '}
                    {data.teams.find((t) => t.id === p.teamId)?.name ?? '경기에서 팀 배정'}
                    {data.teams.find((t) => t.id === p.teamId)?.archivedAt ? ' · 삭제된 팀' : ''}
                  </p>
                  <p>
                    {p.active ? '출전 가능' : '출전 불가'} · 주 포지션{' '}
                    {p.primaryPosition ? POSITION_LABELS[p.primaryPosition] : '미설정'}
                  </p>
                  <div className="player-card-bottom">
                    <small>{best?.score != null ? '수비 기능 추천' : '기능평가 대기'}</small>
                    <b>{best?.score != null ? POSITION_LABELS[best.pos] : '미측정'}</b>
                  </div>
                </button>
                <div className="player-management-buttons">
                  <button
                    className="text-button"
                    aria-label={p.name + ' 정보 수정'}
                    onClick={() => setEditing(p)}
                  >
                    정보·사진 수정
                  </button>
                  {p.archivedAt ? (
                    <button
                      aria-label={p.name + ' 선수 복원'}
                      onClick={() => {
                        try {
                          onSave(setPlayerArchived(data, p.id, false, new Date().toISOString()));
                          setError('');
                        } catch (e) {
                          setError(e instanceof Error ? e.message : '복원 실패');
                        }
                      }}
                    >
                      선수 복원
                    </button>
                  ) : (
                    <button
                      aria-label={p.name + ' 선수 삭제'}
                      onClick={() => {
                        setError('');
                        setDeletingPlayer(p);
                      }}
                    >
                      선수 삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!players.length && <Empty>검색 결과가 없습니다.</Empty>}
      </Panel>
      {(add || editing) && (
        <PlayerEditor
          player={editing ?? undefined}
          data={data}
          onSave={onSave}
          onClose={() => {
            setAdd(false);
            setEditing(null);
          }}
        />
      )}
      {deletingPlayer && (
        <Modal title="선수 삭제" onClose={() => setDeletingPlayer(null)}>
          <p>
            <b>{deletingPlayer.name}</b> 선수를 등록 명단과 새 경기·평가 대상에서 제외합니다.
            사진·평가·과거 경기 기록은 보존하며 삭제된 선수에서 복원할 수 있습니다. 기존 경기
            엔트리는 바뀌지 않습니다.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="primary"
            onClick={() => {
              try {
                onSave(setPlayerArchived(data, deletingPlayer.id, true, new Date().toISOString()));
                setDeletingPlayer(null);
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : '삭제 실패');
              }
            }}
          >
            선수 삭제 확정
          </button>
        </Modal>
      )}
      {deletingTeam && (
        <Modal title="팀 삭제" onClose={() => setDeletingTeam(null)}>
          <p>
            <b>{deletingTeam.name}</b> 팀을 운영 목록에서 삭제합니다. 소속 선수{' '}
            {data.players.filter((p) => p.teamId === deletingTeam.id).length}명과 과거
            경기·사진·평가는 보존됩니다. 새 경기에는 선택할 수 없으며 언제든 복원할 수 있습니다.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            className="primary"
            onClick={() => {
              try {
                onSave(setTeamArchived(data, deletingTeam.id, true, new Date().toISOString()));
                setDeletingTeam(null);
                setError('');
                setTeam('all');
              } catch (e) {
                setError(e instanceof Error ? e.message : '삭제 실패');
              }
            }}
          >
            팀 삭제 확정
          </button>
        </Modal>
      )}
      {!deletingTeam && !deletingPlayer && error && <p role="alert">{error}</p>}
      {addTeam && (
        <Modal title="새 팀 만들기" onClose={() => setAddTeam(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                onSave({
                  ...data,
                  teams: [
                    ...data.teams,
                    {
                      id: crypto.randomUUID(),
                      name: String(f.get('name')).trim(),
                      color: String(f.get('color')),
                    },
                  ],
                });
                setAddTeam(false);
                setTeamTrash(false);
                setError('');
              } catch (err) {
                setError(err instanceof Error ? err.message : '저장 실패');
              }
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
            {error && <p role="alert">{error}</p>}
            <p className="hint">한 경기는 두 팀이 진행하고, 나머지 팀은 대기합니다.</p>
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
    .filter((g) => !g.archivedAt)
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
        <PlayerAvatar player={p} className="jersey" />
        <div>
          <Badge>{data.teams.find((t) => t.id === p.teamId)?.name ?? '공통 명단'}</Badge>
          <h2>{p.name}</h2>
          <p>
            {gradeLabel(p)} · 등번호 {p.number} · {p.active ? '출전 가능' : '출전 불가'}
          </p>
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
