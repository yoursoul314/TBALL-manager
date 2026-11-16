import type { Side } from '../domain/model';
import type { MatchEntryDrafts } from '../domain/randomEntry';
export function TeamAssignmentSlots({
  count,
  entries,
  names,
  disabled,
  onAssign,
}: {
  count: number;
  entries: MatchEntryDrafts;
  names: Record<Side, string>;
  disabled: boolean;
  onAssign: (side: Side) => void;
}) {
  if (!count) return null;
  return (
    <section className="entry-team-slots" aria-label="선택 선수 빠른 팀 배정">
      <b>선택 {count}명 · 넣을 팀을 터치하세요</b>
      <div>
        {(['away', 'home'] as const).map((side) => (
          <button
            type="button"
            key={side}
            disabled={disabled}
            aria-label={(side === 'away' ? '선공' : '후공') + ' 팀에 빠른 배정'}
            onClick={() => onAssign(side)}
          >
            <strong>
              {side === 'away' ? '선공' : '후공'} · {names[side]}
            </strong>
            <span>
              선발 {entries[side].lineup.length}/10 · 후보{' '}
              {entries[side].assigned.filter((id) => entries[side].status[id] === 'reserve').length}
            </span>
          </button>
        ))}
      </div>
      <small>
        남은 선발 자리부터 채우고 초과 인원은 후보로 배정합니다. 이미 다른 팀에 편성된 선수는
        이동하며, 수비 위치는 다시 확인하세요.
      </small>
    </section>
  );
}
