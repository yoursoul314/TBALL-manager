import { lastAssessorName } from '../data/assessmentPreferences';
import { AssessmentDateActions } from './AssessmentRecordManager';
import { assessmentDayArchived } from '../domain/assessmentManagement';
import { AssessorPicker, AssessmentProvider } from './AssessorPicker';
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/model';
import {
  blankFungo,
  fungoScores,
  FUNGO_KEYS,
  FUNGO_LABELS,
  type FungoInput,
} from '../domain/fungo';
import { saveFungo, saveFungoDay, currentFungoRecord } from '../assessment/fungo';
import { summarizeBatting } from '../assessment/battingSummary';
import { QUALITY_RUBRIC } from '../config/battingQuality';
import { activePlayers } from '../domain/gameLibrary';
import { localDate } from '../domain/roster';
import { emptyStudentFilter, filterStudents } from '../domain/studentFilter';
import { StudentFilters } from './StudentFilters';
import { useVisibleViewport } from './useVisibleViewport';
import { Panel } from './ui';
const show = (n: number | null) => (n === null ? '미측정' : n.toFixed(1));
function FungoViewContent({
  data,
  onSave,
  onDirtyChange,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const players = activePlayers(data),
    [focused, setFocused] = useState(true),
    [date, setDate] = useState(
      data.fungoDays.filter((d) => !assessmentDayArchived(data, 'fungo', d.date)).at(-1)?.date ??
        localDate(),
    ),
    [index, setIndex] = useState(0),
    [setup, setSetup] = useState(
      !data.fungoDays.some((d) => !assessmentDayArchived(data, 'fungo', d.date)),
    ),
    [assessor, setAssessor] = useState(() => lastAssessorName(data)),
    [newDate, setNewDate] = useState(localDate()),
    [editingDate, setEditingDate] = useState<string | null>(null),
    [ids, setIds] = useState<string[]>([]),
    [filter, setFilter] = useState(emptyStudentFilter),
    [tab, setTab] = useState<'record' | 'compare' | 'history'>('record'),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState('');
  const day = data.fungoDays.find(
      (d) => d.date === date && !assessmentDayArchived(data, 'fungo', d.date),
    ),
    students = (day?.playerIds ?? []).flatMap((id) =>
      players.find((p) => p.id === id) ? [players.find((p) => p.id === id)!] : [],
    ),
    student = students[Math.min(index, Math.max(0, students.length - 1))];
  const row = currentFungoRecord(data, student?.id, date),
    revision = row?.revisions.at(-1);
  const callback = useRef(onDirtyChange);
  callback.current = onDirtyChange;
  useEffect(() => {
    callback.current?.(dirty);
    return () => callback.current?.(false);
  }, [dirty]);
  const navigate = (fn: () => void) => {
    if (dirty) {
      setMessage('저장하지 않은 입력이 있습니다. 저장하거나 입력을 되돌린 뒤 이동하세요.');
      return;
    }
    setMessage('');
    fn();
  };
  const filtered = filterStudents(players, filter);
  return (
    <section className={'fungo-view' + (focused && !setup && student ? ' fungo-focus' : '')}>
      {!setup && student && (
        <div className="fungo-heading">
          <b>펑고 평가 · {date}</b>
          <button onClick={() => navigate(() => setFocused(!focused))}>
            {focused ? '전체 화면 닫기' : '평가 화면 크게'}
          </button>
        </div>
      )}
      <div className="toolbar">
        <label>
          펑고 평가 날짜
          <select
            aria-label="펑고 평가 날짜"
            value={day?.date ?? ''}
            onChange={(e) =>
              navigate(() => {
                setDate(e.target.value);
                setIndex(0);
                setSetup(false);
              })
            }
          >
            <option value="">날짜 선택</option>
            {data.fungoDays
              .filter((d) => !assessmentDayArchived(data, 'fungo', d.date))
              .map((d) => (
                <option key={d.date}>{d.date}</option>
              ))}
          </select>
        </label>
        <button
          onClick={() =>
            navigate(() => {
              setSetup(true);
              setNewDate(localDate());
              setEditingDate(null);
              setAssessor(lastAssessorName(data));
              setIds([]);
            })
          }
        >
          새 펑고 평가 날짜
        </button>
        {day && (
          <button
            onClick={() =>
              navigate(() => {
                setSetup(true);
                setNewDate(day.date);
                setEditingDate(day.date);
                setAssessor(day.assessor);
                setIds(day.playerIds);
              })
            }
          >
            평가 학생 변경
          </button>
        )}
        <AssessmentDateActions
          data={data}
          kind="fungo"
          date={date}
          disabled={dirty}
          onSave={onSave}
          onRemoved={() => {
            setDate('');
            setSetup(true);
            setEditingDate(null);
            setIds([]);
            setFocused(false);
          }}
        />
      </div>
      {message && <p role="alert">{message}</p>}
      {setup ? (
        <Panel title="날짜를 만들고 함께 평가할 학생 선택">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                onSave(
                  saveFungoDay(
                    data,
                    { date: newDate, assessor, playerIds: ids },
                    {
                      id: crypto.randomUUID(),
                      at: new Date().toISOString(),
                      actor: assessor,
                      reason: editingDate ? '평가 학생 변경' : '같은 날짜 새 평가 생성',
                    },
                    editingDate !== null,
                  ),
                );
                setDate(newDate);
                setIndex(0);
                setSetup(false);
                setFocused(true);
                setMessage('날짜와 학생을 저장했습니다.');
              } catch (err) {
                setMessage(err instanceof Error ? err.message : '저장 실패');
              }
            }}
          >
            {!editingDate && (
              <p className="hint">
                삭제한 날짜도 새로 만들 수 있습니다. 이전 삭제 기록은 복원되지 않습니다.
              </p>
            )}
            <div className="form-row">
              <label>
                새 펑고 날짜
                <input
                  required
                  aria-label="새 펑고 날짜"
                  type="date"
                  value={newDate}
                  readOnly={editingDate !== null}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </label>
              <AssessorPicker
                label="펑고 평가자"
                value={assessor}
                onChange={setAssessor}
                remember
              />
            </div>
            <StudentFilters
              players={players}
              value={filter}
              onChange={setFilter}
              prefix="펑고 학생"
            />
            <button
              type="button"
              onClick={() => setIds([...new Set([...ids, ...filtered.map((p) => p.id)])])}
            >
              검색 결과 전체 선택
            </button>
            <button type="button" onClick={() => setIds([])}>
              선택 해제
            </button>
            <div className="fungo-students">
              {filtered.map((p) => (
                <label className="check" key={p.id}>
                  <input
                    type="checkbox"
                    checked={ids.includes(p.id)}
                    onChange={(e) =>
                      setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                    }
                  />
                  {p.name} · {p.number}번
                </label>
              ))}
            </div>
            <button className="primary">펑고 날짜 · 학생 저장 ({ids.length}명)</button>
            {day && (
              <button type="button" onClick={() => setSetup(false)}>
                닫기
              </button>
            )}
          </form>
        </Panel>
      ) : day && student ? (
        <>
          <div className="toolbar">
            <label>
              펑고 평가 학생
              <select
                aria-label="펑고 평가 학생"
                value={student.id}
                onChange={(e) =>
                  navigate(() => setIndex(students.findIndex((p) => p.id === e.target.value)))
                }
              >
                {students.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.number}번
                  </option>
                ))}
              </select>
            </label>
            <span>
              {index + 1}/{students.length}명 · {date}
            </span>
            <button disabled={index === 0} onClick={() => navigate(() => setIndex((i) => i - 1))}>
              이전 학생
            </button>
            <button
              disabled={index >= students.length - 1}
              onClick={() => navigate(() => setIndex((i) => i + 1))}
            >
              다음 학생
            </button>
          </div>
          <div className="tabs">
            {(['record', 'compare', 'history'] as const).map((t, i) => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                onClick={() => navigate(() => setTab(t))}
              >
                {['5구 기록', '학생 점수 비교', '수정 이력'][i]}
              </button>
            ))}
          </div>
          {tab === 'record' ? (
            <FungoEditor
              key={student.id + date + (revision?.id ?? 'new')}
              initial={revision ?? blankFungo(date, day.assessor)}
              old={!!revision}
              cancelled={revision?.status === 'cancelled'}
              hasNext={index < students.length - 1}
              onDirty={setDirty}
              onSave={(input, reason, cancel, next) => {
                setMessage('');
                const saved = saveFungo(
                  data,
                  student.id,
                  input,
                  {
                    id: crypto.randomUUID(),
                    revisionId: crypto.randomUUID(),
                    at: new Date().toISOString(),
                    reason: reason || '최초 펑고 평가',
                  },
                  cancel,
                );
                onSave(saved);
                setDirty(false);
                setMessage(
                  cancel ? '기록을 취소했습니다. 원본과 수정 이력은 보존됩니다.' : '저장했습니다.',
                );
                if (next && index < students.length - 1) setIndex((i) => i + 1);
              }}
            />
          ) : tab === 'compare' ? (
            <div className="table-wrap">
              <table>
                <caption>{date} · 모든 점수 10점 만점 · B는 새 6단계 타격의 전체 누적값</caption>
                <thead>
                  <tr>
                    <th>학생</th>
                    {FUNGO_KEYS.map((k) => (
                      <th key={k}>
                        {k}
                        <small>{FUNGO_LABELS[k]}</small>
                      </th>
                    ))}
                    <th>타격 B</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((p) => {
                    const v = currentFungoRecord(data, p.id, date)?.revisions.at(-1),
                      s = v && v.status === 'active' ? fungoScores(v) : null;
                    return (
                      <tr key={p.id}>
                        <th>{p.name}</th>
                        {FUNGO_KEYS.map((k) => (
                          <td key={k}>{show(s?.[k] ?? null)}</td>
                        ))}
                        <td>
                          {show(summarizeBatting(data, p.id, { rubric: QUALITY_RUBRIC }).batting10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Panel title="원본·정정 이력">
              {row?.revisions.map((r, i) => (
                <details key={r.id}>
                  <summary>
                    {i + 1}차 · {r.status === 'cancelled' ? '취소' : '저장'} · {r.by} ·{' '}
                    {new Date(r.at).toLocaleString('ko-KR')}
                  </summary>
                  <p>{r.reason}</p>
                  <p>{FUNGO_KEYS.map((k) => k + ' ' + show(fungoScores(r)[k])).join(' / ')}</p>
                  <pre>{JSON.stringify(r, null, 2)}</pre>
                </details>
              )) ?? <p>아직 기록이 없습니다.</p>}
            </Panel>
          )}
        </>
      ) : (
        <p>선택한 날짜에 평가할 등록 학생이 없습니다. 평가 학생을 선택하세요.</p>
      )}
    </section>
  );
}
function FungoEditor({
  initial,
  old,
  cancelled,
  hasNext,
  onDirty,
  onSave,
}: {
  initial: FungoInput;
  old: boolean;
  cancelled?: boolean;
  hasNext: boolean;
  onDirty: (v: boolean) => void;
  onSave: (i: FungoInput, r: string, c: boolean, n: boolean) => void;
}) {
  const [draft, setDraft] = useState<FungoInput>(() => structuredClone(initial)),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [page, setPage] = useState<'scores' | 'notes'>('scores'),
    locked = useRef(false),
    root = useVisibleViewport<HTMLDivElement>(true);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || !!reason;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const scores = fungoScores(draft);
  const patch = (v: Partial<FungoInput>) => setDraft((d) => ({ ...d, ...v }));
  const save = (cancel: boolean, next: boolean) => {
    if (locked.current) return;
    locked.current = true;
    try {
      if (old && !reason.trim()) throw Error('메모·정정에서 수정·취소 사유를 입력하세요');
      onSave(draft, reason, cancel, next);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      locked.current = false;
    }
  };
  const mark = (i: number, field: 'catch' | 'throw' | 'power', value: number | null) =>
    patch({ balls: draft.balls.map((b, n) => (n === i ? { ...b, [field]: value } : b)) });
  return (
    <div ref={root} className="fungo-editor">
      <div className="fungo-content" data-keyboard-scroll>
        <div className="toolbar">
          <div className="tabs">
            {(['quick', 'precise'] as const).map((mode, i) => (
              <button
                key={mode}
                aria-pressed={draft.mode === mode}
                className={draft.mode === mode ? 'active' : ''}
                onClick={() =>
                  patch({
                    mode,
                    ...(mode === 'precise' && Object.values(draft.manual).every((v) => v === null)
                      ? { manual: fungoScores({ ...draft, mode: 'quick' }) }
                      : {}),
                  })
                }
              >
                {i ? '정밀 모드' : '간편 모드 · 5구'}
              </button>
            ))}
          </div>
          <button onClick={() => setPage(page === 'scores' ? 'notes' : 'scores')}>
            {page === 'scores' ? '메모·정정' : '점수 입력으로'}
          </button>
          <span>{cancelled ? '취소된 기록' : old ? '저장된 기록 수정' : '신규 기록'}</span>
        </div>
        {page === 'notes' ? (
          <div className="form-row">
            <AssessorPicker
              label="평가자"
              value={draft.assessor}
              onChange={(assessor) => patch({ assessor })}
            />
            <label>
              펑고 메모
              <textarea
                aria-label="펑고 메모"
                maxLength={2000}
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
              />
            </label>
            {old && (
              <label>
                수정·취소 사유
                <input
                  aria-label="수정·취소 사유"
                  required
                  value={reason}
                  maxLength={2000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
          </div>
        ) : (
          <>
            <p className="hint">
              C = 1루 스쿱(기존 9능력의 송구 포구 C와 별개). 미관찰은 비워두세요. 강도·공 빼기
              T_pow는 별도 0~10점 관찰값이며 송구 정확도에서 추정하지 않습니다.
            </p>
            {draft.mode === 'quick' ? (
              <>
                <div className="fungo-legend">
                  포구: 완벽 3 · 블로킹 2 · 터치 1 · 실패 0 / 송구: 정확·신속 3 · 원바운드 2 · 이탈
                  후 포구 1 · 악송구 0
                </div>
                <div className="fungo-balls">
                  {draft.balls.map((b, i) => (
                    <div className="fungo-ball" key={i}>
                      <label>
                        {i + 1}구
                        <select
                          aria-label={i + 1 + '구 상황'}
                          value={b.kind}
                          onChange={(e) =>
                            patch({
                              balls: draft.balls.map((r, n) =>
                                n === i
                                  ? { ...r, kind: e.target.value as typeof b.kind, catch: null }
                                  : r,
                              ),
                            })
                          }
                        >
                          {(['G', 'F', 'C'] as const).map((k) => (
                            <option key={k} value={k}>
                              {k} {FUNGO_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {(['catch', 'throw'] as const).map((field, f) => (
                        <div
                          role="group"
                          aria-label={i + 1 + '구 ' + (f ? '송구' : '포구')}
                          key={field}
                        >
                          <small>{f ? '송구' : '포구'}</small>
                          <div className="fungo-marks">
                            {[3, 2, 1, 0].map((n) => (
                              <button
                                key={n}
                                aria-pressed={b[field] === n}
                                className={b[field] === n ? 'selected' : ''}
                                onClick={() => mark(i, field, b[field] === n ? null : n)}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <label>
                        T_pow · 강도·공 빼기
                        <input
                          aria-label={i + 1 + '구 송구 강도·공 빼기'}
                          type="number"
                          min={0}
                          max={10}
                          step="any"
                          placeholder="미관찰"
                          value={b.power ?? ''}
                          onChange={(e) =>
                            mark(i, 'power', e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="fungo-precise">
                {FUNGO_KEYS.map((k) => (
                  <label key={k}>
                    {k} · {FUNGO_LABELS[k]}
                    <input
                      aria-label={'정밀 ' + k}
                      type="number"
                      min={0}
                      max={10}
                      step="any"
                      placeholder="미측정"
                      value={draft.manual[k] ?? ''}
                      onChange={(e) =>
                        patch({
                          manual: {
                            ...draft.manual,
                            [k]: e.target.value === '' ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="fungo-summary">
              {FUNGO_KEYS.map((k) => (
                <div key={k}>
                  <small>
                    {k} · {FUNGO_LABELS[k]}
                  </small>
                  <strong>
                    {show(scores[k])}
                    <small>/10</small>
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {old && !reason && (
          <p className="hint">
            수정·취소 저장은 메모·정정에서 사유를 입력하세요. 이전 5구 원본을 함께 보존합니다.
          </p>
        )}
      </div>
      <div className="fungo-save-bar">
        <button
          onClick={() => {
            setDraft(structuredClone(initial));
            setReason('');
            setError('');
          }}
        >
          입력 되돌리기
        </button>
        {old && !cancelled && <button onClick={() => save(true, false)}>기록 취소</button>}
        <button onClick={() => save(false, false)}>
          {cancelled ? '기록 복원 저장' : '펑고 기록 저장'}
        </button>
        <button className="primary" disabled={!hasNext} onClick={() => save(false, true)}>
          저장 · 다음 학생
        </button>
      </div>
    </div>
  );
}

export function FungoView(props: Parameters<typeof FungoViewContent>[0]) {
  return (
    <AssessmentProvider data={props.data} onSave={props.onSave}>
      <FungoViewContent {...props} />
    </AssessmentProvider>
  );
}
