import { useRef, useState } from 'react';
import type {
  BattingAssessmentAttempt as Attempt,
  BattingAssessmentSession as Session,
  BattingQualityGrade,
} from '../domain/batting';
import type { Direction, Distance, Quality } from '../domain/model';
import { blankAttempt, type AttemptInput } from '../assessment/batting';
import { QUALITY_GRADES, QUALITY_SCALE } from '../config/battingQuality';
import { TRAJECTORY_LABELS } from '../config/batting';
import { BattedBallMap } from './BattedBallMap';
export function QualityAttemptEditor({
  attempt,
  session,
  onDirty,
  onCommit,
  focused,
}: {
  attempt?: Attempt;
  session: Session;
  focused: boolean;
  defaultDetailed: boolean;
  onModeChange: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onCommit: (input: AttemptInput, actor: string, reason: string) => boolean;
}) {
  const [draft, setDraft] = useState<AttemptInput>(
    attempt ?? { ...blankAttempt(), qualityGrade: null },
  );
  const [dirty, setDirty] = useState(false),
    [extras, setExtras] = useState(false),
    [actor, setActor] = useState(session.assessor),
    [reason, setReason] = useState('');
  const locked = useRef(false);
  const patch = (value: Partial<AttemptInput>) => {
    setDraft((d) => ({ ...d, ...value }));
    setDirty(true);
    onDirty(true);
  };
  const select = (grade: BattingQualityGrade) => {
    if (draft.qualityGrade === grade) return;
    const choice = QUALITY_SCALE[grade];
    patch({
      qualityGrade: grade,
      score: choice.score,
      result: choice.result,
      intensity: null,
      contactQuality: null,
      ...(choice.result === 'miss'
        ? { direction: null, directionZone: null, trajectory: null }
        : {}),
    });
  };
  const canObserve = draft.qualityGrade != null && draft.result !== 'miss';
  const direction =
    draft.direction ?? (draft.directionZone?.split('-')[0] as Direction | undefined) ?? null;
  const distance = (draft.directionZone?.split('-')[1] as Distance | undefined) ?? null;
  const usable = draft.status === 'cancelled' || draft.qualityGrade != null;
  return (
    <form
      className={'quality-assessment' + (extras ? ' quality-extras' : '')}
      onSubmit={(e) => {
        e.preventDefault();
        if (locked.current || !dirty || !usable) return;
        if (attempt && (!actor.trim() || !reason.trim())) {
          setExtras(true);
          return;
        }
        locked.current = true;
        try {
          if (onCommit(draft, actor, attempt ? reason : '타구 질 6단계 신규 기록')) {
            setDirty(false);
            onDirty(false);
          }
        } finally {
          locked.current = false;
        }
      }}
    >
      <fieldset className="plain-fieldset" disabled={session.status === 'cancelled'}>
        <div className="quality-toolbar">
          <b>타구 질 6단계 · 한 번 선택</b>
          <button type="button" aria-pressed={extras} onClick={() => setExtras(!extras)}>
            {extras ? '결과·관찰로 돌아가기' : '메모·정정'}
          </button>
        </div>
        <div className="quality-main" hidden={extras}>
          <fieldset className="quality-grades">
            <legend>타구 질 · 필수</legend>
            <div>
              {QUALITY_GRADES.map((key) => {
                const v = QUALITY_SCALE[key];
                return (
                  <button
                    type="button"
                    key={key}
                    aria-label={v.score + '점 ' + v.label}
                    aria-pressed={draft.qualityGrade === key}
                    onClick={() => select(key)}
                  >
                    <b>
                      {draft.qualityGrade === key ? '✓ ' : ''}
                      {v.score}점
                    </b>
                    <strong>{v.label}</strong>
                    <span>{v.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="hint">선택한 등급이 회차 점수입니다 · 3점 없음 · 미측정은 점수 없음</p>
          </fieldset>
          <div className="quality-direction">
            <fieldset className="observation-fields" disabled={!canObserve}>
              <BattedBallMap
                direction={direction}
                distance={distance}
                onChange={(d, r) =>
                  patch({
                    direction: d,
                    directionZone: d && r ? ((d + '-' + r) as Attempt['directionZone']) : null,
                  })
                }
              />
              <button type="button" onClick={() => patch({ direction: null, directionZone: null })}>
                방향 미관찰
              </button>
            </fieldset>
            {draft.result === 'miss' && (
              <p className="hint">티 타격·헛스윙의 타구 관찰은 해당 없음</p>
            )}
            {draft.result === 'foul' && (
              <p className="hint">파울 방향은 실제 관찰한 경우에만 선택</p>
            )}
            <details className="quality-optional">
              <summary>타구 유형 추가 관찰 · 선택</summary>
              <fieldset disabled={!canObserve}>
                <legend>타구 유형</legend>
                <div className="button-row">
                  {Object.entries(TRAJECTORY_LABELS).map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={draft.trajectory === key}
                      onClick={() => patch({ trajectory: key as Quality })}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={draft.trajectory === null}
                    onClick={() => patch({ trajectory: null })}
                  >
                    유형 미관찰
                  </button>
                </div>
              </fieldset>
              <small>실제 궤적만 선택 · 점수에서 자동 추정하지 않습니다</small>
            </details>
          </div>
        </div>
        <div className="quality-notes" hidden={!extras}>
          <label>
            회차 메모
            <textarea
              aria-label="회차 메모"
              maxLength={2000}
              value={draft.note}
              onChange={(e) => patch({ note: e.target.value })}
            />
          </label>
          {attempt && (
            <div className="quality-correction">
              <label>
                회차 수정 사유
                <input
                  aria-required="true"
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setDirty(true);
                    onDirty(true);
                  }}
                />
              </label>
              <label>
                기록·수정자
                <input
                  aria-required="true"
                  maxLength={200}
                  value={actor}
                  onChange={(e) => {
                    setActor(e.target.value);
                    setDirty(true);
                    onDirty(true);
                  }}
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
              {(!reason.trim() || !actor.trim()) && (
                <small>정정 시 수정자와 사유를 입력하세요.</small>
              )}
            </div>
          )}
        </div>
        <div className="record-save-bar">
          <button type="submit" className="primary" disabled={!dirty || !usable}>
            {attempt ? '정정 저장 · 다음 회차' : '기록 저장 · 다음 회차'}
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(attempt ?? { ...blankAttempt(), qualityGrade: null });
              setDirty(false);
              onDirty(false);
            }}
          >
            입력 되돌리기
          </button>
        </div>
        {!focused && (
          <small>100점 환산 = (원점수 평균 + 1) ÷ 6 × 100 · 이전1~10점 기록과 분리</small>
        )}
      </fieldset>
    </form>
  );
}
