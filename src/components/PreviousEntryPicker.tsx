import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { gameTeamName } from '../domain/roster';
export function PreviousEntryPicker({
  data,
  onImport,
}: {
  data: Workspace;
  onImport: (id: string) => void;
}) {
  const games = data.games
    .filter((g) => !g.archivedAt)
    .slice()
    .sort(
      (a, b) =>
        (b.playedOn ?? b.createdAt.slice(0, 10)).localeCompare(
          a.playedOn ?? a.createdAt.slice(0, 10),
        ) || b.createdAt.localeCompare(a.createdAt),
    );
  const [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  const id = games.some((g) => g.id === selected) ? selected : (games[0]?.id ?? '');
  return (
    <details className="previous-entry-picker">
      <summary>지난 경기 편성 불러오기</summary>
      <label>
        지난 경기
        <select
          aria-label="지난 경기 편성"
          value={id}
          onChange={(e) => {
            setSelected(e.target.value);
            setError('');
          }}
        >
          {!games.length && <option value="">저장된 경기 없음</option>}
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.playedOn ?? '경기일 미설정'} · {g.name} · {gameTeamName(g, data, 'away')} /{' '}
              {gameTeamName(g, data, 'home')}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        선택한 경기의 시작 당시 팀·주장·선발·후보·타순·수비를 새 초안으로 불러옵니다. 현재 초안은
        교체되며 지난 경기 기록·점수는 그대로 유지됩니다. 결석 등 경기 상태와 현재 출전 가능 여부를
        다시 확인하세요.
      </p>
      <button
        type="button"
        disabled={!id}
        onClick={() => {
          try {
            onImport(id);
            setError('');
          } catch (e) {
            setError(e instanceof Error ? e.message : '편성을 불러오지 못했습니다');
          }
        }}
      >
        선택한 경기 편성 불러오기
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
