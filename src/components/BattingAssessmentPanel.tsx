import { useState, useRef, useEffect } from 'react';
import type { Workspace, Direction, Distance } from '../domain/model';
import type {
  BattingAssessmentAttempt as Attempt,
  BattingAssessmentSession as Session,
} from '../domain/batting';
import {
  createBattingSession,
  reviseBattingSession,
  recordBattingAttempt,
  reviseBattingAttempt,
  blankAttempt,
  type AttemptInput,
  type ChangeMeta,
} from '../assessment/batting';
import { summarizeBatting } from '../assessment/battingSummary';
import {
  RESULT_LABELS,
  CONTACT_LABELS,
  TRAJECTORY_LABELS,
  SESSION_LABELS,
  zoneLabel,
} from '../config/batting';
import { STRENGTH_LABELS, DIRECTION_LABELS } from '../config/recording';
import { DirectionPicker } from './DirectionPicker';
import { BattedBallMap } from './BattedBallMap';
import { BattingAssessmentReport, battingNumber } from './BattingAssessmentReport';
import { Panel } from './ui';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const changeMeta = (actor: string, reason: string): ChangeMeta => ({
  id: crypto.randomUUID(),
  at: new Date().toISOString(),
  actor,
  reason,
});
export function BattingAssessmentPanel({
  data,
  playerId,
  onSave,
  onDirtyChange,
}: {
  data: Workspace;
  playerId: string;
  onSave: (d: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
}) {
  const [date, setDate] = useState(today()),
    [sessionId, setSessionId] = useState(''),
    [round, setRound] = useState(1),
    [error, setError] = useState(''),
    [dirty, setDirtyState] = useState(false);
  const [lastSaved, setLastSaved] = useState('');
  const inputAnchor = useRef<HTMLDivElement>(null);
  const [detailMode, setDetailMode] = useState(false);
  const [feedback, setFeedback] = useState('');
  const setDirty = (v: boolean) => {
    setDirtyState(v);
    onDirtyChange?.(v);
  };
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const sessions = data.battingSessions.filter((s) => s.playerId === playerId && s.date === date);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions.at(-1);
  useEffect(() => {
    inputAnchor.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [session?.id]);
  const attempt = session
    ? data.battingAttempts.find((a) => a.sessionId === session.id && a.attemptNumber === round)
    : undefined;
  const daily = summarizeBatting(data, playerId, { from: date, to: date });
  const cumulative = summarizeBatting(data, playerId);
  const execute = (fn: () => Workspace) => {
    try {
      const next = fn();
      onSave(next);
      setError('');
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
      return null;
    }
  };
  const current = data.players.find((p) => p.id === playerId)!;
  const zone = data.battingSettings.zoneDefinitions.find(
    (z) => z.version === session?.zoneDefinitionVersion,
  );
  const records = data.battingAttempts.filter((a) => a.sessionId === session?.id);
  const dates = [
    ...new Set(data.battingSessions.filter((s) => s.playerId === playerId).map((s) => s.date)),
  ]
    .sort()
    .reverse();
  return (
    <div className={'batting-workspace' + (detailMode ? ' assessment-detailed' : '')}>
      <div className="assessment-summary" aria-label="현재 평가 요약">
        <b>
          {current.name} · {current.number}번
        </b>
        <span>
          {date} · {session ? round + ' / ' + session.targetAttempts + '회차' : '세션을 생성하세요'}
        </span>
        <span>
          오늘 평균 <strong>{battingNumber(daily.average)}</strong> / 10
        </span>
        <span>
          누적 <strong>{battingNumber(summarizeBatting(data, playerId).score)}</strong> / 100
        </span>
        {session && (
          <>
            <progress
              aria-label="평가 진행률"
              value={records.filter((a) => a.status === 'cancelled' || a.score !== null).length}
              max={session.targetAttempts}
            />
            <span>
              {records.filter((a) => a.status === 'cancelled' || a.score !== null).length}/
              {session.targetAttempts}회 기록 · {SESSION_LABELS[session.status]}
            </span>
          </>
        )}
      </div>
      <Panel title="날짜별 평가 세션">
        <div className="form-row">
          <label>
            평가 날짜
            <input
              type="date"
              required
              value={date}
              disabled={dirty}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setSessionId('');
                  setRound(1);
                }
              }}
            />
          </label>
          <label>
            기록된 날짜
            <select
              aria-label="기록된 날짜"
              value={dates.includes(date) ? date : ''}
              disabled={dirty}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(e.target.value);
                  setSessionId('');
                  setRound(1);
                }
              }}
            >
              <option value="">날짜 선택</option>
              {dates.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            평가 세션
            <select
              value={session?.id ?? ''}
              disabled={dirty}
              onChange={(e) => {
                setSessionId(e.target.value);
                setRound(1);
              }}
            >
              {!sessions.length && <option value="">세션 없음</option>}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sessionNumber}차 · {s.purpose} · {SESSION_LABELS[s.status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          날짜별 평균 <b>{battingNumber(daily.average)}</b> / 10 · 유효 {daily.count}회{' '}
          {daily.provisional ? '· 잠정 평균' : ''}
        </p>
        <details open={!session}>
          <summary>같은 날짜에 새 평가 세션 만들기</summary>
          <form
            className="batting-session-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                actor = String(f.get('assessor'));
              const next = execute(() =>
                createBattingSession(
                  data,
                  {
                    playerId,
                    date,
                    targetAttempts: Number(f.get('target')),
                    assessor: actor,
                    purpose: String(f.get('purpose')),
                    note: String(f.get('note')),
                  },
                  changeMeta(actor, '신규 평가 세션'),
                ),
              );
              if (next) {
                setSessionId(next.battingSessions.at(-1)!.id);
                setRound(1);
              }
            }}
          >
            <fieldset disabled={dirty}>
              <div className="form-row">
                <label>
                  타격 횟수
                  <input name="target" type="number" min="1" max="200" defaultValue="10" required />
                </label>
                <label>
                  세션 평가자
                  <input name="assessor" maxLength={200} required placeholder="평가자 별칭" />
                </label>
                <label>
                  평가 목적
                  <input name="purpose" maxLength={200} required placeholder="예: 타구 방향 연습" />
                </label>
              </div>
              <label>
                세션 메모
                <textarea name="note" maxLength={2000} />
              </label>
              <button className="primary" type="submit">
                평가 세션 생성
              </button>
            </fieldset>
          </form>
        </details>
        {session && (
          <>
            <details>
              <summary>세션 진행·구역 기준 확인</summary>
              <p className="callout">
                {session.sessionNumber}차 · {SESSION_LABELS[session.status]} · 기록 {records.length}
                /{session.targetAttempts}회<br />
                구역 정의 {zone?.version}: 근거리 {zone?.near} / 중거리 {zone?.middle} / 원거리{' '}
                {zone?.far}
              </p>
            </details>
            <details>
              <summary>세션 정보·날짜·상태 수정</summary>
              <SessionEditor
                key={session.id + session.updatedAt}
                session={session}
                disabled={dirty}
                onUpdate={(patch, actor, reason) =>
                  execute(() =>
                    reviseBattingSession(data, session.id, patch, changeMeta(actor, reason)),
                  ) !== null
                }
                onDateChange={(next) => {
                  setDate(next);
                  setRound(1);
                }}
              />
            </details>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </Panel>
      {session && (
        <div ref={inputAnchor} className="record-input-anchor">
          {detailMode && error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {detailMode && (
            <header className="assessment-fullscreen-heading">
              <div>
                <b>
                  {current.name} · {current.number}번
                </b>
                <span>
                  {date} · {session.sessionNumber}차 · {round}/{session.targetAttempts}회차 · 오늘
                  평균 {battingNumber(daily.average)} · 누적{' '}
                  {cumulative.score === null
                    ? '평가 기록 없음'
                    : battingNumber(cumulative.score) + '점'}
                </span>
              </div>
              <button type="button" onClick={() => setDetailMode(false)}>
                전체 화면 닫기
              </button>
            </header>
          )}
          <Panel
            title={`${round}회차 기록`}
            eyebrow={`${SESSION_LABELS[session.status]} · ${session.targetAttempts}회 중`}
          >
            <div className="attempt-workbench">
              <div className="attempt-editor-pane">
                <AttemptEditor
                  key={`${session.id}/${round}/${attempt?.updatedAt ?? ''}/${attempt?.status ?? ''}`}
                  defaultDetailed={detailMode}
                  onModeChange={setDetailMode}
                  attempt={attempt}
                  session={session}
                  onDirty={setDirty}
                  onCommit={(input, actor, reason) => {
                    const next = execute(() =>
                      attempt
                        ? reviseBattingAttempt(data, attempt.id, input, changeMeta(actor, reason))
                        : recordBattingAttempt(
                            data,
                            session.id,
                            round,
                            input,
                            changeMeta(actor, reason),
                          ),
                    );
                    if (next) {
                      setDirty(false);
                      setLastSaved(
                        next.battingAttempts.find(
                          (a) => a.sessionId === session.id && a.attemptNumber === round,
                        )!.id,
                      );
                      setFeedback(
                        round +
                          '회차 저장 완료' +
                          (round < session.targetAttempts
                            ? ' · 다음 회차'
                            : ' · 마지막 회차입니다. 세션 상태에서 완료 처리하세요.'),
                      );
                      if (round < session.targetAttempts) setRound(round + 1);
                      return true;
                    }
                    return false;
                  }}
                />
                <div role="status" className="save-feedback">
                  {feedback}
                </div>
                <button
                  type="button"
                  disabled={
                    !lastSaved ||
                    dirty ||
                    !records.some((a) => a.id === lastSaved) ||
                    session.status === 'cancelled'
                  }
                  onClick={() => {
                    const a = data.battingAttempts.find((a) => a.id === lastSaved);
                    if (!a) return;
                    if (
                      execute(() =>
                        reviseBattingAttempt(
                          data,
                          a.id,
                          { ...a, status: 'cancelled' },
                          changeMeta(session.assessor, '저장 직후 마지막 기록 취소'),
                        ),
                      )
                    ) {
                      setLastSaved('');
                      setRound(a.attemptNumber);
                      setFeedback(a.attemptNumber + '회차 취소 · 원본과 수정 이력 보존');
                    }
                  }}
                >
                  마지막 기록 취소
                </button>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={round === 1 || dirty}
                    onClick={() => setRound(round - 1)}
                  >
                    이전 회차
                  </button>
                  <span>
                    {round} / {session.targetAttempts}
                  </span>
                  <button
                    type="button"
                    disabled={round === session.targetAttempts || !attempt || dirty}
                    onClick={() => setRound(round + 1)}
                  >
                    다음 회차
                  </button>
                </div>
                {dirty && (
                  <p className="hint">
                    저장하지 않은 입력이 있습니다. 기록 저장 또는 입력 되돌리기 후 회차·세션을
                    이동하세요.
                  </p>
                )}
              </div>
              <aside className="attempt-sheet-pane" aria-label="회차 기록지">
                <h3>타격 평가 기록지</h3>
                <div className="attempt-sheet" role="list" aria-label="회차별 타격 기록">
                  {Array.from({ length: session.targetAttempts }, (_, i) => i + 1).map((n) => {
                    const a = records.find((r) => r.attemptNumber === n);
                    return (
                      <button
                        type="button"
                        role="listitem"
                        key={n}
                        disabled={
                          dirty || (!a && n > 1 && !records.some((r) => r.attemptNumber === n - 1))
                        }
                        className={n === round ? 'selected' : ''}
                        aria-label={`${n}회차 ${a?.status === 'cancelled' ? '취소' : a?.score !== null && a?.score !== undefined ? `${a.score}점` : '미평가'}`}
                        onClick={() => setRound(n)}
                      >
                        <b>
                          {n}회차 {a?.status === 'cancelled' ? '· 취소' : ''}
                        </b>
                        <span>
                          방향{' '}
                          {a?.directionZone
                            ? zoneLabel(a.directionZone)
                            : a?.direction
                              ? DIRECTION_LABELS[a.direction] + ' · 거리 미관찰'
                              : '미관찰'}
                        </span>
                        <span>
                          유형 {a?.trajectory ? TRAJECTORY_LABELS[a.trajectory] : '—'} / 강도{' '}
                          {a?.intensity ? STRENGTH_LABELS[a.intensity] : '—'}
                        </span>
                        <span>
                          정확성 {a?.contactQuality ? CONTACT_LABELS[a.contactQuality] : '—'} / 결과{' '}
                          {a?.result ? RESULT_LABELS[a.result] : '미측정'}
                        </span>
                        <strong>
                          {a?.score ?? '미평가'}
                          {a?.score !== null && a?.score !== undefined ? '점' : ''}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
            <details className="assessment-audit">
              <summary>
                원본 및 정정 이력 (
                {
                  data.battingAudit.filter((a) =>
                    a.entity === 'session'
                      ? a.originalId === session.id
                      : a.after.sessionId === session.id,
                  ).length
                }
                건)
              </summary>
              {data.battingAudit
                .filter((a) =>
                  a.entity === 'session'
                    ? a.originalId === session.id
                    : a.after.sessionId === session.id,
                )
                .slice()
                .reverse()
                .map((a) => (
                  <details key={a.id}>
                    <summary>
                      {a.entity === 'session' ? '세션' : `${a.after.attemptNumber}회차`} ·{' '}
                      {a.before ? '정정' : '최초 기록'} · {a.changedBy} ·{' '}
                      {new Date(a.changedAt).toLocaleString()} · {a.reason}
                    </summary>
                    <pre className="audit-json">
                      {JSON.stringify(
                        { originalId: a.originalId, before: a.before, after: a.after },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ))}
            </details>
          </Panel>
        </div>
      )}
      <details>
        <summary>날짜별 평균 · 성장 그래프 · 이전 수동 평가</summary>
        <BattingAssessmentReport data={data} playerId={playerId} />
      </details>
    </div>
  );
}
function SessionEditor({
  session: s,
  disabled,
  onUpdate,
  onDateChange,
}: {
  session: Session;
  disabled: boolean;
  onUpdate: (patch: Partial<Session>, actor: string, reason: string) => boolean;
  onDateChange: (date: string) => void;
}) {
  return (
    <form
      className="batting-session-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          date = String(f.get('date'));
        if (
          onUpdate(
            {
              date,
              targetAttempts: Number(f.get('target')),
              assessor: String(f.get('assessor')),
              purpose: String(f.get('purpose')),
              note: String(f.get('note')),
              status: String(f.get('status')) as Session['status'],
            },
            String(f.get('actor')),
            String(f.get('reason')),
          )
        )
          onDateChange(date);
      }}
    >
      <fieldset disabled={disabled}>
        <div className="form-row">
          <label>
            세션 날짜 변경
            <input name="date" type="date" required defaultValue={s.date} />
          </label>
          <label>
            평가 횟수 변경
            <input
              name="target"
              type="number"
              min="1"
              max="200"
              required
              defaultValue={s.targetAttempts}
            />
          </label>
          <label>
            세션 상태
            <select name="status" defaultValue={s.status}>
              {Object.entries(SESSION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            평가자 변경
            <input name="assessor" required maxLength={200} defaultValue={s.assessor} />
          </label>
          <label>
            목적 변경
            <input name="purpose" required maxLength={200} defaultValue={s.purpose} />
          </label>
        </div>
        <label>
          메모 변경
          <textarea name="note" maxLength={2000} defaultValue={s.note} />
        </label>
        <div className="form-row">
          <label>
            세션 수정자
            <input name="actor" required maxLength={200} defaultValue={s.assessor} />
          </label>
          <label>
            세션 수정 사유
            <input name="reason" required maxLength={2000} />
          </label>
        </div>
        <button type="submit">세션 변경 저장</button>
        <p className="hint">
          미평가 회차가 있으면 완료할 수 없습니다. 취소하면 원본은 보존하고 평균에서 제외합니다.
          재개하려면 진행 중으로 변경하세요.
        </p>
      </fieldset>
    </form>
  );
}
function Choices<T extends string>({
  title,
  labels,
  value,
  onChange,
}: {
  title: string;
  labels: Record<T, string>;
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <fieldset className="batting-choices">
      <legend>{title}</legend>
      <div>
        {Object.entries<string>(labels).map(([v, l]) => (
          <button
            type="button"
            key={v}
            aria-label={l}
            aria-pressed={value === v}
            className={value === v ? 'selected' : ''}
            onClick={() => onChange(v as T)}
          >
            {l}
          </button>
        ))}
        <button
          type="button"
          aria-label={`${title} 미관찰`}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          미관찰
        </button>
      </div>
    </fieldset>
  );
}
function AttemptEditor({
  attempt,
  session,
  onDirty,
  onCommit,
  defaultDetailed,
  onModeChange,
}: {
  defaultDetailed: boolean;
  onModeChange: (v: boolean) => void;
  attempt?: Attempt;
  session: Session;
  onDirty: (v: boolean) => void;
  onCommit: (input: AttemptInput, actor: string, reason: string) => boolean;
}) {
  const [draft, setDraft] = useState<AttemptInput>(attempt ?? blankAttempt());
  const [dirty, setDirty] = useState(false);
  const [detailed, setDetailedState] = useState(defaultDetailed);
  useEffect(() => setDetailedState(defaultDetailed), [defaultDetailed]);
  const setDetailed = (v: boolean) => {
    setDetailedState(v);
    onModeChange(v);
  };
  const [foulObserved, setFoulObserved] = useState(
    attempt?.result === 'foul' &&
      [
        attempt.direction ?? null,
        attempt.directionZone,
        attempt.trajectory,
        attempt.intensity,
        attempt.contactQuality,
      ].some((v) => v != null),
  );
  const locked = useRef(false);
  const patch = (p: Partial<AttemptInput>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    onDirty(true);
  };
  const observed = draft.result === 'fair' || (draft.result === 'foul' && foulObserved);
  const direction =
    draft.direction ?? (draft.directionZone?.split('-')[0] as Direction | undefined) ?? null;
  const distance = (draft.directionZone?.split('-')[1] as Distance | undefined) ?? null;
  const setDirection = (direction: Direction | null, distance: Distance | null) =>
    patch({
      direction,
      directionZone:
        direction && distance ? ((direction + '-' + distance) as Attempt['directionZone']) : null,
    });
  return (
    <form
      className={'quick-assessment' + (detailed ? ' detailed-editor' : '')}
      onSubmit={(e) => {
        e.preventDefault();
        if (
          locked.current ||
          (draft.status !== 'cancelled' && (!draft.result || draft.score === null))
        )
          return;
        locked.current = true;
        const f = new FormData(e.currentTarget);
        const saved = onCommit(
          draft,
          attempt ? String(f.get('actor')) : session.assessor,
          attempt ? String(f.get('reason')) : '최초 회차 기록',
        );
        if (saved) {
          setDirty(false);
          onDirty(false);
        } else locked.current = false;
      }}
    >
      <fieldset className="attempt-input" disabled={session.status === 'cancelled'}>
        <div className="record-mode" aria-label="평가 기록 모드">
          <button type="button" aria-pressed={!detailed} onClick={() => setDetailed(false)}>
            간편 모드
          </button>
          <button type="button" aria-pressed={detailed} onClick={() => setDetailed(true)}>
            상세 모드
          </button>
          <small>결과와 점수만 필수</small>
        </div>
        <div className="quick-assessment-grid">
          <section>
            <fieldset className="batting-choices result-choices">
              <legend>① 타격 결과 · 필수</legend>
              <div className="quick-three">
                {Object.entries(RESULT_LABELS).map(([v, l]) => (
                  <button
                    type="button"
                    key={v}
                    aria-label={l}
                    aria-pressed={draft.result === v}
                    onClick={() => {
                      if (v === draft.result) return;
                      setFoulObserved(false);
                      patch({
                        ...blankAttempt(),
                        note: draft.note,
                        status: draft.status,
                        score: draft.score,
                        result: v as Attempt['result'],
                      });
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </fieldset>
            {draft.result === 'foul' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={foulObserved}
                  onChange={(e) => {
                    setFoulObserved(e.target.checked);
                    if (!e.target.checked)
                      patch({
                        direction: null,
                        directionZone: null,
                        trajectory: null,
                        intensity: null,
                        contactQuality: null,
                      });
                  }}
                />
                이 파울의 실제 타구를 관찰했습니다 (선택 기록)
              </label>
            )}
            <fieldset disabled={!observed} className="observation-fields">
              <DirectionPicker direction={direction} distance={distance} onChange={setDirection} />
            </fieldset>
            {!observed && (
              <p className="hint">관찰할 수 없는 타구 항목은 해당 없음(null)으로 저장합니다.</p>
            )}
          </section>
          <fieldset className="batting-choices">
            <legend>② 회차 평가점수 · 감독 판정 · 필수</legend>
            <div className="score-buttons">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-label={'평가 ' + n + '점'}
                  aria-pressed={draft.score === n}
                  onClick={() => patch({ score: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="hint">1~10점 직접 판정 · 자동 추정 없음</p>
          </fieldset>
          <details className="attempt-note" hidden={!detailed}>
            <summary>평가 메모</summary>
            <label>
              회차 메모
              <textarea
                maxLength={2000}
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
              />
            </label>
          </details>
          {attempt && (
            <div className="form-row">
              <label>
                기록·수정자
                <input name="actor" required defaultValue={session.assessor} maxLength={200} />
              </label>
              <label>
                회차 수정 사유
                <input
                  name="reason"
                  required
                  maxLength={2000}
                  placeholder="점수 정정, 취소 복원 등"
                />
              </label>
              <label>
                회차 상태
                <select
                  value={draft.status}
                  onChange={(e) => patch({ status: e.target.value as Attempt['status'] })}
                >
                  <option value="active">유효</option>
                  <option value="cancelled">취소 (원본 보존)</option>
                </select>
              </label>
            </div>
          )}
        </div>
        <button
          type="button"
          className="details-toggle"
          aria-expanded={detailed}
          onClick={() => setDetailed(!detailed)}
        >
          {detailed ? '상세 기록 접기' : '상세 기록 펼치기'}
        </button>
        <div hidden={!detailed} className="quick-details">
          <fieldset disabled={!observed} className="observation-fields">
            <BattedBallMap direction={direction} distance={distance} onChange={setDirection} />
            <button type="button" onClick={() => setDirection(null, null)}>
              방향 미관찰
            </button>
            <Choices
              title="타구 유형"
              labels={TRAJECTORY_LABELS}
              value={draft.trajectory}
              onChange={(trajectory) => patch({ trajectory })}
            />
            <Choices
              title="타구 강도"
              labels={STRENGTH_LABELS}
              value={draft.intensity}
              onChange={(intensity) => patch({ intensity })}
            />
            <Choices
              title="타격 정확성"
              labels={CONTACT_LABELS}
              value={draft.contactQuality}
              onChange={(contactQuality) => patch({ contactQuality })}
            />
          </fieldset>
        </div>
        <div className="record-save-bar">
          <button
            type="submit"
            className="primary"
            disabled={
              !dirty || (draft.status !== 'cancelled' && (!draft.result || draft.score === null))
            }
          >
            {attempt ? '정정 저장 · 다음 회차' : '기록 저장 · 다음 회차'}
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(attempt ?? blankAttempt());
              setDirty(false);
              onDirty(false);
            }}
          >
            입력 되돌리기
          </button>
        </div>
      </fieldset>
    </form>
  );
}
