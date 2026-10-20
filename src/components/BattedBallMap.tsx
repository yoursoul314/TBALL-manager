import type { Direction, Distance } from '../domain/model';
import { DIRECTIONS, DIRECTION_LABELS, DISTANCE_LABELS } from '../config/recording';
export function BattedBallMap({
  direction,
  distance,
  onChange,
}: {
  direction: Direction | null;
  distance: Distance | null;
  onChange: (direction: Direction, distance: Distance) => void;
}) {
  return (
    <fieldset className="batted-map">
      <legend>타구 방향 · 9구역 필드맵</legend>
      <p className="hint">홈에서 외야를 바라보는 방향입니다. 거리 구간은 현장 관찰로 선택합니다.</p>
      <div className="zone-field">
        {(['far', 'middle', 'near'] as const).map((d) => (
          <div className={'zone-row ' + d} key={d}>
            {DIRECTIONS.map((dir) => (
              <button
                type="button"
                key={dir}
                aria-label={DIRECTION_LABELS[dir] + ' ' + DISTANCE_LABELS[d]}
                aria-pressed={dir === direction && d === distance}
                className={dir === direction && d === distance ? 'selected' : ''}
                onClick={() => onChange(dir, d)}
              >
                <b>{DIRECTION_LABELS[dir]}</b>
                <span>{DISTANCE_LABELS[d]}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="home-plate-label">⌂ 홈</div>
      </div>
      <p className="hint" aria-live="polite">
        {distance && direction
          ? DIRECTION_LABELS[direction] + ' · ' + DISTANCE_LABELS[distance]
          : '거리 미기록 · 구역을 터치하세요'}
      </p>
    </fieldset>
  );
}
