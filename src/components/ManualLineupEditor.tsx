import { useState } from 'react';
import type { Workspace, Selection } from '../domain/model';
import { POSITIONS, POSITION_LABELS, type Position } from '../config/positions';
import {
  placePlayer,
  placementAssignments,
  saveManualLineup,
  type Placement,
} from '../evaluation/manualLineup';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import { StudentFilters } from './StudentFilters';
import { PlayerAvatar } from './PlayerAvatar';
import { Field } from './Field';
import { Panel, fmt } from './ui';
export function ManualLineupEditor({
  data,
  teamId,
  initial,
  initialPosition = '1B',
  onSave,
  onClose,
  onDirtyChange,
}: {
  data: Workspace;
  teamId: string;
  initial?: Selection;
  initialPosition?: Position;
  onSave: (d: Workspace) => void;
  onClose: () => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const [placement, setPlacement] = useState<Placement>(
      Object.fromEntries(initial?.assignments.map((a) => [a.position, a.playerId]) ?? []),
    ),
    [position, setPosition] = useState<Position>(initialPosition),
    [filter, setFilter] = useState(emptyStudentFilter),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState('');
  const players = data.players.filter((p) => p.active && !p.archivedAt),
    shown = filterStudents(players, filter),
    assignments = placementAssignments(data, placement);
  const place = (id: string) => {
    setPlacement(placePlayer(placement, position, id));
    setDirty(true);
    onDirtyChange?.(true);
    setError('');
  };
  const close = () => {
    onDirtyChange?.(false);
    onClose();
  };
  return (
    <Panel
      title="수동 선수 배치"
      className="manual-lineup"
      action={<b>{assignments.length}/10명</b>}
    >
      <p>
        포지션을 누르고 학생을 선택하세요. 이미 배치한 학생을 선택하면 두 자리를 맞바꿉니다. 미측정
        점수도 수동 배치는 가능합니다.
      </p>
      <div className="manual-lineup-grid">
        <div>
          <Field
            assignments={assignments}
            players={data.players}
            showEmpty
            onPosition={setPosition}
            selectedPosition={position}
          />
          <div className="manual-position-buttons">
            {POSITIONS.map((p) => (
              <button key={p} aria-pressed={p === position} onClick={() => setPosition(p)}>
                {POSITION_LABELS[p]}
                <small>
                  {data.players.find((x) => x.id === placement[p])?.name ?? '미배치'} ·{' '}
                  {fmt(assignments.find((a) => a.position === p)?.score, 1)}
                </small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>배치할 자리: {POSITION_LABELS[position]}</h3>
          <StudentFilters
            players={players}
            value={filter}
            onChange={setFilter}
            prefix="수동 배치 학생"
          />
          <button onClick={() => place('')}>현재 자리 비우기</button>
          <div className="manual-player-picker">
            {shown.map((p) => (
              <button
                key={p.id}
                onClick={() => place(p.id)}
                aria-label={p.name + ' ' + POSITION_LABELS[position] + ' 배치'}
                aria-pressed={placement[position] === p.id}
              >
                <PlayerAvatar player={p} />
                <span>
                  {p.name}
                  <small>
                    {POSITIONS.find((pos) => placement[pos] === p.id)
                      ? POSITION_LABELS[POSITIONS.find((pos) => placement[pos] === p.id)!]
                      : '미배치'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="manual-save-bar">
        <button
          className="primary"
          onClick={() => {
            try {
              onSave(
                saveManualLineup(
                  data,
                  teamId,
                  placement,
                  crypto.randomUUID(),
                  new Date().toISOString(),
                  initial?.id,
                ),
              );
              close();
            } catch (e) {
              setError(e instanceof Error ? e.message : '저장 실패');
            }
          }}
        >
          수동 배치안 저장
        </button>
        <button onClick={close}>{dirty ? '수동 변경 취소' : '수동 편집 닫기'}</button>
      </div>
      <p className="hint">
        부분 배치는 초안으로 저장할 수 있습니다. 10명 완성 후 감독 승인이 필요하며, 이전
        추천·승인안은 보존됩니다. —는 적합도 미측정입니다.
      </p>
    </Panel>
  );
}
