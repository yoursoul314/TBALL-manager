import type { Player, Side } from '../domain/model';
import { gradeLabel } from '../domain/roster';
import {
  randomEntryEligible,
  type EntryCaptains,
  type MatchEntryDrafts,
} from '../domain/randomEntry';
export function EntryCaptainsPicker({
  players,
  entries,
  captains,
  names,
  onChange,
}: {
  players: Player[];
  entries: MatchEntryDrafts;
  captains: EntryCaptains;
  names: Record<Side, string>;
  onChange: (side: Side, id: string) => void;
}) {
  const available = players.filter((p) => randomEntryEligible(p, entries));
  return (
    <section aria-label="경기 주장 선택" className="entry-captains">
      <b>경기 주장 · 선택 사항</b>
      <div className="form-row">
        {(['away', 'home'] as const).map((side) => (
          <label key={side}>
            {side === 'away' ? '선공' : '후공'} · {names[side]} 주장
            <select
              aria-label={(side === 'away' ? '선공' : '후공') + ' 주장'}
              value={captains[side] ?? ''}
              onChange={(e) => onChange(side, e.target.value)}
            >
              <option value="">미지정 · 고정 해제</option>
              {captains[side] && !available.some((p) => p.id === captains[side]) && (
                <option value={captains[side]}>주장 출전 상태 확인 필요 · 다시 선택하세요</option>
              )}
              {available.map((p) => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={captains[side === 'away' ? 'home' : 'away'] === p.id}
                >
                  {p.name} · {p.number}번 · {gradeLabel(p)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <small>
        주장은 해당 팀의 선발이어야 합니다. 자동 구성에서는 팀을 고정하고 점수 비교에도 포함합니다.
        직접 구성에서는 주장·선수·타순·수비를 수정하세요. 경기 저장 시 주장도 함께 보관합니다.
      </small>
      {(['away', 'home'] as const)
        .filter(
          (side) =>
            captains[side] &&
            entries[side].loaded &&
            !entries[side].lineup.includes(captains[side]!),
        )
        .map((side) => (
          <p key={side} className="hint">
            {side === 'away' ? '선공' : '후공'} 주장을 해당 팀 선발로 배정하거나 변경·해제하세요.
          </p>
        ))}
    </section>
  );
}
