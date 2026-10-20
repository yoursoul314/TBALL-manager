import type { Direction, Distance } from '../domain/model';
import { DISTANCE_LABELS } from '../config/recording';
export function DirectionPicker({
  direction,
  distance,
  onChange,
}: {
  direction: Direction | null;
  distance: Distance | null;
  onChange: (d: Direction | null, r: Distance | null) => void;
}) {
  return (
    <fieldset className="direction-picker">
      <legend>타구 방향 · 선택 기록</legend>
      <div className="quick-three">
        {(
          [
            ['left', '좌측'],
            ['center', '중앙'],
            ['right', '우측'],
          ] as const
        ).map(([v, l]) => (
          <button
            type="button"
            key={v}
            aria-pressed={direction === v}
            onClick={() => onChange(direction === v ? null : v, null)}
          >
            {l}
          </button>
        ))}
      </div>
      {direction && (
        <div className="distance-options" aria-label="거리 선택 (선택 사항)">
          {(['near', 'middle', 'far'] as const).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={distance === v}
              onClick={() => onChange(direction, distance === v ? null : v)}
            >
              {DISTANCE_LABELS[v]}
            </button>
          ))}
          <small>거리 생략 가능</small>
        </div>
      )}
    </fieldset>
  );
}
