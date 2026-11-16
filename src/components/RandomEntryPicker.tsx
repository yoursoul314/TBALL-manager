import { useState } from 'react';
import type { Workspace } from '../domain/model';
import {
  createRandomEntries,
  randomEntryEligible,
  type MatchEntryDrafts,
} from '../domain/randomEntry';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import { gradeLabel } from '../domain/roster';
import { PlayerAvatar } from './PlayerAvatar';
import { StudentFilters } from './StudentFilters';

export function RandomEntryPicker({
  data,
  entries,
  sameTeam,
  onApply,
}: {
  data: Workspace;
  entries: MatchEntryDrafts;
  sameTeam: boolean;
  onApply: (next: MatchEntryDrafts) => void;
}) {
  const [filter, setFilter] = useState(emptyStudentFilter);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');
  const eligible = data.players.filter((player) => randomEntryEligible(player, entries));
  const visible = filterStudents(eligible, filter);
  const selected = selectedIds.filter((id) => eligible.some((p) => p.id === id));
  const hiddenCount = selected.filter((id) => !visible.some((p) => p.id === id)).length;
  return (
    <section className="random-entry-picker" aria-label="랜덤 구성 대상 선택">
      <p>
        선택한 학생을 양 팀 선발 10명씩 나누고, 나머지는 교체 후보로 고르게 배정합니다. 타순·TYPE1
        수비 위치도 무작위 초안으로 만듭니다.
      </p>
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>참가 학생 선택 · {selected.length}명</summary>
        <StudentFilters players={eligible} value={filter} onChange={setFilter} prefix="랜덤 선수" />
        <div className="button-row">
          <button
            type="button"
            disabled={!visible.length}
            onClick={() => setSelectedIds([...new Set([...selected, ...visible.map((p) => p.id)])])}
          >
            검색 결과 선택 · {visible.length}명
          </button>
          <button type="button" disabled={!selected.length} onClick={() => setSelectedIds([])}>
            랜덤 대상 선택 해제
          </button>
        </div>
        <p className="hint">
          출전 가능 {eligible.length}명 · 선택 {selected.length}명 · 필터 밖 선택 {hiddenCount}명.
          학년·반 필터를 바꿔도 선택은 유지됩니다. 결석·출전 불가는 직접 구성에서 지정하세요.
        </p>
        <div className="random-entry-players">
          {visible.map((player) => (
            <label
              key={player.id}
              className={'random-entry-player ' + (selected.includes(player.id) ? 'selected' : '')}
            >
              <input
                type="checkbox"
                aria-label={player.name + ' 랜덤 대상 선택'}
                checked={selected.includes(player.id)}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? [...selected, player.id]
                      : selected.filter((id) => id !== player.id),
                  )
                }
              />
              <PlayerAvatar player={player} />
              <span>
                <b>
                  {player.name} · {player.number}번
                </b>
                <small>{gradeLabel(player)}</small>
              </span>
            </label>
          ))}
        </div>
        {!visible.length && <p>조건에 맞는 출전 가능 학생이 없습니다.</p>}
      </details>
      <div className="random-entry-apply">
        <b aria-live="polite">
          선택 {selected.length}명 · 선발 {Math.min(selected.length, 20)}명 · 후보{' '}
          {Math.max(0, selected.length - 20)}명
        </b>
        <button
          type="button"
          className="primary"
          disabled={selected.length < 20 || sameTeam}
          onClick={() => {
            try {
              onApply(createRandomEntries(data.players, selected, entries));
              setExpanded(false);
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : '랜덤 구성 실패');
            }
          }}
        >
          랜덤 구성 적용
        </button>
      </div>
      {sameTeam && <p role="alert">서로 다른 선공·후공 팀을 선택하세요.</p>}
      {selected.length < 20 && <p className="hint">양 팀 선발을 위해 20명 이상 선택하세요.</p>}
      <p className="hint">
        적용하면 현재 양 팀의 선발·교체 후보·타순·수비 초안을 교체합니다. 선택하지 않은 기존 출전
        선수는 미출전으로 남고 결석·출전 불가 상태는 유지됩니다. 다시 적용해 재추첨하거나 직접
        구성에서 수정한 뒤 감독 확인을 진행하세요.
      </p>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
    </section>
  );
}
