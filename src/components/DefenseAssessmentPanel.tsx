import { DefenseAttemptPlan } from './DefenseAttemptPlan';
import { defenseProgress } from '../assessment/defenseDays';
import { chooseDefenseEvaluation, defenseEvaluation } from '../evaluation/defense';
import { useRef, useState } from 'react';
import type { Workspace } from '../domain/model';
import { ABILITIES, ABILITY_LABELS, type Ability } from '../config/positions';
import {
  DEFENSE_SITUATIONS,
  DEFENSE_PRIMARY,
  DEFENSE_ERRORS,
  DEFAULT_DEFENSE_RUBRIC,
  type DefenseInput,
  type DefenseOutcome,
} from '../domain/defenseAssessment';
import {
  emptyDefenseObservations,
  saveDefenseAssessment,
  summarizeDefenseAssessments,
} from '../assessment/defenseChecklist';
import { localDate } from '../domain/roster';
import { Badge, Panel } from './ui';
const outcomeLabels = {
  success: '성공',
  partial: '부분 수행',
  failure: '실패',
  'not-offered': '기회 없음',
};
const shortCues: Record<Ability, string> = {
  G: '몸 앞에서 땅볼 잡기',
  F: '낙하지점 찾아 잡기',
  C: '동료의 송구 받기',
  A: '목표에 정확히 던지기',
  L: '필요한 거리·힘으로 던지기',
  Q: '공을 보고 바로 움직이기',
  M: '수비 범위의 공에 접근',
  J: '상황에 맞는 행동 선택',
  B: '베이스 밟기·태그',
};
const cues: Record<Ability, string> = {
  G: '땅볼을 몸 앞에서 안정적으로 잡았는가?',
  F: '뜬공의 낙하지점을 찾아 잡았는가?',
  C: '다른 선수의 송구를 안정적으로 받았는가?',
  A: '의도한 상대·목표에 정확히 던졌는가?',
  L: '정해 둔 거리까지 필요한 힘으로 던졌는가?',
  Q: '타구를 보고 첫 움직임을 시작했는가?',
  M: '설정한 수비 구역 안의 공에 접근했는가?',
  J: '주자 상황에 맞는 송구·수비 행동을 골랐는가?',
  B: '베이스 접촉 또는 태그 동작을 바르게 했는가?',
};
export function DefenseAssessmentReport({ data, playerId }: { data: Workspace; playerId: string }) {
  const summary = summarizeDefenseAssessments(data, playerId);
  return (
    <section className="defense-assessment-report" aria-label="수비 체크리스트 분석">
      <h3>수비 체크리스트 · 시범 점수</h3>
      <p className="hint">
        유효 상황 {summary.count}회 · 기회 없음·미관찰·취소는 점수에서 제외합니다. 수비 기능평가에
        적용하면 9항목과 포지션 적합도에 반영됩니다. 실전 스탯과 최종 종합 선발은 별도입니다.
      </p>
      {summary.mixedRubrics && (
        <p className="alert">
          서로 다른 시범 배점이 포함됩니다. 각 기록 당시 배점으로 100점 환산 후 관찰 횟수에 비례해
          평균합니다.
        </p>
      )}
      <div className="defense-score-grid">
        {ABILITIES.map((k) => {
          const a = summary.abilities[k];
          return (
            <div key={k}>
              <small>
                {k} · {ABILITY_LABELS[k]}
              </small>
              <b>{a.score === null ? '미측정' : a.score.toFixed(1) + '점'}</b>
              <span>
                성공 {a.success} · 부분 {a.partial} · 실패 {a.failure}
              </span>
              <span>
                유효 {a.count}회 · 기회 없음 {a.notOffered}회
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function DefenseAssessmentPanel({
  data,
  playerId,
  onSave,
  onDirtyChange,
  managedDay,
  navigation,
  initialFocused = false,
  onFocusChange,
}: {
  data: Workspace;
  playerId: string;
  onSave: (d: Workspace) => void;
  onDirtyChange?: (v: boolean) => void;
  managedDay?: { date: string; assessor: string };
  navigation?: {
    index: number;
    total: number;
    previous?: () => void;
    next?: () => void;
    onSavedNext: () => void;
  };
  initialFocused?: boolean;
  onFocusChange?: (v: boolean) => void;
}) {
  const fresh = (
    date = managedDay?.date ?? localDate(),
    assessor = managedDay?.assessor ?? '',
  ): DefenseInput => ({
    date,
    assessor,
    situation: 'ground',
    observations: emptyDefenseObservations(),
    error: null,
    note: '',
    rubric: { ...DEFAULT_DEFENSE_RUBRIC },
  });
  const [draft, setDraft] = useState<DefenseInput>(() => fresh()),
    [dirty, setDirty] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [reason, setReason] = useState(''),
    [detail, setDetail] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [focused, setFocused] = useState(initialFocused);
  const [sourceAuthor, setSourceAuthor] = useState(
    data.defenseAssessments
      .filter((r) => r.playerId === playerId)
      .at(-1)
      ?.revisions.at(-1)?.assessor ?? '',
  );
  const draftId = useRef(crypto.randomUUID()),
    saving = useRef(false);
  const rows = data.defenseAssessments.filter(
    (r) => r.playerId === playerId && (!managedDay || r.revisions.at(-1)!.date === managedDay.date),
  );
  const change = (next: DefenseInput) => {
    setDraft(next);
    setDirty(true);
    onDirtyChange?.(true);
    setMessage('');
  };
  const mark = (ability: Ability, outcome: DefenseOutcome) =>
    change({ ...draft, observations: { ...draft.observations, [ability]: outcome } });
  const clear = () => {
    setDraft({
      ...fresh(draft.date, draft.assessor),
      rubric: { ...draft.rubric },
      situation: draft.situation,
    });
    setDirty(false);
    onDirtyChange?.(false);
    setEditing(null);
    setReason('');
    setError('');
    draftId.current = crypto.randomUUID();
  };
  const save = (cancel = false, nextStudent = false) => {
    if (saving.current) return;
    if (!draft.assessor.trim()) {
      setError('평가자·수정자를 입력하세요');
      return;
    }
    if (editing && !reason.trim()) {
      setError('수정·취소 사유를 입력하세요');
      return;
    }
    if (!cancel && !Object.values(draft.observations).some((v) => v !== null)) {
      setError('관찰한 결과 또는 기회 없음을 하나 이상 선택하세요');
      return;
    }
    saving.current = true;
    try {
      const next = saveDefenseAssessment(
        data,
        playerId,
        draft,
        {
          id: draftId.current,
          revisionId: crypto.randomUUID(),
          at: new Date().toISOString(),
          author: draft.assessor,
          reason: editing ? reason : '새 수비 상황 기록',
        },
        editing ?? undefined,
        cancel,
      );
      onSave(next);
      setSourceAuthor(draft.assessor);
      clear();
      setMessage(
        cancel
          ? '취소했습니다. 원본과 수정 이력은 유지됩니다.'
          : defenseProgress(next, playerId, draft.date).complete
            ? '목표 횟수를 완료했습니다. 다음 학생으로 이동하거나 수비 횟수를 늘릴 수 있습니다.'
            : '저장했습니다. 다음 상황을 기록하세요.',
      );
      if (nextStudent && !editing && !cancel) navigation?.onSavedNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다. 입력은 유지됩니다.');
    } finally {
      saving.current = false;
    }
  };
  const primary = DEFENSE_PRIMARY[draft.situation];
  const evaluation = defenseEvaluation(data, playerId);
  const progress = defenseProgress(data, playerId, draft.date);
  return (
    <Panel
      className={focused ? 'defense-practice defense-focused' : 'defense-practice'}
      title={'수비 상황 체크리스트 · ' + (data.players.find((p) => p.id === playerId)?.name ?? '')}
      eyebrow="DEFENSE PRACTICE"
      action={
        <div className="button-row">
          <Badge tone="amber">수비 기능 반영 · 종합 선발 TODO</Badge>
          <button
            onClick={() => {
              setFocused(!focused);
              onFocusChange?.(!focused);
            }}
          >
            {focused ? '집중 모드 끝내기' : '수비 기록 집중 모드'}
          </button>
        </div>
      }
    >
      <div className="defense-session-toolbar">
        {navigation && (
          <div className="assessment-student-navigation">
            <button disabled={dirty || !navigation.previous} onClick={navigation.previous}>
              이전 수비 학생
            </button>
            <b>
              {navigation.index}/{navigation.total}명
            </b>
            <button disabled={dirty || !navigation.next} onClick={navigation.next}>
              다음 수비 학생
            </button>
          </div>
        )}
        <p className="hint defense-record-hint">
          한 상황에서 수행한 행동을 각각 체크하세요. 포구 성공을 선택해도 송구·실책 결과가 자동
          입력되지는 않습니다.
        </p>
        <div className="form-row">
          <label>
            수비 평가 날짜
            <input
              type="date"
              readOnly={!!managedDay}
              value={draft.date}
              onChange={(e) => change({ ...draft, date: e.target.value })}
            />
          </label>
          <label>
            평가자·수정자
            <input
              maxLength={200}
              value={draft.assessor}
              onChange={(e) => change({ ...draft, assessor: e.target.value })}
              placeholder="교사·감독"
            />
          </label>
        </div>
      </div>
      <DefenseAttemptPlan
        data={data}
        playerId={playerId}
        date={draft.date}
        assessor={draft.assessor}
        disabled={!!editing}
        onSave={onSave}
      />
      <div className="defense-situations" aria-label="수비 평가 상황">
        {Object.entries(DEFENSE_SITUATIONS).map(([v, l]) => (
          <button
            key={v}
            aria-pressed={draft.situation === v}
            onClick={() => change({ ...draft, situation: v as DefenseInput['situation'] })}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="defense-checklist">
        {ABILITIES.filter(
          (k) => focused || primary.includes(k) || detail || draft.observations[k] !== null,
        ).map((k) => (
          <fieldset key={k}>
            <legend title={cues[k]}>
              <b>
                {k} · {ABILITY_LABELS[k]}
              </b>{' '}
              <span className="defense-short-cue">{shortCues[k]}</span>
            </legend>
            <div className="defense-outcomes">
              {(['success', 'partial', 'failure', 'not-offered', null] as const).map((v) => (
                <button
                  key={v ?? 'null'}
                  aria-label={
                    k + ' ' + ABILITY_LABELS[k] + ' ' + (v === null ? '미관찰' : outcomeLabels[v])
                  }
                  aria-pressed={draft.observations[k] === v}
                  onClick={() => mark(k, v)}
                >
                  {draft.observations[k] === v && <span aria-hidden="true">✓ </span>}
                  {v === null
                    ? '미관찰'
                    : v === 'failure' && ['G', 'F', 'C'].includes(k)
                      ? '놓침'
                      : focused && v === 'partial'
                        ? '부분'
                        : outcomeLabels[v]}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <button
        className="detail-toggle defense-expand"
        aria-expanded={detail}
        onClick={() => setDetail(!detail)}
      >
        {detail ? '추가 능력 접기' : '첫 반응·수비 범위·판단 등 9능력 펼치기'}
      </button>
      <details className="defense-extra">
        <summary>실책·메모·시범 배점 설정</summary>
        <label>
          실책 분류 (별도 관찰)
          <select
            aria-label="실책 분류 (별도 관찰)"
            value={draft.error ?? ''}
            onChange={(e) =>
              change({ ...draft, error: (e.target.value || null) as DefenseInput['error'] })
            }
          >
            <option value="">미관찰</option>
            {Object.entries(DEFENSE_ERRORS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          수비 평가 메모
          <textarea
            maxLength={2000}
            value={draft.note}
            onChange={(e) => change({ ...draft, note: e.target.value })}
            placeholder="공의 속도·거리, 부분 수행 판단 근거 등"
          />
        </label>
        <p className="hint">
          시범안: 성공 2 · 부분 수행 1 · 실패 0. 성공 점수를 만점으로 100점 환산하며 배점은 기록마다
          보존합니다. 실책 분류는 추가 감점하지 않습니다. 부분 수행 기준·난도 보정·통일된 배점
          확정은 TODO입니다.
        </p>
        <div className="form-row">
          {(['success', 'partial', 'failure'] as const).map((k) => (
            <label key={k}>
              {outcomeLabels[k]} 시범 배점
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={draft.rubric[k]}
                onChange={(e) =>
                  change({ ...draft, rubric: { ...draft.rubric, [k]: Number(e.target.value) } })
                }
              />
            </label>
          ))}
        </div>
      </details>
      {editing && (
        <label>
          수정·취소 사유
          <input
            value={reason}
            maxLength={2000}
            onChange={(e) => {
              setReason(e.target.value);
              setDirty(true);
              onDirtyChange?.(true);
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="defense-save-row">
        {navigation && !editing && (
          <button
            className="primary"
            disabled={progress.complete}
            onClick={() => save(false, true)}
          >
            수비 기록 저장 · 다음 학생
          </button>
        )}
        <button
          className={navigation && !editing ? '' : 'primary'}
          disabled={!editing && progress.complete}
          onClick={() => save()}
        >
          {editing ? '수비 기록 정정 저장' : '수비 기록 저장 · 다음 상황'}
        </button>
        <button onClick={clear} disabled={!dirty && !editing}>
          입력 되돌리기
        </button>
        {editing &&
          data.defenseAssessments.find((r) => r.id === editing)?.revisions.at(-1)?.status !==
            'cancelled' && (
            <button className="danger-button" onClick={() => save(true)}>
              이 수비 기록 취소
            </button>
          )}
      </div>
      {message && <p role="status">{message}</p>}
      <div className="callout defense-source">
        <b>
          최종 수비 기능평가 9항목 · 현재{' '}
          {evaluation.source === 'checklist' ? '체크리스트 환산 사용' : '기존 수동 점수 사용'}
        </b>
        <p>
          체크 점수 적용 후 관찰을 수정·취소하면 9항목과 TYPE1 포지션 적합도가 자동 갱신됩니다.
          미측정 능력은 기존 점수로 채우지 않습니다. 최종 종합 선발 비율은 계속 미확정입니다.
        </p>
        <label>
          점수 출처 적용자
          <input
            value={sourceAuthor}
            maxLength={200}
            onChange={(e) => setSourceAuthor(e.target.value)}
          />
        </label>
        <button
          disabled={
            dirty ||
            (evaluation.source === 'manual' &&
              !Object.values(evaluation.summary.abilities).some((a) => a.count > 0))
          }
          onClick={() => {
            if (!sourceAuthor.trim()) {
              setError('점수 출처 적용자를 입력하세요');
              return;
            }
            try {
              onSave(
                chooseDefenseEvaluation(data, {
                  id: crypto.randomUUID(),
                  playerId,
                  source: evaluation.source === 'checklist' ? 'manual' : 'checklist',
                  changedAt: new Date().toISOString(),
                  changedBy: sourceAuthor,
                }),
              );
              setMessage('수비 기능평가 점수 출처를 적용했습니다.');
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : '적용 실패');
            }
          }}
        >
          {evaluation.source === 'checklist'
            ? '기존 수동 수비평가로 전환'
            : '체크 점수를 수비 기능평가에 적용'}
        </button>
        {dirty && <small>입력한 관찰을 먼저 저장하거나 되돌린 뒤 적용하세요.</small>}
      </div>
      <DefenseAssessmentReport data={data} playerId={playerId} />
      <details className="defense-history">
        <summary>상황별 기록·정정 이력 ({rows.length}건)</summary>
        {rows.length ? (
          [...rows].reverse().map((r) => {
            const v = r.revisions.at(-1)!;
            return (
              <article key={r.id}>
                <button
                  disabled={dirty}
                  onClick={() => {
                    setDraft({
                      ...v,
                      observations: { ...v.observations },
                      rubric: { ...v.rubric },
                    });
                    setEditing(r.id);
                    setReason('');
                    setError('');
                    setMessage('');
                  }}
                >
                  {v.date} · {DEFENSE_SITUATIONS[v.situation]} ·{' '}
                  {v.status === 'cancelled' ? '취소' : '기록'} · 수정
                </button>
                <details>
                  <summary>원본·변경 {r.revisions.length}건</summary>
                  {r.revisions.map((h, i) => (
                    <p key={h.id}>
                      {i === 0 ? '원본' : '정정'} · {h.changedAt} · {h.changedBy} · {h.reason}
                      <br />
                      {h.date} · {DEFENSE_SITUATIONS[h.situation]} ·{' '}
                      {h.status === 'cancelled' ? '취소' : '유효'} ·{' '}
                      {ABILITIES.map(
                        (k) =>
                          k +
                          ': ' +
                          (h.observations[k] === null
                            ? '미관찰'
                            : outcomeLabels[h.observations[k]!]),
                      ).join(' / ')}
                      <br />
                      실책: {h.error === null ? '미관찰' : DEFENSE_ERRORS[h.error]} · 배점{' '}
                      {h.rubric.success}/{h.rubric.partial}/{h.rubric.failure} · {h.note}
                    </p>
                  ))}
                </details>
              </article>
            );
          })
        ) : (
          <p>아직 기록이 없습니다.</p>
        )}
      </details>
    </Panel>
  );
}
