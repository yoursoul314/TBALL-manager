import { useState } from 'react';
import type { Workspace } from '../domain/model';
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
import { STRENGTH_LABELS } from '../config/recording';
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
}: {
  data: Workspace;
  playerId: string;
  onSave: (d: Workspace) => void;
}) {
  const [date, setDate] = useState(today()),
    [sessionId, setSessionId] = useState(''),
    [round, setRound] = useState(1),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false);
  const sessions = data.battingSessions.filter((s) => s.playerId === playerId && s.date === date);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions.at(-1);
  const attempt = session
    ? data.battingAttempts.find((a) => a.sessionId === session.id && a.attemptNumber === round)
    : undefined;
  const daily = summarizeBatting(data, playerId, { from: date, to: date });
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
    <div className="batting-workspace">
      <Panel
        title={`${current.name} · ${current.number}번 타격 상세평가`}
        eyebrow="BATTING ASSESSMENT v1.0"
      >
        <BattingAssessmentReport data={data} playerId={playerId} compact />
      </Panel>
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
            <p className="callout">
              {session.sessionNumber}차 · {SESSION_LABELS[session.status]} · 기록 {records.length}/
              {session.targetAttempts}회<br />
              구역 정의 {zone?.version}: 근거리 {zone?.near} / 중거리 {zone?.middle} / 원거리{' '}
              {zone?.far}
            </p>
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
        <Panel
          title={`${round}회차 기록`}
          eyebrow={`${SESSION_LABELS[session.status]} · ${session.targetAttempts}회 중`}
        >
          <AttemptEditor
            key={`${session.id}/${round}/${attempt?.updatedAt ?? ''}/${attempt?.status ?? ''}`}
            attempt={attempt}
            session={session}
            onDirty={setDirty}
            onCommit={(input, actor, reason) => {
              const next = execute(() =>
                attempt
                  ? reviseBattingAttempt(data, attempt.id, input, changeMeta(actor, reason))
                  : recordBattingAttempt(data, session.id, round, input, changeMeta(actor, reason)),
              );
              if (next) {
                setDirty(false);
                return true;
              }
              return false;
            }}
          />
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
              저장하지 않은 입력이 있습니다. 기록 저장 또는 입력 되돌리기 후 회차·세션을 이동하세요.
            </p>
          )}
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
                  <span>방향 {zoneLabel(a?.directionZone ?? null)}</span>
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
          <details>
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
      )}
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
}: {
  attempt?: Attempt;
  session: Session;
  onDirty: (v: boolean) => void;
  onCommit: (input: AttemptInput, actor: string, reason: string) => boolean;
}) {
  const [draft, setDraft] = useState<AttemptInput>(attempt ?? blankAttempt()),
    [foulObserved, setFoulObserved] = useState(
      attempt?.result === 'foul' &&
        [attempt.directionZone, attempt.trajectory, attempt.intensity, attempt.contactQuality].some(
          (v) => v !== null,
        ),
    );
  const [dirty, setDirty] = useState(false),
    [message, setMessage] = useState('');
  const patch = (p: Partial<AttemptInput>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    onDirty(true);
    setMessage('');
  };
  const observed = draft.result === 'fair' || (draft.result === 'foul' && foulObserved);
  const [dir, dist] = (draft.directionZone?.split('-') ?? ['center', null]) as [
    'left' | 'center' | 'right',
    'near' | 'middle' | 'far' | null,
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          onCommit(
            draft,
            String(f.get('actor')),
            attempt ? String(f.get('reason')) : '최초 회차 기록',
          )
        ) {
          setDirty(false);
          onDirty(false);
          setMessage('회차 기록을 저장했습니다.');
        }
      }}
    >
      <fieldset disabled={session.status === 'cancelled'} className="attempt-input">
        <Choices
          title="타격 결과"
          labels={RESULT_LABELS}
          value={draft.result}
          onChange={(result) => {
            if (result === draft.result) return;
            setFoulObserved(false);
            patch({
              ...blankAttempt(),
              note: draft.note,
              status: draft.status,
              score: result === null ? null : draft.score,
              result,
            });
          }}
        />
        {draft.result === 'foul' && (
          <label className="foul-observation">
            <input
              type="checkbox"
              checked={foulObserved}
              onChange={(e) => {
                setFoulObserved(e.target.checked);
                if (!e.target.checked)
                  patch({
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
        {!observed && (
          <p className="hint">
            현재 방향·유형·강도·정확성은 해당 없음(null)입니다. 파울은 실제 관찰한 경우 선택 기록할
            수 있습니다.
          </p>
        )}
        <fieldset disabled={!observed} className="observation-fields">
          <BattedBallMap
            direction={dir}
            distance={dist}
            onChange={(d, r) => patch({ directionZone: `${d}-${r}` })}
          />
          <button type="button" onClick={() => patch({ directionZone: null })}>
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
        <fieldset className="batting-choices" disabled={draft.result === null}>
          <legend>회차 평가점수 · 감독 판정</legend>
          <div className="score-buttons">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                aria-label={`평가 ${n}점`}
                aria-pressed={draft.score === n}
                className={draft.score === n ? 'selected' : ''}
                onClick={() => patch({ score: n })}
              >
                {n}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => patch({ score: null })}>
            점수 미평가
          </button>
        </fieldset>
        <p className="hint">
          강도·정타 여부로 점수를 자동 생성하지 않습니다. 현재{' '}
          {draft.score === null ? '미평가' : `${draft.score}점`}.
        </p>
        <label>
          회차 메모
          <textarea
            value={draft.note}
            maxLength={2000}
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            기록·수정자
            <input name="actor" required maxLength={200} defaultValue={session.assessor} />
          </label>
          {attempt && (
            <label>
              회차 수정 사유
              <input
                name="reason"
                required
                maxLength={2000}
                placeholder="점수 정정, 회차 취소 등"
              />
            </label>
          )}
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
        <div className="button-row">
          <button type="submit" className="primary">
            {attempt ? '정정 기록 저장' : '기록 저장'}
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(attempt ?? blankAttempt());
              setFoulObserved(
                attempt?.result === 'foul' &&
                  [
                    attempt.directionZone,
                    attempt.trajectory,
                    attempt.intensity,
                    attempt.contactQuality,
                  ].some((v) => v !== null),
              );
              setDirty(false);
              onDirty(false);
            }}
          >
            입력 되돌리기
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </fieldset>
    </form>
  );
}
