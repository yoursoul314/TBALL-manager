import { Field } from './Field';
import { useState } from 'react';
import type { EventPayload, GameState, Workspace, Side } from '../domain/model';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import { Modal } from './ui';
export function DefenseEditor({
  data,
  state,
  onEvent,
  onClose,
}: {
  data: Workspace;
  state: GameState;
  onEvent: (p: EventPayload) => boolean;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>(state.side === 'away' ? 'home' : 'away');
  const [assignments, setAssignments] = useState<Partial<Record<Position, string>>>({
    ...state.defense[side],
  });
  return (
    <Modal title="볼 데드 수비 포지션 변경" onClose={onClose}>
      <p>
        RULE08 · 출전 타순은 유지하고 수비 위치만 바꿉니다. 정식 선수 교체와 임시주자 지정은
        별도입니다.
      </p>
      <label>
        수비 배치 팀
        <select
          aria-label="수비 배치 팀"
          value={side}
          onChange={(e) => {
            const next = e.target.value as Side;
            setSide(next);
            setAssignments({ ...state.defense[next] });
          }}
        >
          <option value="away">선공 팀</option>
          <option value="home">후공 팀</option>
        </select>
      </label>
      <Field
        players={data.players}
        showEmpty
        assignments={Object.entries(assignments).map(([position, playerId]) => ({
          position: position as Position,
          playerId,
          score: 0,
        }))}
      />
      <div className="defense-grid">
        {POSITIONS.map((p) => (
          <label key={p}>
            {POSITION_LABELS[p]}
            <select
              aria-label={POSITION_LABELS[p] + ' 배치'}
              value={assignments[p] ?? ''}
              onChange={(e) =>
                setAssignments((old) => {
                  const next = { ...old };
                  if (e.target.value) next[p] = e.target.value;
                  else delete next[p];
                  return next;
                })
              }
            >
              <option value="">미배치</option>
              {state.lineups[side].map((id) => (
                <option key={id} value={id}>
                  {data.players.find((p) => p.id === id)?.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        className="primary wide"
        disabled={state.ball !== 'dead' || state.status === 'finished'}
        onClick={() => {
          if (onEvent({ type: 'DEFENSE', side, assignments })) onClose();
        }}
      >
        수비 배치 저장
      </button>
    </Modal>
  );
}
