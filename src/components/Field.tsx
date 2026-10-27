import { PlayerAvatar } from './PlayerAvatar';
import { POSITIONS, POSITION_LABELS } from '../config/positions';
import type { Bases, Player, Selection } from '../domain/model';
import { type Position } from '../config/positions';
const spots: Record<Position, [number, number]> = {
  '1B': [74, 66],
  '2B': [62, 44],
  SS: [38, 44],
  '3B': [26, 66],
  HP: [50, 90],
  P: [50, 67],
  LF: [19, 31],
  CF1: [40, 21],
  CF2: [60, 21],
  RF: [81, 31],
};
export function Field({
  bases = {},
  players,
  assignments,
  onPlayer,
  showEmpty = false,
  onPosition,
  selectedPosition,
}: {
  bases?: Bases;
  players: Player[];
  assignments?: Selection['assignments'];
  onPlayer?: (id: string) => void;
  showEmpty?: boolean;
  onPosition?: (position: Position) => void;
  selectedPosition?: Position;
}) {
  const playerName = (id?: string) => players.find((p) => p.id === id)?.name || '비어 있음';
  return (
    <div className={'field' + (assignments ? ' has-players' : '')} aria-label="티볼 경기장">
      <svg viewBox="0 0 600 440" aria-hidden="true">
        <defs>
          <pattern
            id="grass"
            width="70"
            height="70"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="35" height="70" fill="#ffffff" opacity=".025" />
          </pattern>
        </defs>
        <path
          d="M300 394 52 146 Q300 -90 548 146Z"
          fill="#285f4e"
          stroke="#7d9b84"
          strokeWidth="1"
        />
        <path d="M300 394 52 146 Q300 -90 548 146Z" fill="url(#grass)" />
        <path d="M300 373 159 233 300 94 441 233Z" fill="#bca57f" opacity=".65" />
        <path d="M300 340 193 233 300 127 407 233Z" fill="#3b7155" />
        <path d="M300 394 52 146M300 394 548 146" stroke="#dfe6cc" strokeWidth="2" opacity=".6" />
        <circle cx="300" cy="275" r="14" fill="#bda786" />
        <path d="M292 382h16v10l-8 8-8-8Z" fill="#f4f1e8" />
        {[
          [441, 233],
          [300, 94],
          [159, 233],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x - 6}
            y={y - 6}
            width="12"
            height="12"
            transform={'rotate(45 ' + x + ' ' + y + ')'}
            fill={bases[(i + 1) as 1 | 2 | 3] ? '#d7ed93' : '#f7f8ed'}
          />
        ))}
      </svg>
      {assignments ? (
        (showEmpty
          ? POSITIONS.map(
              (position) =>
                assignments.find((a) => a.position === position) ?? {
                  position,
                  playerId: '',
                  score: 0,
                },
            )
          : assignments
        ).map((a) => (
          <button
            key={a.position}
            className="field-player"
            style={{ left: spots[a.position][0] + '%', top: spots[a.position][1] + '%' }}
            disabled={!onPosition && !a.playerId}
            aria-pressed={onPosition ? selectedPosition === a.position : undefined}
            aria-label={
              POSITION_LABELS[a.position] + ' ' + (a.playerId ? playerName(a.playerId) : '미배치')
            }
            onClick={() => (onPosition ? onPosition(a.position) : onPlayer?.(a.playerId))}
          >
            <b>{POSITION_LABELS[a.position]}</b>
            {a.playerId && <PlayerAvatar player={players.find((p) => p.id === a.playerId)} />}
            <span>{a.playerId ? playerName(a.playerId) : '미배치'}</span>
          </button>
        ))
      ) : (
        <>
          <span className="field-label" style={{ left: '50%', top: '30%' }}>
            OUTFIELD
          </span>
          {([1, 2, 3] as const).map((base) => (
            <div
              className={'base-label ' + (bases[base] ? 'occupied' : '')}
              key={base}
              style={{
                left: (base === 1 ? 75 : base === 2 ? 50 : 25) + '%',
                top: (base === 2 ? 25 : 59) + '%',
              }}
            >
              <b>{base}루</b>
              <span>{playerName(bases[base])}</span>
            </div>
          ))}
          <div className="home-label">HOME</div>
        </>
      )}
    </div>
  );
}
