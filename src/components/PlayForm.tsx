import { gameTeamName } from '../domain/roster';
import { DefenseRecorder } from './DefenseRecorder';
import type { DefenseStep } from '../domain/defense';
import { projectDefenseSequence, validateDefenseSequence } from '../engine/defenseSequence';
import { useState, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import type {
  BatResult,
  EventPayload,
  EndPlayPayload,
  FieldingObservation,
  PlayDetail,
  Direction,
  Distance,
  Strength,
  Quality,
  GameState,
  Game,
  Workspace,
  RunnerOutcome,
} from '../domain/model';
import { BattedBallMap } from './BattedBallMap';
import { PlayDetailsEditor } from './PlayDetailsEditor';
import { suggestOutcomes, confirmationError } from '../engine/recording';
import { resultLabels } from './playLabels';
import {
  HOME_RUN_TRAJECTORIES,
  homeRunQualityKey,
  homeRunQualityLabel,
} from '../statistics/homeRuns';
export function PlayForm({
  state,
  game,
  data,
  onEvent,
  initial,
  initialResult,
  defaultDetailed = false,
  onModeChange,
  onDirtyChange,
}: {
  state: GameState;
  game: Game;
  data: Workspace;
  onEvent: (p: EventPayload) => boolean;
  initial?: EndPlayPayload;
  initialResult?: BatResult;
  defaultDetailed?: boolean;
  onModeChange?: (v: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!initial && !anchor.current?.closest('.match-detail'))
      anchor.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [initial]);
  useEffect(() => {
    onDirtyChange?.(true);
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const participants = [...Object.values(state.live!.bases), state.live!.batterId];
  const [result, setResult] = useState<BatResult>(initial?.result ?? initialResult ?? 'single');
  const [direction, setDirection] = useState<Direction | null>(initial?.direction ?? null);
  const [quality, setQuality] = useState<Quality | null>(initial?.quality ?? null);

  const [outcomes, setOutcomes] = useState<RunnerOutcome[]>(
    initial?.outcomes ?? suggestOutcomes(state, initialResult ?? 'single'),
  );
  const [confirmed, setConfirmed] = useState<string[]>(initial ? participants : []);
  const [time, setTime] = useState(Boolean(initial));
  const [detailed, setDetailedState] = useState(defaultDetailed);
  const setDetailed = (v: boolean) => {
    setDetailedState(v);
    onModeChange?.(v);
  };
  const locked = useRef(false);
  let validation = confirmationError(outcomes, participants, confirmed, time);
  const [distance, setDistance] = useState<Distance | null>(initial?.distance ?? null);
  const [strength, setStrength] = useState<Strength | null>(initial?.strength ?? null);
  const [fielding, setFielding] = useState<FieldingObservation[]>(initial?.fielding ?? []);
  const [details, setDetails] = useState<PlayDetail[]>(initial?.details ?? []);
  const [award, setAward] = useState(Boolean(initial?.safetyAward));
  const [awardFrom, setAwardFrom] = useState<Record<string, 0 | 1 | 2 | 3>>(
    initial?.safetyAward?.positionsAtThrow ?? {},
  );
  const [sequence, setSequence] = useState<DefenseStep[]>(initial?.defenseSequence ?? []);
  const sequenceBase = useRef({
    result: initial?.result ?? initialResult ?? 'single',
    quality: initial?.quality ?? null,
    outcomes: initial?.outcomes ?? suggestOutcomes(state, initialResult ?? 'single'),
  });
  const onSequence = (next: DefenseStep[]) => {
    if (sequence.length === 0)
      sequenceBase.current = { result, quality, outcomes: structuredClone(outcomes) };
    const old = projectDefenseSequence(state, sequence),
      projection = projectDefenseSequence(state, next);
    const remaining = [...fielding];
    for (const o of old.fielding) {
      const i = remaining.findIndex(
        (a) =>
          a.playerId === o.playerId &&
          a.skill === o.skill &&
          a.position === o.position &&
          a.success === o.success,
      );
      if (i >= 0) remaining.splice(i, 1);
    }
    setFielding([...remaining, ...projection.fielding]);
    const ids = new Set(old.details.map((d) => d.id));
    setDetails([...details.filter((d) => !ids.has(d.id)), ...projection.details]);
    const restored = outcomes.map((o) =>
      old.outcomes.some((old) => old.playerId === o.playerId)
        ? (sequenceBase.current.outcomes.find((base) => base.playerId === o.playerId) ?? o)
        : o,
    );
    setOutcomes(
      restored.map((o) => projection.outcomes.find((p) => p.playerId === o.playerId) ?? o),
    );
    setResult(projection.result ?? (old.result ? sequenceBase.current.result : result));
    setQuality(projection.quality ?? (old.quality ? sequenceBase.current.quality : quality));
    setSequence(next);
    setConfirmed([]);
    setTime(false);
  };
  try {
    validateDefenseSequence(state, {
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result,
      outcomes,
      direction,
      quality,
      fielding,
      details,
      defenseSequence: sequence,
    });
  } catch (e) {
    validation = e instanceof Error ? e.message : '수비 연결 확인 필요';
  }
  const generated = projectDefenseSequence(state, sequence);
  const generatedIds = new Set(generated.details.map((d) => d.id));
  const manualFielding = [...fielding];
  for (const o of generated.fielding) {
    const i = manualFielding.findIndex(
      (a) =>
        a.playerId === o.playerId &&
        a.position === o.position &&
        a.skill === o.skill &&
        a.success === o.success,
    );
    if (i >= 0) manualFielding.splice(i, 1);
  }
  const patch = (id: string, value: Partial<RunnerOutcome>) => {
    setOutcomes((old) => old.map((o) => (o.playerId === id ? { ...o, ...value } : o)));
    setConfirmed((ids) => ids.filter((v) => v !== id));
    setTime(false);
  };
  return (
    <div ref={anchor} className={'play-form ' + (detailed ? 'expanded' : '')}>
      <div className="record-mode">
        <button type="button" aria-pressed={!detailed} onClick={() => setDetailed(false)}>
          간편 모드
        </button>
        <button type="button" aria-pressed={detailed} onClick={() => setDetailed(true)}>
          상세 모드
        </button>
      </div>
      <div className="play-flow integrated-play-flow">
        <section className="play-result-step">
          <h3>공격 · {gameTeamName(game, data, state.side)}</h3>
          <div className="quick-results">
            {Object.entries(resultLabels)
              .filter(([key]) => key !== 'strikeout' && key !== 'sacrifice-fly')
              .map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={result === key}
                  onClick={() => {
                    if (key === result) return;
                    setResult(key as BatResult);
                    setOutcomes(suggestOutcomes(state, key as BatResult));
                    setConfirmed([]);
                    setTime(false);
                    setDetails((ds) => ds.filter((d) => d.type !== 'FIELDERS_CHOICE'));
                  }}
                >
                  {label}
                </button>
              ))}
          </div>
          {result === 'fielders-choice' && (
            <label>
              야수선택 대상 주자 · 필수
              <select
                aria-label="야수선택 대상 주자"
                disabled={generated.details.some((d) => d.type === 'FIELDERS_CHOICE')}
                value={details.find((d) => d.type === 'FIELDERS_CHOICE')?.targetRunnerId ?? ''}
                onChange={(e) =>
                  setDetails((ds) => [
                    ...ds.filter((d) => d.type !== 'FIELDERS_CHOICE'),
                    {
                      id: crypto.randomUUID(),
                      type: 'FIELDERS_CHOICE',
                      targetRunnerId: e.target.value,
                    },
                  ])
                }
              >
                <option value="">실제 아웃을 시도한 주자 선택</option>
                {participants
                  .filter((id) => id !== state.live!.batterId)
                  .map((id) => (
                    <option key={id} value={id}>
                      {data.players.find((p) => p.id === id)?.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="details-toggle"
            aria-expanded={detailed}
            onClick={() => setDetailed(!detailed)}
          >
            {detailed ? '상세 기록 접기' : '타구·수비 상세 기록 펼치기'}
          </button>
          <div hidden={!detailed} className="quick-details">
            <label>
              타격 결과 상세
              <select
                aria-label="타격 결과 상세"
                value={result}
                onChange={(e) => {
                  const next = e.target.value as BatResult;
                  setResult(next);
                  setOutcomes(suggestOutcomes(state, next));
                  setConfirmed([]);
                  setTime(false);
                  setDetails((ds) => ds.filter((d) => d.type !== 'FIELDERS_CHOICE'));
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
            {result !== 'home-run' && (
              <label>
                타구 유형
                <select
                  value={quality ?? ''}
                  onChange={(e) => setQuality((e.target.value as Quality) || null)}
                >
                  <option value="">미관찰</option>
                  <option value="ground">땅볼</option>
                  <option value="line">직선타</option>
                  <option value="fly">뜬공</option>
                </select>
              </label>
            )}
            {result === 'home-run' && (
              <fieldset className="home-run-quality">
                <legend>홈런 타구 질</legend>
                <p className="hint">실제 타구의 궤적을 고르고 아래에서 강도를 선택하세요.</p>
                <div className="home-run-options">
                  {(
                    Object.entries(HOME_RUN_TRAJECTORIES) as [
                      Quality,
                      { label: string; description: string },
                    ][]
                  ).map(([key, item]) => (
                    <button
                      type="button"
                      key={key}
                      aria-label={item.label + ' ' + item.description}
                      aria-pressed={quality === key}
                      onClick={() => {
                        setQuality(key);
                      }}
                    >
                      <b>{item.label}</b>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
                <p className="home-run-summary" role="status">
                  {quality
                    ? `홈런 · ${homeRunQualityLabel(homeRunQualityKey(quality, strength))}`
                    : '홈런 타구 질 미관찰 · 선택 기록'}
                </p>
              </fieldset>
            )}
            <BattedBallMap
              direction={direction}
              distance={distance}
              onChange={(dir, dist) => {
                setDirection(dir);
                setDistance(dist);
              }}
            />
            <label>
              타구 강도
              <select
                aria-label="타구 강도"
                value={strength ?? ''}
                onChange={(e) => setStrength((e.target.value as Strength) || null)}
              >
                <option value="">미기록</option>
                <option value="strong">강</option>
                <option value="normal">보통</option>
                <option value="weak">약</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setDirection(null);
                setDistance(null);
                setQuality(null);
                setStrength(null);
              }}
            >
              타구 관찰 초기화
            </button>
            <PlayDetailsEditor
              data={data}
              game={game}
              side={state.side}
              participants={participants}
              details={details}
              onChange={(v) => {
                setDetails(v);
                setTime(false);
              }}
              lockedDetailIds={generatedIds}
              observations={manualFielding}
              onObservations={(v) => {
                setFielding([...v, ...generated.fielding]);
                setTime(false);
              }}
            />
          </div>
          <p className="hint">
            선택 관찰을 생략하면 해당 분석은 미측정입니다. 수비 성공·실패는 자동 생성하지 않습니다.
          </p>
        </section>
        <DefenseRecorder
          teamName={gameTeamName(game, data, state.side === 'away' ? 'home' : 'away')}
          data={data}
          state={state}
          steps={sequence}
          onChange={onSequence}
        />
        <section className="play-runner-step">
          <h3>3 · 주자 결과 확인</h3>
          <p className="hint">
            아래 이동은 미확정 제안입니다. 각 주자의 실제 최종 결과를 확인하세요.
          </p>
          {state.live!.lastBatter && (
            <p className="callout amber">
              마지막 타자: 1루 포스아웃이면 이번 타격의 득점·진루를 취소하고 직전 잔루를 복구합니다.
            </p>
          )}
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
                        outReason: undefined,
                        outAt: undefined,
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
                          ? {
                              to: 'out',
                              outReason: action as 'lead' | 'steal' | 'slide',
                              outAt: undefined,
                            }
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
              {o.action === 'tag-up' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={quality === 'fly'}
                    onChange={(e) => {
                      setQuality(e.target.checked ? 'fly' : null);
                      setConfirmed([]);
                      setTime(false);
                    }}
                  />
                  태그업의 뜬공 상황 확인 · 필수
                </label>
              )}
              {o.to === 'out' && (
                <div className="form-row">
                  <label>
                    아웃 종류
                    <select
                      value={o.outReason ?? ''}
                      onChange={(e) =>
                        patch(o.playerId, {
                          outReason: (e.target.value || undefined) as RunnerOutcome['outReason'],
                        })
                      }
                    >
                      <option value="">판정 선택</option>
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
                      value={o.outAt ?? ''}
                      onChange={(e) =>
                        patch(o.playerId, {
                          outAt: !e.target.value
                            ? undefined
                            : e.target.value === 'home'
                              ? 'home'
                              : (Number(e.target.value) as 1 | 2 | 3),
                        })
                      }
                    >
                      <option value="">위치 선택</option>
                      <option value="1">1루</option>
                      <option value="2">2루</option>
                      <option value="3">3루</option>
                      <option value="home">홈</option>
                    </select>
                  </label>
                </div>
              )}
              <button
                type="button"
                className="runner-confirm"
                aria-label={
                  (data.players.find((p) => p.id === o.playerId)?.name ?? o.playerId) + ' 결과 확인'
                }
                aria-pressed={confirmed.includes(o.playerId)}
                disabled={o.to === 'out' && (!o.outReason || !o.outAt)}
                onClick={() => {
                  setConfirmed((ids) =>
                    ids.includes(o.playerId)
                      ? ids.filter((id) => id !== o.playerId)
                      : [...ids, o.playerId],
                  );
                  setTime(false);
                }}
              >
                {confirmed.includes(o.playerId) ? '✓ 실제 결과 확인됨' : '이 주자 실제 결과 확인'}
              </button>
            </div>
          ))}
          <details>
            <summary>경기장 밖 악송구 · 안전진루권</summary>
            <label className="check">
              <input type="checkbox" checked={award} onChange={(e) => setAward(e.target.checked)} />
              경기장 밖 악송구 · 안전진루권
            </label>
            {award && (
              <>
                <p className="hint">
                  심판이 판정한 악송구 시점의 진루권 대상과 위치를 지정하세요. 최종 결과는 최소
                  1베이스 진루해야 합니다.
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
          <div className="play-confirmation">
            <h3>4 · 심판 타임 후 확정</h3>
            <label className="check umpire-confirm">
              <input type="checkbox" checked={time} onChange={(e) => setTime(e.target.checked)} />
              심판 타임 선언 확인
            </label>
            {validation && (
              <p className="hint" role="status">
                {validation}
              </p>
            )}
            <div className="record-save-bar">
              <button
                className="primary wide"
                disabled={
                  Boolean(validation) ||
                  (result === 'fielders-choice' &&
                    !details.some((d) => d.type === 'FIELDERS_CHOICE' && d.targetRunnerId))
                }
                onClick={() => {
                  if (validation || locked.current) return;
                  locked.current = true;
                  if (
                    !onEvent({
                      type: 'END_PLAY',
                      endedBy: 'umpire-time',
                      result,
                      outcomes,
                      direction,
                      quality,
                      distance,
                      strength,
                      fielding,
                      details,
                      ...(sequence.length ? { defenseSequence: sequence } : {}),
                      ...(award ? { safetyAward: { positionsAtThrow: awardFrom } } : {}),
                    })
                  )
                    locked.current = false;
                }}
              >
                {initial ? '수정 이력 저장 · 전체 경기 재계산' : '심판 타임 · 플레이 확정'}{' '}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
