import { useState, useRef } from 'react';
import type { Workspace } from '../domain/model';
import type { AssessmentKind, AssessmentRecordKind } from '../domain/assessmentManagement';
import { assessmentDayArchived } from '../domain/assessmentManagement';
import {
  assessmentRecords,
  setAssessmentDateArchived,
  setAssessmentRecordArchived,
  type ManagementMeta,
} from '../assessment/management';
import { AssessorPicker, AssessorManager } from './AssessorPicker';
import { Panel, Modal } from './ui';
const kinds: Record<AssessmentRecordKind, string> = {
  batting: '타격 세션',
  'batting-attempt': '타격 회차',
  defense: '수비 상황',
  fungo: '펑고 기록',
};
export function AssessmentDeleteAction({
  label,
  description,
  disabled = false,
  restore = false,
  onConfirm,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  restore?: boolean;
  onConfirm: (m: ManagementMeta) => void;
}) {
  const [open, setOpen] = useState(false),
    [actor, setActor] = useState(''),
    [reason, setReason] = useState('잘못 생성한 기록'),
    [error, setError] = useState(''),
    lock = useRef(false);
  return (
    <>
      <button
        type="button"
        className={restore ? '' : 'danger-button'}
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        {label}
      </button>
      {open && (
        <Modal title={restore ? '평가 기록 복원' : '평가 기록 삭제'} onClose={() => setOpen(false)}>
          <p>{description}</p>
          <p>
            {restore
              ? '보관된 기록을 다시 평가에 반영합니다.'
              : '평균·추천 계산에서 제외하며 원본과 수정 이력을 보관합니다. 삭제 목록에서 복원할 수 있습니다.'}
          </p>
          <AssessorPicker label="처리 평가자" value={actor} onChange={setActor} />
          {!restore && (
            <div className="button-row" role="group" aria-label="삭제 사유">
              {['잘못 생성한 기록', '중복 기록', '평가 취소'].map((r) => (
                <button
                  type="button"
                  key={r}
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button type="button" onClick={() => setOpen(false)}>
              닫기
            </button>
            <button
              type="button"
              className="primary"
              disabled={!actor}
              onClick={() => {
                if (lock.current) return;
                lock.current = true;
                try {
                  onConfirm({
                    id: crypto.randomUUID(),
                    at: new Date().toISOString(),
                    actor,
                    reason: restore ? '삭제 기록 복원' : reason,
                  });
                  setOpen(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  lock.current = false;
                }
              }}
            >
              {restore ? '복원 확인' : '삭제 확인'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function AssessmentDateActions({
  data,
  kind,
  date,
  onSave,
  onRemoved,
  disabled = false,
}: {
  data: Workspace;
  kind: AssessmentKind;
  date: string;
  onSave: (d: Workspace) => void;
  onRemoved: () => void;
  disabled?: boolean;
}) {
  const days =
    kind === 'batting' ? data.battingDays : kind === 'defense' ? data.defenseDays : data.fungoDays;
  if (
    !date ||
    assessmentDayArchived(data, kind, date) ||
    (!days.some((d) => d.date === date) &&
      !assessmentRecords(data, kind).some((r) => r.date === date))
  )
    return null;
  return (
    <AssessmentDeleteAction
      disabled={disabled}
      label="선택 날짜 삭제"
      description={date + '의 ' + kinds[kind] + ' 전체를 삭제합니다.'}
      onConfirm={(m) => {
        onSave(setAssessmentDateArchived(data, kind, date, true, m));
        onRemoved();
      }}
    />
  );
}
export function AssessmentRecordManager({
  data,
  onSave,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
}) {
  const [kind, setKind] = useState<AssessmentRecordKind>('batting'),
    [date, setDate] = useState(''),
    [deleted, setDeleted] = useState(false),
    [page, setPage] = useState(0);
  const type = kind === 'batting-attempt' ? 'batting' : kind,
    records = assessmentRecords(data, kind),
    days =
      type === 'batting'
        ? data.battingDays
        : type === 'defense'
          ? data.defenseDays
          : data.fungoDays;
  const dates = [...new Set([...days.map((d) => d.date), ...records.map((r) => r.date)])]
    .sort()
    .reverse();
  const selected = dates.includes(date) ? date : (dates[0] ?? '');
  const archived = assessmentDayArchived(data, type, selected),
    rows = records.filter((r) => r.date === selected && r.archived === deleted),
    shown = rows.slice(page * 20, page * 20 + 20);
  return (
    <>
      <Panel title="평가자 등록">
        <AssessorManager />
      </Panel>
      <Panel title="평가 기록 삭제·복원">
        <div className="tabs">
          {Object.entries(kinds).map(([k, v]) => (
            <button
              key={k}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k as AssessmentRecordKind);
                setDate('');
                setPage(0);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="form-row">
          <label>
            관리할 평가 날짜
            <select
              aria-label="관리할 평가 날짜"
              value={selected}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(0);
              }}
            >
              <option value="">날짜 선택</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                  {assessmentDayArchived(data, type, d) ? ' · 삭제됨' : ''}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <AssessmentDeleteAction
              label={archived ? '선택 날짜 복원' : '선택 날짜 삭제'}
              restore={archived}
              description={selected + ' · 이 날짜의 전체 평가'}
              onConfirm={(m) =>
                onSave(setAssessmentDateArchived(data, type, selected, !archived, m))
              }
            />
          )}
        </div>
        <div className="tabs">
          <button
            aria-pressed={!deleted}
            onClick={() => {
              setDeleted(false);
              setPage(0);
            }}
          >
            유효 기록
          </button>
          <button
            aria-pressed={deleted}
            onClick={() => {
              setDeleted(true);
              setPage(0);
            }}
          >
            삭제한 기록
          </button>
        </div>
        {archived && <p>삭제된 날짜입니다. 날짜를 먼저 복원한 뒤 개별 기록을 관리하세요.</p>}
        <div className="assessment-management-records">
          {shown.map((r) => (
            <article key={r.id}>
              <div>
                <b>{data.players.find((p) => p.id === r.playerId)?.name ?? '이전 학생'}</b>
                <span>
                  {r.label} · {r.date}
                </span>
              </div>
              <AssessmentDeleteAction
                disabled={archived}
                label={deleted ? '기록 복원' : '기록 삭제'}
                restore={deleted}
                description={
                  (data.players.find((p) => p.id === r.playerId)?.name ?? '') + ' · ' + r.label
                }
                onConfirm={(m) =>
                  onSave(setAssessmentRecordArchived(data, kind, r.id, !deleted, m))
                }
              />
            </article>
          ))}
        </div>
        {!rows.length && <p>해당 기록이 없습니다.</p>}
        <div className="button-row">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전 20개
          </button>
          <span>{rows.length}개</span>
          <button disabled={(page + 1) * 20 >= rows.length} onClick={() => setPage((p) => p + 1)}>
            다음 20개
          </button>
        </div>
        <p className="hint">
          날짜 삭제 전에 개별 삭제된 기록은 날짜 복원 후에도 삭제 상태를 유지합니다. 기존 경기
          기록과 선수 정보는 바뀌지 않습니다. 같은 날짜에 새 평가를 만든 뒤에도 이전 기록은 삭제
          목록에 남으며 개별 복원할 수 있습니다.
        </p>
      </Panel>
    </>
  );
}
