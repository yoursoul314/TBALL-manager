import { AssessmentPurposePicker } from './AssessmentPurposePicker';
import { AssessmentDateActions } from './AssessmentRecordManager';
import { AssessorPicker, AssessmentProvider } from './AssessorPicker';
import { useState, useRef } from 'react';
import type { Workspace } from '../domain/model';
import { activePlayers } from '../domain/gameLibrary';
import { localDate, gradeLabel } from '../domain/roster';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import {
  applyDefenseDayScores,
  defenseDates,
  defenseParticipants,
  createDefenseDay,
  defenseProgress,
  addDefenseParticipants,
} from '../assessment/defenseDays';
import { summarizeDefenseAssessments } from '../assessment/defenseChecklist';
import { StudentFilters } from './StudentFilters';
import { PlayerAvatar } from './PlayerAvatar';
import { DefenseAssessmentPanel } from './DefenseAssessmentPanel';
import { DefenseScoreTable } from './DefenseScoreTable';
import { Panel } from './ui';
function DefenseDayViewContent({
  data,
  onSave,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const dates = defenseDates(data),
    players = activePlayers(data);
  const [date, setDate] = useState(dates[0] ?? ''),
    [newDate, setNewDate] = useState(localDate()),
    [creating, setCreating] = useState(!dates.length),
    [selected, setSelected] = useState<string[]>([]),
    [selectedId, setSelectedId] = useState(''),
    [filter, setFilter] = useState(emptyStudentFilter),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [focused, setFocused] = useState(false),
    [cumulative, setCumulative] = useState(false);
  const lock = useRef(false),
    day = data.defenseDays.find((d) => d.date === date),
    participants = defenseParticipants(data, date),
    shown = filterStudents(players, filter);
  const playerId = participants.some((p) => p.id === selectedId)
      ? selectedId
      : (participants[0]?.id ?? ''),
    index = participants.findIndex((p) => p.id === playerId);
  const navigate = (fn: () => void) => {
    if (dirty) {
      setError('저장하지 않은 수비 기록이 있습니다. 저장하거나 입력을 되돌리세요.');
      return;
    }
    setError('');
    fn();
  };
  const save = (fn: () => Workspace, done: () => void) => {
    if (lock.current) return;
    lock.current = true;
    try {
      onSave(fn());
      setError('');
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      lock.current = false;
    }
  };
  return (
    <div className="assessment-day-workspace">
      <Panel title="1. 수비 평가 날짜">
        <div className="form-row">
          <label>
            수비 날짜 선택
            <select
              aria-label="수비 날짜 선택"
              value={date}
              onChange={(e) =>
                navigate(() => {
                  setDate(e.target.value);
                  setSelectedId('');
                  setSelected([]);
                  setFocused(false);
                })
              }
            >
              {!dates.length && <option value="">생성된 날짜 없음</option>}
              {dates.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              navigate(() => {
                setCreating(!creating);
                setNewDate(localDate());
              })
            }
          >
            새 수비 날짜 만들기
          </button>
        </div>
        <AssessmentDateActions
          data={data}
          kind="defense"
          date={date}
          disabled={dirty}
          onSave={onSave}
          onRemoved={() => {
            setDate(dates.filter((d) => d !== date)[0] ?? '');
            setCreating(false);
            setSelectedId('');
          }}
        />
        {(creating || (date && !day)) && (
          <form
            key={creating ? 'new' : date}
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty) return;
              const f = new FormData(e.currentTarget),
                value = String(f.get('date'));
              save(
                () =>
                  createDefenseDay(data, {
                    date: value,
                    assessor: String(f.get('assessor')),
                    purpose: String(f.get('purpose')),
                    note: String(f.get('note')),
                    playerIds: [],
                    targetAttempts: Number(f.get('target')),
                    createdAt: new Date().toISOString(),
                  }),
                () => {
                  setDate(value);
                  setCreating(false);
                  setSelectedId('');
                  setSelected([]);
                },
              );
            }}
          >
            <p className="hint">
              삭제한 날짜도 새로 만들 수 있습니다. 이전 삭제 기록은 복원되지 않습니다.
            </p>
            <fieldset className="plain-fieldset" disabled={dirty}>
              <div className="form-row">
                <label>
                  새 수비 평가 날짜
                  <input
                    name="date"
                    type="date"
                    required
                    value={creating ? newDate : date}
                    readOnly={!creating}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </label>
                <label>
                  학생당 수비 횟수
                  <input
                    name="target"
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    defaultValue="10"
                    required
                  />
                </label>
                <AssessorPicker label="수비 공통 평가자" name="assessor" remember />
                <AssessmentPurposePicker label="수비 평가 목적" defaultValue="수비 평가" />
              </div>
              <label>
                수비 공통 메모
                <textarea name="note" maxLength={2000} />
              </label>
              <button className="primary">수비 평가 날짜 생성</button>
            </fieldset>
          </form>
        )}
        {day && (
          <p>
            {day.date} · {day.assessor} · {day.purpose} · 학생당 {day.targetAttempts ?? '미설정'}회
          </p>
        )}
      </Panel>
      {day && (
        <Panel title="2. 수비 평가 학생 선택">
          <details open={!participants.length}>
            <summary>수비 평가 학생 추가 · 현재 {participants.length}명</summary>
            <StudentFilters
              players={players}
              value={filter}
              onChange={setFilter}
              prefix="수비 평가 학생"
              disabled={dirty}
            />
            <div className="bulk-actions">
              <button
                disabled={dirty}
                onClick={() => setSelected([...new Set([...selected, ...shown.map((p) => p.id)])])}
              >
                수비 표시 학생 전체 선택 · {shown.length}명
              </button>
              <button disabled={dirty} onClick={() => setSelected([])}>
                수비 학생 선택 해제
              </button>
              <b>선택 {selected.length}명</b>
              <button
                className="primary"
                disabled={dirty || !selected.length}
                onClick={() =>
                  save(
                    () => addDefenseParticipants(data, date, selected),
                    () => {
                      setSelectedId(selected[0]);
                      setSelected([]);
                      setFocused(true);
                      setMessage('평가 학생을 등록했습니다.');
                    },
                  )
                }
              >
                선택 학생 수비 평가 시작
              </button>
            </div>
            <div className="assessment-student-picker">
              {shown.map((p) => (
                <label className="check student-pick" key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={p.name + ' 수비 평가 대상 선택'}
                    disabled={dirty}
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, p.id]
                          : selected.filter((id) => id !== p.id),
                      )
                    }
                  />
                  <PlayerAvatar player={p} />
                  <span>
                    <b>
                      {p.name} · {p.number}번
                    </b>
                    <small>
                      {gradeLabel(p)} · {p.classroom ?? '반 미설정'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </details>
        </Panel>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!!participants.length && (
        <>
          <Panel title="3. 수비 평가 진행">
            <div className="assessment-participants">
              {participants.map((p) => (
                <button
                  key={p.id}
                  aria-pressed={playerId === p.id}
                  onClick={() => navigate(() => setSelectedId(p.id))}
                >
                  <PlayerAvatar player={p} />
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {summarizeDefenseAssessments(data, p.id, date).count} /{' '}
                      {day?.targetAttempts ?? '미설정'}회
                      {defenseProgress(data, p.id, date).complete ? ' · 완료' : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <DefenseAssessmentPanel
            key={date + '/' + playerId}
            data={data}
            playerId={playerId}
            onSave={onSave}
            managedDay={{ date, assessor: day?.assessor ?? '' }}
            initialFocused={focused}
            onFocusChange={setFocused}
            onDirtyChange={(v) => {
              setDirty(v);
              onDirtyChange?.(v);
              if (!v) setError('');
            }}
            navigation={{
              index: index + 1,
              total: participants.length,
              previous:
                index > 0
                  ? () => navigate(() => setSelectedId(participants[index - 1].id))
                  : undefined,
              next:
                index < participants.length - 1
                  ? () => navigate(() => setSelectedId(participants[index + 1].id))
                  : undefined,
              onSavedNext: () => {
                if (index < participants.length - 1) {
                  setSelectedId(participants[index + 1].id);
                  setMessage('할당된 수비 횟수를 완료해 다음 학생으로 이동했습니다.');
                } else
                  setMessage(
                    '마지막 학생의 할당된 수비 횟수를 완료했습니다. 학생별 진행 현황을 확인하세요.',
                  );
              },
            }}
          />
          <Panel title="학생별 수비 9능력 비교">
            <div className="button-row">
              <button aria-pressed={!cumulative} onClick={() => setCumulative(false)}>
                이 날짜 점수
              </button>
              <button aria-pressed={cumulative} onClick={() => setCumulative(true)}>
                전체 누적 점수
              </button>
            </div>
            <p className="hint">
              이 날짜에 유효 관찰이 있는 학생들의 누적 체크 점수를 수비 기능평가 9항목·포지션
              적합도에 함께 적용합니다. 기존 수동 점수는 보존합니다.
            </p>
            <button
              disabled={dirty || !day}
              onClick={() =>
                save(
                  () =>
                    applyDefenseDayScores(
                      data,
                      date,
                      day!.assessor,
                      new Date().toISOString(),
                      crypto.randomUUID(),
                    ),
                  () =>
                    setMessage('관찰한 학생들의 누적 체크 점수를 수비 기능평가에 적용했습니다.'),
                )
              }
            >
              평가 학생 누적 체크 점수 적용
            </button>
            <DefenseScoreTable
              data={data}
              players={participants}
              date={cumulative ? undefined : date}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

export function DefenseDayView(props: Parameters<typeof DefenseDayViewContent>[0]) {
  return (
    <AssessmentProvider data={props.data} onSave={props.onSave}>
      <DefenseDayViewContent {...props} />
    </AssessmentProvider>
  );
}
