import { useState } from 'react';
import type { Workspace } from '../domain/model';
import {
  createRandomEntries,
  randomEntryEligible,
  type MatchEntryDrafts,
  type EntryCaptains,
} from '../domain/randomEntry';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import { gradeLabel } from '../domain/roster';
import { PlayerAvatar } from './PlayerAvatar';
import { StudentFilters } from './StudentFilters';
import { applyPositionPreferences } from '../domain/preferenceEntry';
import {
  createBalancedEntries,
  type BalanceDefenseSource,
  type BalanceProfile,
} from '../evaluation/teamBalance';

export function RandomEntryPicker({
  data,
  entries,
  sameTeam,
  onApply,
  profiles,
  defenseSource,
  onDefenseSource,
  captains,
  usePreferences,
  onPreferences,
}: {
  data: Workspace;
  entries: MatchEntryDrafts;
  sameTeam: boolean;
  onApply: (next: MatchEntryDrafts, method: 'random' | 'balanced') => void;
  profiles: BalanceProfile[];
  defenseSource: BalanceDefenseSource;
  onDefenseSource: (value: BalanceDefenseSource) => void;
  captains: EntryCaptains;
  usePreferences: boolean;
  onPreferences: (value: boolean) => void;
}) {
  const [method, setMethod] = useState<'random' | 'balanced'>('random');
  const [filter, setFilter] = useState(emptyStudentFilter);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');
  const available = data.players.filter((player) => randomEntryEligible(player, entries));
  const fixed = Object.values(captains).filter(Boolean);
  const eligible = available.filter((p) => !fixed.includes(p.id));
  const visible = filterStudents(eligible, filter);
  const selected = selectedIds.filter((id) => eligible.some((p) => p.id === id));
  const total = selected.length + fixed.length;
  const hiddenCount = selected.filter((id) => !visible.some((p) => p.id === id)).length;
  return (
    <section className="random-entry-picker" aria-label="랜덤 구성 대상 선택">
      <div className="tabs" aria-label="자동 구성 방식">
        <button
          type="button"
          aria-pressed={method === 'random'}
          onClick={() => {
            setMethod('random');
            setError('');
          }}
        >
          단순 랜덤
        </button>
        <button
          type="button"
          aria-pressed={method === 'balanced'}
          onClick={() => {
            setMethod('balanced');
            setError('');
          }}
        >
          실력 균형
        </button>
      </div>
      <p>
        선택한 학생을 양 팀 선발 10명씩 나누고, 나머지는 교체 후보로 고르게 배정합니다.
        {method === 'balanced'
          ? ' 타격·수비 평균 차이와 측정 인원 차이를 줄이는 참고 초안입니다.'
          : ' 선수는 무작위로 배정합니다.'}
        타순은 무작위 초안이며, 수비 위치는 아래 희망 반영 설정에 따라 배정합니다. 모두 직접 조정할
        수 있습니다.
      </p>
      <label className="check preference-option">
        <input
          type="checkbox"
          checked={usePreferences}
          onChange={(e) => onPreferences(e.target.checked)}
        />
        희망 포지션 반영
      </label>
      <p className="hint">
        {usePreferences
          ? '선발·후보로 뽑힌 학생은 유지하고 1지망 충족 수, 그다음 2지망 충족 수를 최대화합니다. 단순 랜덤은 주장 외 선발의 팀을 조정하고, 균형 구성은 나눠진 팀 안에서 수비 위치만 조정합니다. 희망 배정에는 수비 능력 점수나 가산점을 사용하지 않습니다. 희망이 겹치거나 없으면 남는 자리에 무작위로 배정합니다.'
          : '현재 수비 위치도 무작위로 배정합니다. 희망을 반영하려면 위 항목을 선택하세요.'}
      </p>
      {method === 'balanced' && (
        <div className="balance-options">
          <label>
            수비 균형 기준
            <select
              aria-label="수비 균형 기준"
              value={defenseSource}
              onChange={(e) => onDefenseSource(e.target.value as BalanceDefenseSource)}
            >
              <option value="nine">선택된 수비 9능력 평균</option>
              <option value="fungo">최근 유효 펑고 5항목 평균</option>
            </select>
          </label>
          <p className="hint">
            타격은 규칙 & 설정에서 선택한 기능평가 점수 출처를 따릅니다. 수비는 선택한 기준의 모든
            항목이 측정된 경우에만 사용합니다. 미측정은 0점으로 채우지 않습니다. 타격·수비 차이를
            같은 중요도로 줄이는 편성용 기준이며 최종 선발 배점·포지션 가중치는 바꾸지 않습니다.
          </p>
        </div>
      )}
      <details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          참가 학생 선택 · {selected.length}명{fixed.length ? ` + 주장 ${fixed.length}명` : ''}
        </summary>
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
                {method === 'balanced' && (
                  <small title={profiles.find((p) => p.id === player.id)?.note}>
                    타격 {profiles.find((p) => p.id === player.id)?.batting?.toFixed(1) ?? '미측정'}{' '}
                    · 수비{' '}
                    {profiles.find((p) => p.id === player.id)?.defense?.toFixed(1) ?? '미측정'}
                  </small>
                )}
              </span>
            </label>
          ))}
        </div>
        {!visible.length && <p>조건에 맞는 출전 가능 학생이 없습니다.</p>}
      </details>
      <div className="random-entry-apply">
        <b aria-live="polite">
          선택 {total}명{fixed.length ? ` (주장 ${fixed.length}명 포함)` : ''} · 선발{' '}
          {Math.min(total, 20)}명 · 후보 {Math.max(0, total - 20)}명
        </b>
        <button
          type="button"
          className="primary"
          disabled={total < 20 || sameTeam}
          onClick={() => {
            try {
              const next =
                method === 'balanced'
                  ? createBalancedEntries(
                      data.players,
                      selected,
                      entries,
                      profiles,
                      Math.random,
                      captains,
                    )
                  : createRandomEntries(data.players, selected, entries, Math.random, captains);
              onApply(
                usePreferences
                  ? applyPositionPreferences(data.players, next, captains, method === 'random')
                  : next,
                method,
              );
              setExpanded(false);
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : '랜덤 구성 실패');
            }
          }}
        >
          {method === 'balanced' ? '균형 구성 적용' : '랜덤 구성 적용'}
        </button>
      </div>
      {sameTeam && <p role="alert">서로 다른 선공·후공 팀을 선택하세요.</p>}
      {total < 20 && <p className="hint">양 팀 선발을 위해 주장 포함 20명 이상 선택하세요.</p>}
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
