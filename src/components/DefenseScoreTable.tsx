import type { Player, Workspace } from '../domain/model';
import { ABILITIES, ABILITY_LABELS } from '../config/positions';
import { summarizeDefenseAssessments } from '../assessment/defenseChecklist';
export function DefenseScoreTable({
  data,
  players,
  date,
}: {
  data: Workspace;
  players: Player[];
  date?: string;
}) {
  return (
    <div className="comparison-table-wrap">
      <table className="defense-comparison-table">
        <caption>{date ? date + ' 수비 관찰' : '누적 수비 관찰'} · 점수 / 유효 횟수</caption>
        <thead>
          <tr>
            <th>학생</th>
            {ABILITIES.map((k) => (
              <th key={k} title={ABILITY_LABELS[k]}>
                {k}
                <small>{ABILITY_LABELS[k]}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const s = summarizeDefenseAssessments(data, p.id, date);
            return (
              <tr key={p.id}>
                <th>
                  {p.name}
                  <small>등번호 {p.number}</small>
                </th>
                {ABILITIES.map((k) => (
                  <td key={k} data-label={k + ' ' + ABILITY_LABELS[k]}>
                    <b>{s.abilities[k].score === null ? '—' : s.abilities[k].score!.toFixed(1)}</b>
                    <small>{s.abilities[k].count}회</small>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        —는 미측정입니다. 기회 없음·미관찰·취소는 제외하며 수동 점수와 섞지 않습니다.
      </p>
    </div>
  );
}
