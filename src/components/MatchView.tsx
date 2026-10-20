import { useState } from 'react';
import { ArrowRight, CircleDot, Flag, RotateCcw, Plus, Play } from 'lucide-react';
import type {
  BatResult,
  EventPayload,
  Game,
  GameState,
  Id,
  RunnerOutcome,
  Side,
  Workspace,
} from '../domain/model';
import { currentBatter, dueRunner, effectiveEvents, scoreboard } from '../engine/game';
import { RULES_VERSION } from '../config/rules';
import { Badge, Panel, Modal, Empty } from './ui';
import { Field } from './Field';
interface Props {
  data: Workspace;
  game: Game;
  state: GameState;
  onEvent: (p: EventPayload) => void;
  onCreate: (g: Game) => void;
  onSelect: (id: Id) => void;
  onProfile: (id: Id) => void;
}
export function MatchView({ data, game, state, onEvent, onCreate, onSelect, onProfile }: Props) {
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState('');
  const [manager, setManager] = useState('');
  const [swap, setSwap] = useState(false);
  const [finish, setFinish] = useState(false);
  const names = (id: Id) => data.players.find((p) => p.id === id)?.name || id;
  const teamName = (side: Side) => data.teams.find((t) => t.id === game.teamIds[side])?.name;
  const score = scoreboard(state);
  const current = currentBatter(state);
  const last = effectiveEvents(data.events.filter((e) => e.gameId === game.id)).at(-1);
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">LIVE SCOREBOOK</div>
          <h1>
            경기 기록실<span className="title-dot">.</span>
          </h1>
          <p>한 번의 플레이도 놓치지 않도록, 차근차근 기록하세요.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>
          <Plus size={18} />새 경기
        </button>
      </div>
      <div className="toolbar">
        <select aria-label="경기 선택" value={game.id} onChange={(e) => onSelect(e.target.value)}>
          {data.games.map((g) => (
            <option value={g.id} key={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <Badge tone={state.status === 'finished' ? 'neutral' : 'green'}>
          {state.status === 'finished'
            ? '경기 종료'
            : state.ball === 'live'
              ? '플레이 중'
              : '볼 데드'}
        </Badge>
        <span className="muted">{game.innings}이닝 경기 · 전원 타격제</span>
      </div>
      <div className="scoreboard">
        <div className="team-score">
          <span className="team-mark green">G</span>
          <div>
            <small>AWAY · 선공</small>
            <h2>{teamName('away')}</h2>
          </div>
          <strong>{score.total.away}</strong>
        </div>
        <div className="inning">
          <Badge tone="lime">
            {state.inning}회 {state.side === 'away' ? '초' : '말'}
          </Badge>
          <span>
            {state.status === 'finished'
              ? '종료'
              : state.appearances + 1 + ' / ' + state.lineups[state.side].length + '번 타순'}
          </span>
        </div>
        <div className="team-score home">
          <strong>{score.total.home}</strong>
          <div>
            <small>HOME · 후공</small>
            <h2>{teamName('home')}</h2>
          </div>
          <span className="team-mark orange">O</span>
        </div>
      </div>
      <div className="score-note">
        <span>
          승패 반영{' '}
          <b>
            {score.official.away} : {score.official.home}
          </b>{' '}
          · 양 팀 완료 {score.completedInnings}이닝
        </span>
        <span>
          {state.status === 'finished'
            ? score.result === 'tie'
              ? '무승부'
              : score.result === 'no-completed-inning'
                ? '승패 판정 없음'
                : teamName(score.result as Side) + ' 승'
            : '현재 점수는 진행 중인 이닝을 포함합니다'}
        </span>
      </div>
      <div className="match-grid">
        <Panel
          title="그라운드"
          eyebrow="ON THE FIELD"
          action={<Badge tone="neutral">TYPE 1</Badge>}
        >
          <Field bases={state.bases[state.side]} players={data.players} />
          <div className="field-footer">
            <div>
              <small>STRIKES</small>
              <div className="strike-dots">
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i < state.strikes ? 'filled' : ''} />
                ))}
              </div>
            </div>
            <div>
              <small>현재 공격 아웃</small>
              <b>{state.outs}</b>
            </div>
            <p>
              3아웃이 되어도 공수교대하지 않습니다.
              <br />
              출전 선수 전원 타격 후 교대합니다.
            </p>
          </div>
        </Panel>
        <Panel
          title={state.status === 'finished' ? '경기 기록 완료' : '지금 타석에'}
          eyebrow="AT BAT"
        >
          {state.status === 'finished' ? (
            <Empty>
              최종 판정은 양 팀이 함께 완료한 공격 이닝만 반영합니다. 기록을 내보내거나 다음 경기를
              시작하세요.
            </Empty>
          ) : (
            <>
              <button className="batter-card" onClick={() => onProfile(current)}>
                <span className="jersey">
                  {String(data.players.find((p) => p.id === current)?.number).padStart(2, '0')}
                </span>
                <div>
                  <Badge tone="neutral">
                    {state.appearances + 1}번 타자{' '}
                    {state.appearances === state.lineups[state.side].length - 1
                      ? '· 마지막 타자'
                      : ''}
                  </Badge>
                  <h3>{names(current)}</h3>
                  <span>
                    {teamName(state.side)} <ArrowRight size={14} />
                  </span>
                </div>
              </button>
              {dueRunner(state) ? (
                <div className="callout amber">
                  <b>임시주자를 지정하세요</b>
                  <p>현재 타자의 잔루가 있습니다. 기존 타순은 유지됩니다.</p>
                  <label>
                    임시주자
                    <select value={temp} onChange={(e) => setTemp(e.target.value)}>
                      <option value="">선수 선택</option>
                      {game.rosters[state.side]
                        .filter(
                          (id) =>
                            id !== current && !Object.values(state.bases[state.side]).includes(id),
                        )
                        .map((id) => (
                          <option value={id} key={id}>
                            {names(id)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    지정 감독
                    <input
                      value={manager}
                      onChange={(e) => setManager(e.target.value)}
                      placeholder="감독 이름"
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!temp || !manager.trim()}
                    onClick={() =>
                      onEvent({
                        type: 'TEMP_RUNNER',
                        originalId: current,
                        replacementId: temp,
                        approvedBy: manager,
                      })
                    }
                  >
                    임시주자 지정
                  </button>
                </div>
              ) : state.ball === 'dead' ? (
                <>
                  <div className="record-actions">
                    <button onClick={() => onEvent({ type: 'PITCH', call: 'strike' })}>
                      <CircleDot size={22} />
                      <b>스트라이크</b>
                      <small>{state.strikes === 2 ? '삼진 아웃 처리' : '스윙 · 헛스윙'}</small>
                    </button>
                    <button onClick={() => onEvent({ type: 'PITCH', call: 'foul' })}>
                      <Flag size={22} />
                      <b>파울</b>
                      <small>
                        {state.strikes === 2 ? '세 번째 파울 → 삼진' : '스트라이크 누적'}
                      </small>
                    </button>
                  </div>
                  <button
                    className="primary wide big"
                    onClick={() => onEvent({ type: 'START_PLAY' })}
                  >
                    <Play size={18} />
                    타구 발생 · 플레이 시작
                  </button>
                  <p className="hint">진루와 아웃을 확인한 뒤 심판 타임으로 확정하세요.</p>
                </>
              ) : (
                <PlayForm key={last?.id} state={state} game={game} data={data} onEvent={onEvent} />
              )}
            </>
          )}
          <div className="button-row separated">
            <button
              className="subtle"
              disabled={!last}
              onClick={() =>
                last &&
                onEvent({ type: 'RETRACT', targetId: last.id, reason: '기록원의 직전 입력 정정' })
              }
            >
              <RotateCcw size={15} />
              직전 입력 취소
            </button>
            <button
              className="subtle"
              disabled={state.ball === 'live' || state.status === 'finished'}
              onClick={() => setSwap(true)}
            >
              정식 교체
            </button>
            <button
              className="subtle"
              disabled={state.ball === 'live' || state.status === 'finished'}
              onClick={() => setFinish(true)}
            >
              경기 종료
            </button>
          </div>
        </Panel>
      </div>
      <div className="two-col">
        <Panel title="공격 라인업" eyebrow="BATTING ORDER">
          <div className="lineup-list">
            {state.lineups[state.side].map((id, i) => (
              <button
                className={'lineup-player ' + (i === state.appearances ? 'current' : '')}
                key={i}
                onClick={() => onProfile(id)}
              >
                <span>{String(i + 1).padStart(2, '0')}</span>
                <b>{names(id)}</b>
                <small>
                  {i < state.appearances
                    ? '타격 완료'
                    : i === state.appearances
                      ? '현재 타석'
                      : '대기'}
                </small>
                {i === state.appearances && <ArrowRight size={16} />}
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="플레이 타임라인"
          eyebrow="PLAY BY PLAY"
          action={<Badge tone="neutral">{state.plays.length} 타석</Badge>}
        >
          <div className="timeline">
            {state.plays.length === 0 ? (
              <Empty>
                첫 플레이를 기다리고 있어요.
                <br />
                스트라이크 또는 타구 발생을 기록해 보세요.
              </Empty>
            ) : (
              [...state.plays].reverse().map((p) => (
                <div className="timeline-row" key={p.eventId}>
                  <span className="timeline-dot" />
                  <div>
                    <small>
                      {p.inning}회 {p.side === 'away' ? '초' : '말'} · {names(p.batterId)}
                    </small>
                    <b>
                      {resultLabels[p.result]}
                      {p.runs.length > 0 ? ' · ' + p.runs.length + '득점' : ''}
                    </b>
                    {p.cancelledAdvances && (
                      <span className="warning-text">RULE02 적용 · 진루·득점 취소, 잔루 복구</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
      {creating && (
        <NewGame
          data={data}
          onClose={() => setCreating(false)}
          onCreate={(g) => {
            onCreate(g);
            setCreating(false);
          }}
        />
      )}
      {swap && (
        <Substitution
          data={data}
          game={game}
          state={state}
          onClose={() => setSwap(false)}
          onEvent={(p) => {
            onEvent(p);
            setSwap(false);
          }}
        />
      )}
      {finish && (
        <Modal title="경기 조기 종료" onClose={() => setFinish(false)}>
          <p>
            양 팀 완료 {score.completedInnings}이닝의 {score.official.away} : {score.official.home}
            만 승패에 반영합니다. 미완료 이닝의 원본 기록은 보존됩니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onEvent({ type: 'FINISH_GAME', reason: String(f.get('reason')) });
              setFinish(false);
            }}
          >
            <label>
              종료 사유
              <input name="reason" required placeholder="예: 수업 시간 종료" />
            </label>
            <button className="primary wide">경기 종료 확정</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export const resultLabels: Record<string, string> = {
  single: '1루타',
  double: '2루타',
  triple: '3루타',
  'home-run': '홈런',
  out: '아웃',
  error: '실책 출루',
  'sacrifice-fly': '희생플라이 (임시 정책)',
  strikeout: '삼진',
};
function PlayForm({
  state,
  game,
  data,
  onEvent,
}: {
  state: GameState;
  game: Game;
  data: Workspace;
  onEvent: (p: EventPayload) => void;
}) {
  const participants = [...Object.values(state.live!.bases), state.live!.batterId];
  const [result, setResult] = useState<BatResult>('single');
  const [direction, setDirection] = useState<'left' | 'center' | 'right'>('center');
  const [quality, setQuality] = useState<'ground' | 'line' | 'fly'>('ground');
  const [outcomes, setOutcomes] = useState<RunnerOutcome[]>(
    participants.map((id) => ({
      playerId: id,
      to:
        id === state.live!.batterId
          ? 1
          : (Number(Object.entries(state.live!.bases).find(([, v]) => v === id)![0]) as 1 | 2 | 3),
      action: id === state.live!.batterId ? 'advance' : 'hold',
    })),
  );
  const [fielder, setFielder] = useState('');
  const [success, setSuccess] = useState(true);
  const [award, setAward] = useState(false);
  const [awardFrom, setAwardFrom] = useState<Record<string, 0 | 1 | 2 | 3>>({});
  const [skill, setSkill] = useState<'G' | 'F' | 'C' | 'A' | 'L' | 'Q' | 'M' | 'J' | 'B'>('G');
  const [position, setPosition] = useState<
    '1B' | '2B' | 'SS' | '3B' | 'HP' | 'P' | 'LF' | 'CF1' | 'CF2' | 'RF'
  >('1B');
  const patch = (id: string, value: Partial<RunnerOutcome>) =>
    setOutcomes((old) => old.map((o) => (o.playerId === id ? { ...o, ...value } : o)));
  return (
    <div className="play-form">
      <div className="form-row">
        <label>
          타격 결과
          <select
            value={result}
            onChange={(e) => {
              const next = e.target.value as BatResult;
              setResult(next);
              const to =
                next === 'out' || next === 'sacrifice-fly'
                  ? 'out'
                  : next === 'double'
                    ? 2
                    : next === 'triple'
                      ? 3
                      : next === 'home-run'
                        ? 'home'
                        : 1;
              patch(state.live!.batterId, {
                to,
                action: 'advance',
                outReason: next === 'sacrifice-fly' ? 'fly' : 'force',
                outAt: 1,
              });
              if (next === 'sacrifice-fly') setQuality('fly');
            }}
          >
            {Object.entries(resultLabels)
              .filter(([key]) => key !== 'strikeout')
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label>
          타구 방향
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as typeof direction)}
          >
            <option value="left">좌측</option>
            <option value="center">중앙</option>
            <option value="right">우측</option>
          </select>
        </label>
        <label>
          타구 질
          <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="ground">땅볼</option>
            <option value="line">라인드라이브</option>
            <option value="fly">뜬공</option>
          </select>
        </label>
      </div>
      <p className="hint">
        모든 주자의 최종 위치를 직접 확인하세요. 자동 진루는 적용하지 않습니다.
      </p>
      {outcomes.map((o) => (
        <div className="runner-row" key={o.playerId}>
          <b>
            {data.players.find((p) => p.id === o.playerId)?.name}
            {o.playerId === state.live!.batterId ? ' · 타자' : ''}
          </b>
          <div className="form-row">
            <label>
              최종 위치
              <select
                aria-label={o.playerId + ' 최종 위치'}
                value={o.to}
                onChange={(e) =>
                  patch(o.playerId, {
                    to: ['out', 'home'].includes(e.target.value)
                      ? (e.target.value as 'out' | 'home')
                      : (Number(e.target.value) as 1 | 2 | 3),
                    action: 'advance',
                    outReason: 'tag',
                    outAt: 1,
                  })
                }
              >
                {[1, 2, 3].map((b) => (
                  <option value={b} key={b}>
                    {b}루
                  </option>
                ))}
                <option value="home">홈 · 득점</option>
                <option value="out">아웃</option>
              </select>
            </label>
            <label>
              주루 유형
              <select
                value={o.action}
                onChange={(e) => {
                  const action = e.target.value as RunnerOutcome['action'];
                  patch(o.playerId, {
                    action,
                    ...(['lead', 'steal', 'slide'].includes(action)
                      ? { to: 'out', outReason: action as 'lead' | 'steal' | 'slide', outAt: 1 }
                      : {}),
                    intentToAdvance: false,
                  });
                }}
              >
                <option value="advance">진루</option>
                <option value="hold">잔류</option>
                <option value="tag-up">태그업</option>
                <option value="overrun">오버런 · 추가 진루 의사 없음</option>
                <option value="lead">리드 위반</option>
                <option value="steal">도루 위반</option>
                <option value="slide">슬라이딩 위반</option>
              </select>
            </label>
          </div>
          {o.to === 'out' && (
            <div className="form-row">
              <label>
                아웃 종류
                <select
                  value={o.outReason || 'tag'}
                  onChange={(e) =>
                    patch(o.playerId, { outReason: e.target.value as RunnerOutcome['outReason'] })
                  }
                >
                  {['force', 'tag', 'fly', 'lead', 'steal', 'slide'].map((v, i) => (
                    <option key={v} value={v}>
                      {
                        [
                          '포스아웃',
                          '태그아웃',
                          '뜬공 아웃',
                          '리드 위반',
                          '도루 위반',
                          '슬라이딩 위반',
                        ][i]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                아웃 위치
                <select
                  value={o.outAt || 1}
                  onChange={(e) =>
                    patch(o.playerId, {
                      outAt:
                        e.target.value === 'home' ? 'home' : (Number(e.target.value) as 1 | 2 | 3),
                    })
                  }
                >
                  <option value="1">1루</option>
                  <option value="2">2루</option>
                  <option value="3">3루</option>
                  <option value="home">홈</option>
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
      <details>
        <summary>수비 관찰 · 안전진루권</summary>
        <label>
          수비 선수 (선택)
          <select value={fielder} onChange={(e) => setFielder(e.target.value)}>
            <option value="">관찰 없음</option>
            {game.rosters[state.side === 'away' ? 'home' : 'away'].map((id) => (
              <option key={id} value={id}>
                {data.players.find((p) => p.id === id)?.name}
              </option>
            ))}
          </select>
        </label>
        {fielder && (
          <>
            <div className="form-row">
              <label>
                수비 유형
                <select value={skill} onChange={(e) => setSkill(e.target.value as typeof skill)}>
                  {['G', 'F', 'C', 'A', 'L', 'Q', 'M', 'J', 'B'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                포지션
                <select
                  value={position}
                  onChange={(e) => setPosition(e.target.value as typeof position)}
                >
                  {['1B', '2B', 'SS', '3B', 'HP', 'P', 'LF', 'CF1', 'CF2', 'RF'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={success}
                onChange={(e) => setSuccess(e.target.checked)}
              />
              수비 성공
            </label>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={award} onChange={(e) => setAward(e.target.checked)} />
          경기장 밖 악송구 · 안전진루권
        </label>
        {award && (
          <>
            <p className="hint">
              심판이 판정한 악송구 시점의 진루권 대상과 위치를 지정하세요. 최종 결과는 최소 1베이스
              진루해야 합니다.
            </p>
            {participants.map((id) => (
              <label key={id}>
                {data.players.find((p) => p.id === id)?.name}
                <select
                  value={awardFrom[id] ?? ''}
                  onChange={(e) =>
                    setAwardFrom((old) => {
                      const next = { ...old };
                      if (e.target.value === '') delete next[id];
                      else next[id] = Number(e.target.value) as 0 | 1 | 2 | 3;
                      return next;
                    })
                  }
                >
                  <option value="">대상 아님 (이미 득점·아웃 등)</option>
                  {[0, 1, 2, 3].map((n) => (
                    <option value={n} key={n}>
                      {n === 0 ? '타자석' : n + '루'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        )}
      </details>
      <button
        className="primary wide"
        onClick={() =>
          onEvent({
            type: 'END_PLAY',
            endedBy: 'umpire-time',
            result,
            outcomes,
            direction,
            quality,
            fielding: fielder ? [{ playerId: fielder, skill, success, position }] : [],
            ...(award ? { safetyAward: { positionsAtThrow: awardFrom } } : {}),
          })
        }
      >
        심판 타임 · 플레이 확정 <ArrowRight size={16} />
      </button>
    </div>
  );
}
function NewGame({
  data,
  onCreate,
  onClose,
}: {
  data: Workspace;
  onCreate: (g: Game) => void;
  onClose: () => void;
}) {
  const [away, setAway] = useState(data.teams[0].id);
  const [home, setHome] = useState(data.teams[1]?.id || '');
  const [count, setCount] = useState(10);
  const available = (teamId: string) => data.players.filter((p) => p.teamId === teamId && p.active);
  return (
    <Modal title="새 경기 만들기" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onCreate({
            id: crypto.randomUUID(),
            name: String(f.get('name')),
            createdAt: new Date().toISOString(),
            innings: Number(f.get('innings')),
            rulesVersion: RULES_VERSION,
            teamIds: { away, home },
            rosters: {
              away: available(away).map((p) => p.id),
              home: available(home).map((p) => p.id),
            },
            lineups: {
              away: available(away)
                .slice(0, count)
                .map((p) => p.id),
              home: available(home)
                .slice(0, count)
                .map((p) => p.id),
            },
          });
        }}
      >
        <label>
          경기 이름
          <input name="name" defaultValue="티볼 수업 경기" required maxLength={100} />
        </label>
        <div className="form-row">
          {(['away', 'home'] as const).map((side) => (
            <label key={side}>
              {side === 'away' ? '선공 팀' : '후공 팀'}
              <select
                value={side === 'away' ? away : home}
                onChange={(e) =>
                  side === 'away' ? setAway(e.target.value) : setHome(e.target.value)
                }
              >
                {data.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="form-row">
          <label>
            경기 이닝
            <input name="innings" type="number" min="1" max="20" defaultValue="3" required />
          </label>
          <label>
            팀별 출전 인원
            <input
              type="number"
              min="1"
              max={Math.min(available(away).length, available(home).length)}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <div className="callout">
          현재 명단 순서대로 타순을 생성합니다. 모든 출전 선수가 1회 타격한 후 교대하며, TYPE1
          수비는 10명입니다.
        </div>
        <button
          className="primary wide"
          disabled={
            away === home ||
            !home ||
            count < 1 ||
            count > Math.min(available(away).length, available(home).length)
          }
        >
          경기 생성
        </button>
      </form>
    </Modal>
  );
}
function Substitution({
  data,
  game,
  state,
  onEvent,
  onClose,
}: {
  data: Workspace;
  game: Game;
  state: GameState;
  onEvent: (p: EventPayload) => void;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>(state.side);
  const [slot, setSlot] = useState(0);
  const [id, setId] = useState('');
  return (
    <Modal title="정식 선수 교체" onClose={onClose}>
      <p>타순 자리와 해당 주자·수비 자리를 승계합니다. 볼 데드 중 재출전 횟수 제한은 없습니다.</p>
      <label>
        팀
        <select
          value={side}
          onChange={(e) => {
            setSide(e.target.value as Side);
            setId('');
          }}
        >
          <option value="away">선공 팀</option>
          <option value="home">후공 팀</option>
        </select>
      </label>
      <label>
        교체할 타순
        <select value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
          {state.lineups[side].map((id, i) => (
            <option key={i} value={i}>
              {i + 1}번 · {data.players.find((p) => p.id === id)?.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        들어올 선수
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">선수 선택</option>
          {game.rosters[side]
            .filter((id) => !state.lineups[side].includes(id))
            .map((id) => (
              <option key={id} value={id}>
                {data.players.find((p) => p.id === id)?.name}
              </option>
            ))}
        </select>
      </label>
      <button
        className="primary wide"
        disabled={!id}
        onClick={() => onEvent({ type: 'SUBSTITUTE', side, slot, playerId: id })}
      >
        교체 확정
      </button>
    </Modal>
  );
}
