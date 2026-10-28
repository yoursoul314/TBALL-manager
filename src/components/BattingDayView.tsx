import { AssessmentPurposePicker } from './AssessmentPurposePicker';
import { AssessmentDateActions } from './AssessmentRecordManager';
import { AssessorPicker, AssessmentProvider } from './AssessorPicker';
import { QUALITY_RUBRIC, LEGACY_RUBRIC, rubricOf, rubricLabel } from '../config/battingQuality';
import type { BattingRubric } from '../domain/batting';
import { useState, useRef } from 'react';
import type { Workspace } from '../domain/model';
import { activePlayers } from '../domain/gameLibrary';
import { localDate, gradeLabel } from '../domain/roster';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import { assessmentDates, createAssessmentDay, startDayAssessments } from '../assessment/days';
import { SESSION_LABELS } from '../config/batting';
import { StudentFilters } from './StudentFilters';
import { PlayerAvatar } from './PlayerAvatar';
import { BattingAssessmentPanel } from './BattingAssessmentPanel';
import { Panel } from './ui';
function BattingDayViewContent({
  data,
  onSave,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const dates = assessmentDates(data),
    players = activePlayers(data);
  const [date, setDate] = useState(dates[0] ?? ''),
    [newDate, setNewDate] = useState(localDate()),
    [creating, setCreating] = useState(!dates.length);
  const [filter, setFilter] = useState(emptyStudentFilter),
    [selected, setSelected] = useState<string[]>([]),
    [selectedId, setSelectedId] = useState('');
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [detailed, setDetailed] = useState(false);
  const [stage, setStage] = useState<'date' | 'students' | 'measure'>('date');
  const saving = useRef(false);
  const day = data.battingDays.find((d) => d.date === date);
  const participants = players.filter((p) =>
    data.battingSessions.some((s) => s.date === date && s.playerId === p.id),
  );
  const playerId = participants.some((p) => p.id === selectedId)
    ? selectedId
    : (participants[0]?.id ?? '');
  const index = participants.findIndex((p) => p.id === playerId);
  const shown = filterStudents(players, filter);
  const eligible = selected.filter((id) => players.some((p) => p.id === id));
  const navigate = (fn: () => void) => {
    if (dirty) {
      setError('저장하지 않은 입력이 있습니다. 기록 저장 또는 입력 되돌리기 후 이동하세요.');
      return;
    }
    setError('');
    fn();
  };
  const save = (fn: () => Workspace, success: () => void) => {
    if (saving.current) return;
    saving.current = true;
    try {
      onSave(fn());
      setError('');
      success();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      saving.current = false;
    }
  };
  const changeDate = (value: string) =>
    navigate(() => {
      setDate(value);
      setSelected([]);
      setSelectedId('');
      setDetailed(false);
    });
  return (
    <div className="assessment-day-workspace">
      <nav className="batting-day-steps" aria-label="타격평가 진행 단계">
        <button
          type="button"
          aria-pressed={stage === 'date'}
          onClick={() => navigate(() => setStage('date'))}
        >
          1 날짜·설정
        </button>
        <button
          type="button"
          aria-pressed={stage === 'students'}
          disabled={!date}
          onClick={() => navigate(() => setStage('students'))}
        >
          2 학생 선택 · {participants.length}명
        </button>
        <button
          type="button"
          aria-pressed={stage === 'measure'}
          disabled={!participants.length}
          onClick={() => navigate(() => setStage('measure'))}
        >
          3 측정 시작
        </button>
      </nav>
      <div hidden={stage !== 'date'}>
        <Panel title="1. 평가 날짜" eyebrow="DATE FIRST">
          <div className="form-row">
            <label>
              평가 날짜 선택
              <select
                aria-label="평가 날짜 선택"
                value={date}
                onChange={(e) => changeDate(e.target.value)}
              >
                {!dates.length && <option value="">생성된 날짜 없음</option>}
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d} ·{' '}
                    {
                      new Set(
                        data.battingSessions.filter((s) => s.date === d).map((s) => s.playerId),
                      ).size
                    }
                    명
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                navigate(() => {
                  setCreating(!creating);
                  setNewDate(localDate());
                })
              }
            >
              새 평가 날짜 만들기
            </button>
          </div>
          <AssessmentDateActions
            data={data}
            kind="batting"
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
                const f = new FormData(e.currentTarget);
                const value = String(f.get('date'));
                save(
                  () =>
                    createAssessmentDay(data, {
                      date: value,
                      targetAttempts: Number(f.get('target')),
                      rubricVersion: String(f.get('rubric')) as BattingRubric,
                      assessor: String(f.get('assessor')),
                      purpose: String(f.get('purpose')),
                      note: String(f.get('note')),
                      createdAt: new Date().toISOString(),
                    }),
                  () => {
                    setDate(value);
                    setStage('students');
                    setCreating(false);
                    setSelected([]);
                    setSelectedId('');
                  },
                );
              }}
            >
              <p className="hint">
                날짜와 공통 설정을 한 번 저장한 뒤 평가 학생을 선택합니다. 기존 학생별 기록과 점수는
                그대로 유지됩니다.
              </p>
              <fieldset disabled={dirty} className="plain-fieldset">
                <div className="form-row">
                  <label>
                    날짜 평가 척도
                    <select aria-label="날짜 평가 척도" name="rubric" defaultValue={QUALITY_RUBRIC}>
                      <option value={QUALITY_RUBRIC}>타구 질 6단계 (−1~5점)</option>
                      <option value={LEGACY_RUBRIC}>이전 수동 (1~10점)</option>
                    </select>
                  </label>
                  <label>
                    평가 날짜
                    <input
                      aria-label="새 평가 날짜"
                      type="date"
                      name="date"
                      required
                      value={creating ? newDate : date}
                      readOnly={!creating}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </label>
                  <label>
                    공통 타격 횟수
                    <input
                      name="target"
                      type="number"
                      min="1"
                      max="200"
                      defaultValue="10"
                      required
                    />
                  </label>
                  <AssessorPicker label="공통 평가자" name="assessor" />
                  <AssessmentPurposePicker label="공통 평가 목적" />
                </div>
                <label>
                  공통 메모
                  <textarea name="note" maxLength={2000} />
                </label>
                <button type="submit" className="primary">
                  {creating ? '평가 날짜 생성' : '이 날짜의 공통 설정 저장'}
                </button>
              </fieldset>
            </form>
          )}
          {day && (
            <p>
              {day.date} · {rubricLabel(rubricOf(day))} · {day.assessor} · {day.purpose} · 학생당{' '}
              {day.targetAttempts}회
            </p>
          )}
          {date && day && (
            <button type="button" className="primary" onClick={() => setStage('students')}>
              학생 선택으로 →
            </button>
          )}
        </Panel>
      </div>
      {date && day && (
        <div hidden={stage !== 'students'}>
          <Panel title="2. 평가 학생 선택">
            <details open={!participants.length}>
              <summary>평가 학생 추가 · 현재 {participants.length}명</summary>
              <StudentFilters
                players={players}
                value={filter}
                onChange={setFilter}
                prefix="평가 학생"
                disabled={dirty}
              />
              <div className="bulk-actions">
                <button
                  type="button"
                  disabled={dirty}
                  onClick={() =>
                    setSelected([...new Set([...eligible, ...shown.map((p) => p.id)])])
                  }
                >
                  표시 학생 전체 선택 · {shown.length}명
                </button>
                <button
                  type="button"
                  disabled={dirty || !eligible.length}
                  onClick={() => setSelected([])}
                >
                  학생 선택 해제
                </button>
                <b>선택 {eligible.length}명</b>
                <button
                  type="button"
                  className="primary"
                  disabled={dirty || !eligible.length}
                  onClick={() =>
                    save(
                      () =>
                        startDayAssessments(data, date, eligible, {
                          id: crypto.randomUUID(),
                          at: new Date().toISOString(),
                          actor: day.assessor,
                          reason: '날짜별 평가 학생 일괄 등록',
                        }),
                      () => {
                        setSelectedId(eligible[0]);
                        setSelected([]);
                        setDetailed(true);
                        setStage('measure');
                      },
                    )
                  }
                >
                  선택 학생 평가 시작
                </button>
              </div>
              <div className="assessment-student-picker">
                {shown.map((p) => (
                  <label className="check student-pick" key={p.id}>
                    <input
                      type="checkbox"
                      aria-label={p.name + ' 평가 대상 선택'}
                      disabled={dirty}
                      checked={eligible.includes(p.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...eligible, p.id]
                            : eligible.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <PlayerAvatar player={p} />
                    <span>
                      <b>
                        {p.name} · {p.number}번
                      </b>
                      <small>
                        {gradeLabel(p)}
                        {p.classroom ? ' · ' + p.classroom + '반' : ''}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint">
                이미 시작한 학생은 기존 세션을 이어갑니다. 필터 밖의 선택도 유지되며, 취소된 세션만
                있는 학생은 새 세션을 만듭니다.
              </p>
            </details>
          </Panel>
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {!!participants.length && (
        <>
          <div hidden={stage !== 'students'}>
            <Panel title="학생별 평가 이어가기">
              <div className="assessment-participants">
                {participants.map((p) => {
                  const sessions = data.battingSessions.filter(
                    (s) => s.playerId === p.id && s.date === date,
                  );
                  const session =
                    sessions.filter((s) => s.status !== 'cancelled').at(-1) ?? sessions.at(-1)!;
                  const count = data.battingAttempts.filter(
                    (a) =>
                      a.sessionId === session.id && (a.status === 'cancelled' || a.score !== null),
                  ).length;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      aria-pressed={playerId === p.id}
                      onClick={() =>
                        navigate(() => {
                          setSelectedId(p.id);
                          setStage('measure');
                        })
                      }
                    >
                      <PlayerAvatar player={p} />
                      <span>
                        <b>{p.name}</b>
                        <small>
                          {count}/{session.targetAttempts}회 · {SESSION_LABELS[session.status]}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>
          <div hidden={stage !== 'measure'}>
            <BattingAssessmentPanel
              key={date + '/' + playerId}
              data={data}
              playerId={playerId}
              onSave={onSave}
              initialDate={date}
              managedDay
              focused={stage === 'measure'}
              onFocusChange={(v) => setStage(v ? 'measure' : 'students')}
              initialDetailed={detailed}
              onDetailModeChange={setDetailed}
              onDateChange={changeDate}
              onDirtyChange={(v) => {
                setDirty(v);
                onDirtyChange?.(v);
                if (!v) setError('');
              }}
              studentNavigation={{
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
              }}
            />
          </div>
        </>
      )}
      {date && !participants.length && (
        <p className="callout">
          날짜의 공통 설정을 저장하고 평가할 학생들을 선택하세요. 점수는 실제 회차 기록을 저장한 뒤
          계산합니다.
        </p>
      )}
    </div>
  );
}

export function BattingDayView(props: Parameters<typeof BattingDayViewContent>[0]) {
  return (
    <AssessmentProvider data={props.data} onSave={props.onSave}>
      <BattingDayViewContent {...props} />
    </AssessmentProvider>
  );
}
