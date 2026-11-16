import { useState } from 'react';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import type { GameState, Workspace } from '../domain/model';
import type { DefenseStep } from '../domain/defense';
import { QUICK_OUT_LABELS, quickDefenseSteps, type QuickOut } from '../engine/quickPlays';
export function QuickDefense({
  state,
  data,
  steps,
  onChange,
  onOpen,
}: {
  state: GameState;
  data: Workspace;
  steps: DefenseStep[];
  onChange: (v: DefenseStep[]) => void;
  onOpen: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<QuickOut | null>(null);
  const [chosen, setChosen] = useState<Partial<Record<'first' | 'relay' | 'finish', Position>>>({});
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<'first' | 'relay' | 'finish' | null>(null);
  const roles: ('first' | 'relay' | 'finish')[] = [
    'first',
    ...(kind === 'double' ? ['relay' as const] : []),
    ...(kind !== 'fly' ? ['finish' as const] : []),
  ];
  const role = editing ?? roles.find((r) => !chosen[r]);
  const labels = {
    first: '처음 공을 잡은 수비수',
    relay: '2루 아웃 처리 수비수',
    finish: '1루 아웃 처리 수비수',
  };
  const close = () => {
    setKind(null);
    setEditing(null);
    onOpen(false);
  };
  const assignments = state.defense[state.side === 'away' ? 'home' : 'away'];
  return (
    <div className="quick-defense-presets">
      <b>빠른 수비 연결</b>
      <div className="button-row">
        {(Object.keys(QUICK_OUT_LABELS) as QuickOut[]).map((k) => (
          <button
            type="button"
            key={k}
            aria-pressed={kind === k}
            disabled={k === 'double' && !state.live?.bases[1]}
            onClick={() => {
              setKind(k);
              setChosen({});
              setEditing(null);
              setError('');
              onOpen(true);
            }}
          >
            {QUICK_OUT_LABELS[k]} 연결
          </button>
        ))}
      </div>
      {kind && (
        <>
          <p className="hint">
            {kind === 'fly'
              ? '뜬공 포구 성공·타자 아웃·자살을 함께 기록합니다.'
              : '실제 포구·송구·받기·베이스 처리·포스아웃을 확인해 연결합니다. 보살·자살도 함께 기록됩니다.'}{' '}
            주자 실제 결과와 심판 타임은 아래에서 확인하세요.
          </p>
          <div className="quick-defense-path">
            {roles.map((r) => (
              <button type="button" key={r} onClick={() => setEditing(r)} aria-pressed={role === r}>
                {labels[r]}
                <b>{chosen[r] ? POSITION_LABELS[chosen[r]!] : '선택'}</b>
              </button>
            ))}
          </div>
          {role && (
            <fieldset key={role} className="quick-fielder-choice">
              <legend>{labels[role]}</legend>
              <div>
                {POSITIONS.filter((p) => assignments[p]).map((p) => (
                  <button
                    type="button"
                    key={p}
                    aria-pressed={chosen[role] === p}
                    onClick={() => {
                      setChosen((v) => ({ ...v, [role]: p }));
                      setEditing(null);
                    }}
                  >
                    {POSITION_LABELS[p]} ·{' '}
                    {data.players.find((s) => s.id === assignments[p])?.name ?? assignments[p]}
                  </button>
                ))}
              </div>
              {!Object.keys(assignments).length && (
                <p>수비가 미배치입니다. 주자 결과만 먼저 기록하고 수비는 볼 데드에서 배치하세요.</p>
              )}
            </fieldset>
          )}
          <button
            type="button"
            className="primary"
            disabled={
              !chosen.first ||
              (kind !== 'fly' && !chosen.finish) ||
              (kind === 'double' && !chosen.relay)
            }
            onClick={() => {
              try {
                onChange(quickDefenseSteps(state, kind, { ...chosen, first: chosen.first! }));
                close();
              } catch (e) {
                setError(e instanceof Error ? e.message : '수비 연결 실패');
              }
            }}
          >
            {steps.length ? '기존 연결을 이 수비로 바꾸기' : '이 수비 연결 적용'}
          </button>
          <button type="button" onClick={close}>
            빠른 연결 닫기
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
