import { useState } from 'react';
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
import { resultLabels } from './playLabels';
export function PlayForm({
  state,
  game,
  data,
  onEvent,
  initial,
}: {
  state: GameState;
  game: Game;
  data: Workspace;
  onEvent: (p: EventPayload) => boolean;
  initial?: EndPlayPayload;
}) {
  const participants = [...Object.values(state.live!.bases), state.live!.batterId];
  const [result, setResult] = useState<BatResult>(initial?.result ?? 'single');
  const [direction, setDirection] = useState<Direction>(initial?.direction ?? 'center');
  const [quality, setQuality] = useState<Quality>(initial?.quality ?? 'ground');
  const [outcomes, setOutcomes] = useState<RunnerOutcome[]>(
    initial?.outcomes ??
      participants.map((id) => ({
        playerId: id,
        to:
          id === state.live!.batterId
            ? 1
            : (Number(Object.entries(state.live!.bases).find(([, v]) => v === id)![0]) as
                | 1
                | 2
                | 3),
        action: id === state.live!.batterId ? 'advance' : 'hold',
      })),
  );
  const [distance, setDistance] = useState<Distance | null>(initial?.distance ?? null);
  const [strength, setStrength] = useState<Strength | null>(initial?.strength ?? null);
  const [fielding, setFielding] = useState<FieldingObservation[]>(initial?.fielding ?? []);
  const [details, setDetails] = useState<PlayDetail[]>(initial?.details ?? []);
  const [award, setAward] = useState(Boolean(initial?.safetyAward));
  const [awardFrom, setAwardFrom] = useState<Record<string, 0 | 1 | 2 | 3>>(
    initial?.safetyAward?.positionsAtThrow ?? {},
  );
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
          타구 유형
          <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="ground">땅볼</option>
            <option value="line">직선타</option>
            <option value="fly">뜬공</option>
          </select>
        </label>
      </div>
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
      <PlayDetailsEditor
        data={data}
        game={game}
        side={state.side}
        participants={participants}
        details={details}
        onChange={setDetails}
        observations={fielding}
        onObservations={setFielding}
      />
      <details>
        <summary>경기장 밖 악송구 · 안전진루권</summary>
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
        disabled={!initial && (!distance || !strength)}
        onClick={() =>
          onEvent({
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
            ...(award ? { safetyAward: { positionsAtThrow: awardFrom } } : {}),
          })
        }
      >
        {initial ? '수정 이력 저장 · 전체 경기 재계산' : '심판 타임 · 플레이 확정'}{' '}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
