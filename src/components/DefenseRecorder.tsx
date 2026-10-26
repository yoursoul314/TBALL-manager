import { useState } from 'react';
import type { GameState, Workspace } from '../domain/model';
import type { DefenseAction, DefenseStep } from '../domain/defense';
import { DEFENSE_ACTIONS } from '../domain/defense';
import { ERROR_LABELS, type ErrorType } from '../config/recording';
import { POSITION_LABELS, type Position } from '../config/positions';
import {
  DEFENSE_LABELS,
  assistCandidates,
  projectDefenseSequence,
} from '../engine/defenseSequence';
import { Field } from './Field';
import { PlayerAvatar } from './PlayerAvatar';
export function DefenseRecorder({
  data,
  state,
  steps,
  onChange,
}: {
  data: Workspace;
  state: GameState;
  steps: DefenseStep[];
  onChange: (s: DefenseStep[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [action, setAction] = useState<DefenseAction | null>(null),
    [target, setTarget] = useState<DefenseStep['targetBase']>(null),
    [runner, setRunner] = useState(''),
    [skill, setSkill] = useState<'G' | 'F' | null>(null),
    [errorType, setErrorType] = useState<ErrorType | null>(null),
    [assist, setAssist] = useState<string[] | null>(null),
    [message, setMessage] = useState('');
  const side = state.side === 'away' ? 'home' : 'away',
    assignments = state.defense[side],
    position = Object.entries(assignments).find(([, id]) => id === selected)?.[0] as
      | Position
      | undefined;
  const player = data.players.find((p) => p.id === selected),
    participants = [...Object.values(state.live!.bases), state.live!.batterId];
  const names = (id: string) => data.players.find((p) => p.id === id)?.name ?? id;
  const out = action === 'force-out' || action === 'tag-out';
  const candidates = assistCandidates(steps, target, selected ?? '');
  const reset = () => {
    setSelected(null);
    setAction(null);
    setTarget(null);
    setRunner('');
    setSkill(null);
    setErrorType(null);
    setAssist(null);
  };
  const add = (kind: DefenseAction) => {
    if (!selected || !position) return;
    try {
      const next: DefenseStep = {
        id: crypto.randomUUID(),
        playerId: selected,
        position,
        action: kind,
        targetBase: target,
        runnerId: runner || null,
        catchSkill: skill,
        errorType,
        assistIds: out ? (assist ?? candidates) : [],
      };
      projectDefenseSequence(state, [...steps, next]);
      onChange([...steps, next]);
      reset();
      setMessage('수비 행동을 연결했습니다. 주자 실제 결과와 심판 타임을 확인하세요');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '수비 입력 실패');
    }
  };
  return (
    <section className="defense-recorder" aria-label="상대 팀 수비 터치 기록">
      <h3>2 · 상대 수비 · TYPE1</h3>
      {Object.keys(assignments).length < 10 && (
        <p className="callout amber">
          수비 {Object.keys(assignments).length}/10명 배치. 미배치 자리는 추정하지 않습니다. 볼
          데드에서 수비 포지션 변경을 먼저 확인하세요.
        </p>
      )}
      {!selected ? (
        <Field
          players={data.players}
          showEmpty
          assignments={Object.entries(assignments).map(([position, playerId]) => ({
            position: position as Position,
            playerId,
            score: 0,
          }))}
          onPlayer={(id) => {
            reset();
            setSelected(id);
            setMessage('');
          }}
        />
      ) : (
        <div className="quick-defense-menu">
          <div className="defense-menu-heading">
            <PlayerAvatar player={player} />
            <b>
              {player?.name} · {position ? POSITION_LABELS[position] : ''}
            </b>
            <button type="button" onClick={reset}>
              필드로
            </button>
          </div>
          <div className="defense-action-buttons">
            {DEFENSE_ACTIONS.map((a) => (
              <button
                type="button"
                key={a}
                aria-pressed={action === a}
                onClick={() => {
                  setAction(a);
                  setTarget(null);
                  setRunner('');
                  setSkill(null);
                  setErrorType(null);
                  setAssist(null);
                }}
              >
                {DEFENSE_LABELS[a]}
              </button>
            ))}
          </div>
          {action && (
            <div className="defense-action-parameters">
              {(out || action === 'throw' || action === 'fly-catch') && (
                <label>
                  목표·아웃 베이스
                  <select
                    aria-label="수비 행동 목표 베이스"
                    value={target ?? ''}
                    onChange={(e) => {
                      setTarget(
                        !e.target.value
                          ? null
                          : e.target.value === 'home'
                            ? 'home'
                            : (Number(e.target.value) as 1 | 2 | 3),
                      );
                      setAssist(null);
                    }}
                  >
                    <option value="">선택</option>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n}루
                      </option>
                    ))}
                    <option value="home">홈</option>
                  </select>
                </label>
              )}
              {(out || action === 'fly-catch' || action === 'fielders-choice') && (
                <label>
                  연결 주자
                  <select
                    aria-label="수비 행동 대상 주자"
                    value={runner}
                    onChange={(e) => setRunner(e.target.value)}
                  >
                    <option value="">
                      {action === 'fly-catch' ? '포구만 관찰 · 아웃 연결 안 함' : '주자 선택'}
                    </option>
                    {participants
                      .filter((id) => action !== 'fielders-choice' || id !== state.live!.batterId)
                      .map((id) => (
                        <option key={id} value={id}>
                          {names(id)}
                          {id === state.live!.batterId ? ' · 타자' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {action === 'catch-fail' && (
                <label>
                  실패한 포구 관찰
                  <select
                    value={skill ?? ''}
                    onChange={(e) => setSkill((e.target.value || null) as 'G' | 'F' | null)}
                  >
                    <option value="">유형 미관찰</option>
                    <option value="G">땅볼</option>
                    <option value="F">뜬공</option>
                  </select>
                </label>
              )}
              {['catch-fail', 'receive-fail', 'bad-throw'].includes(action) && (
                <label>
                  공식 실책 판정 · 선택
                  <select
                    aria-label="공식 실책 판정"
                    value={errorType ?? ''}
                    onChange={(e) => setErrorType((e.target.value || null) as ErrorType | null)}
                  >
                    <option value="">실책으로 판정하지 않음</option>
                    {Object.entries(ERROR_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {out && candidates.length > 0 && (
                <fieldset>
                  <legend>연결 송구의 보살 제안 · 감독 확인</legend>
                  {candidates.map((id) => (
                    <label key={id} className="check">
                      <input
                        type="checkbox"
                        checked={(assist ?? candidates).includes(id)}
                        onChange={(e) =>
                          setAssist(
                            e.target.checked
                              ? [...(assist ?? candidates), id]
                              : (assist ?? candidates).filter((v) => v !== id),
                          )
                        }
                      />
                      {names(id)}
                    </label>
                  ))}
                </fieldset>
              )}
              <button
                type="button"
                className="primary wide"
                disabled={
                  (out && (!runner || !target)) ||
                  (action === 'throw' && !target) ||
                  (action === 'fielders-choice' && !runner) ||
                  (action === 'fly-catch' && !!runner && !target) ||
                  steps.length >= 30
                }
                onClick={() => add(action)}
              >
                수비 행동 연결
              </button>
            </div>
          )}
        </div>
      )}
      {steps.length > 0 && (
        <div className="defense-sequence">
          <ol>
            {steps.map((s, i) => (
              <li key={s.id}>
                <b>
                  {i + 1}. {names(s.playerId)}
                </b>{' '}
                {DEFENSE_LABELS[s.action]}
                {s.targetBase ? ' → ' + (s.targetBase === 'home' ? '홈' : s.targetBase + '루') : ''}
                {s.runnerId ? ' · ' + names(s.runnerId) : ''}
                {s.errorType ? ' · 실책 ' + ERROR_LABELS[s.errorType] : ''}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              onChange(steps.slice(0, -1));
              setMessage('마지막 수비 행동을 되돌렸습니다. 주자 결과를 다시 확인하세요');
            }}
          >
            마지막 수비 행동 취소
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
      <p className="hint">
        포구·송구 실패가 자동으로 실책이 되지는 않습니다. 실제 입력한 능력만 관찰에 반영합니다.
      </p>
    </section>
  );
}
