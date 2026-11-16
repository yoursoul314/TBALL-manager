import { teamScoreSummary, type BalanceProfile } from '../evaluation/teamBalance';
import type { MatchEntryDrafts } from '../domain/randomEntry';
import type { Side } from '../domain/model';
const display = (n: number | null) => (n === null ? '미측정' : n.toFixed(1));
export function EntryBalanceSummary({
  entries,
  profiles,
  names,
}: {
  entries: MatchEntryDrafts;
  profiles: BalanceProfile[];
  names: Record<Side, string>;
}) {
  return (
    <section className="entry-balance-summary" aria-label="현재 편성 평가 비교">
      <h3>현재 편성 평가 비교 · 참고용</h3>
      {(['starter', 'roster'] as const).map((scope) => {
        const metrics = (['away', 'home'] as const).map((side) =>
          teamScoreSummary(
            scope === 'starter'
              ? entries[side].lineup
              : entries[side].assigned.filter((id) =>
                  ['starter', 'reserve'].includes(entries[side].status[id]),
                ),
            profiles,
          ),
        );
        return (
          <div key={scope}>
            <h4>{scope === 'starter' ? '선발 10명 비교' : '교체 후보 포함 전체 비교'}</h4>
            <div className="entry-balance-teams">
              {(['away', 'home'] as const).map((side, i) => (
                <div key={side}>
                  <b>
                    {side === 'away' ? '선공' : '후공'} · {names[side]}
                  </b>
                  <p>
                    타격 {display(metrics[i].batting.mean)} · 측정 {metrics[i].batting.count}/
                    {metrics[i].size}명
                  </p>
                  <p>
                    수비 {display(metrics[i].defense.mean)} · 측정 {metrics[i].defense.count}/
                    {metrics[i].size}명
                  </p>
                </div>
              ))}
            </div>
            <p className="hint">
              양 팀 차이 ·{' '}
              {(['batting', 'defense'] as const)
                .map((key) => {
                  const a = metrics[0][key].mean,
                    b = metrics[1][key].mean;
                  return `${key === 'batting' ? '타격' : '수비'} ${a === null || b === null ? '비교 불가' : Math.abs(a - b).toFixed(1) + '점'}`;
                })
                .join(' / ')}
            </p>
          </div>
        );
      })}
      <p className="hint">
        100점 기준의 측정된 점수만 비교합니다. 미측정은 평균에서 제외하며, 표본 수·평가 출처·척도가
        다르면 참고용으로 보세요. 편성을 직접 수정하면 위 수치도 다시 계산됩니다.
      </p>
    </section>
  );
}
