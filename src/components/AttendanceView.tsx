import { useMemo, useState } from 'react';
import type { Workspace } from '../domain/model';
import { localDate } from '../domain/roster';
import {
  ATTENDANCE_LABELS,
  prepareDailyAttendance,
  isAttendanceDate,
  sortAttendanceStudents,
  markAttendance,
  groupKey,
  groupLabel,
  type AttendanceStatus,
  type ClassDay,
} from '../domain/attendance';

const statuses = Object.entries(ATTENDANCE_LABELS) as [AttendanceStatus, string][];

export function AttendanceView({
  data,
  onSave,
  initialDate,
  compact = false,
}: {
  data: Workspace;
  onSave: (d: Workspace) => void;
  initialDate?: string;
  compact?: boolean;
}) {
  const [date, setDate] = useState(initialDate ?? localDate());
  const [group, setGroup] = useState('all');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(50);
  const day = useMemo(
    () => (isAttendanceDate(date) ? prepareDailyAttendance(data, date) : undefined),
    [data, date],
  );
  const savedDay = data.classDays.find((d) => d.date === date);
  const sorted = useMemo(() => sortAttendanceStudents(day?.students ?? []), [day]);
  const groups = [
    ...new Map(
      sorted.map((s) => [groupKey(s), { grade: s.grade, classroom: s.classroom }]),
    ).values(),
  ];
  const rows = sorted.filter(
    (s) =>
      (group === 'all' || groupKey(s) === group) &&
      (filter === 'all' || s.status === filter) &&
      `${s.name} ${groupLabel(s)} ${s.studentNumber ?? ''} ${s.number}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const selectedIds = rows.filter((s) => selected.includes(s.playerId)).map((s) => s.playerId);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const pendingCount = (day?.students.length ?? 0) - (savedDay?.students.length ?? 0);
  const changeDate = (value: string) => {
    setDate(value);
    setSelected([]);
    setError('');
    setFeedback('');
    setGroup('all');
    setFilter('all');
    setQuery('');
    setShowHistory(false);
    setHistoryLimit(50);
  };
  const moveDate = (offset: number) => {
    if (!day) return;
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y, m - 1, d, 12);
    next.setDate(next.getDate() + offset);
    changeDate(localDate(next));
  };
  const save = (next: ClassDay, message: string) => {
    try {
      onSave({ ...data, classDays: [...data.classDays.filter((d) => d.date !== next.date), next] });
      setError('');
      setFeedback(message);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '출석 저장 실패');
      setFeedback('');
    }
  };
  const mark = (ids: string[], status: AttendanceStatus) => {
    if (!day || !ids.length) return;
    save(
      markAttendance(day, ids, status),
      `${ids.length}명 ${ATTENDANCE_LABELS[status]} 저장 완료`,
    );
  };
  return (
    <section className={'attendance-view ' + (compact ? 'compact' : '')} aria-label="수업 출석부">
      <div className="daily-heading">
        <h2>일별 출석부</h2>
        <span>전체 명단 · 날짜별 출결</span>
      </div>
      <p className="daily-help">
        학급 추가 없이 전체 학생을 확인합니다. 칸을 누르면 즉시 저장하며, 여러 명을 선택해 함께
        처리할 수 있습니다.
      </p>
      <div className="daily-datebar">
        {!compact && (
          <button type="button" aria-label="이전 날짜" disabled={!day} onClick={() => moveDate(-1)}>
            ‹
          </button>
        )}
        <label>
          수업 날짜
          <input
            aria-label="출석 날짜"
            type="date"
            value={date}
            readOnly={compact}
            onChange={(e) => changeDate(e.target.value)}
          />
        </label>
        {!compact && (
          <>
            <button
              type="button"
              aria-label="다음 날짜"
              disabled={!day}
              onClick={() => moveDate(1)}
            >
              ›
            </button>
            <button type="button" onClick={() => changeDate(localDate())}>
              오늘
            </button>
          </>
        )}
        <button
          type="button"
          className="daily-roster-save"
          disabled={!day?.students.length || (!!savedDay && !pendingCount)}
          onClick={() =>
            day && save(day, '전체 명단 저장 완료 · 출결 미확인은 그대로 유지했습니다.')
          }
        >
          전체 명단 반영{pendingCount > 0 && ` · ${pendingCount}명`}
        </button>
      </div>
      <div className="daily-counts" aria-label="전체 출결 요약">
        <b>전체 {sorted.length}명</b>
        {statuses.map(([status, label]) => (
          <span key={status} data-status={status}>
            {label} <strong>{sorted.filter((s) => s.status === status).length}</strong>
          </span>
        ))}
      </div>
      <div className="daily-filters">
        <label>
          <span>학생 찾기</span>
          <input
            type="search"
            placeholder="이름·학년·반·번호"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected([]);
            }}
          />
        </label>
        <label>
          <span>표시 학급</span>
          <select
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setSelected([]);
            }}
          >
            <option value="all">전체 학년·반</option>
            {groups.map((g) => (
              <option key={groupKey(g)} value={groupKey(g)}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>표시 출결</span>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected([]);
            }}
          >
            <option value="all">전체 출결</option>
            {statuses.map(([status, label]) => (
              <option key={status} value={status}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="daily-bulk"
        role="group"
        aria-label="선택 학생 일괄 처리"
        hidden={!selectedIds.length}
      >
        <b>{selectedIds.length}명 선택</b>
        {statuses.map(([status, label]) => (
          <button
            type="button"
            key={status}
            disabled={!selectedIds.length}
            aria-label={`선택 학생 ${label}`}
            onClick={() => mark(selectedIds, status)}
          >
            {label}
          </button>
        ))}
        <button type="button" disabled={!selected.length} onClick={() => setSelected([])}>
          선택 해제
        </button>
      </div>
      <div className="daily-tools">
        <span>
          표시 {rows.length} / 전체 {sorted.length}명
        </span>
        <button
          type="button"
          disabled={!rows.some((s) => s.status === 'unmarked')}
          onClick={() =>
            mark(
              rows.filter((s) => s.status === 'unmarked').map((s) => s.playerId),
              'present',
            )
          }
        >
          표시 명단의 미확인 학생 모두 출석
        </button>
      </div>
      <p className="daily-feedback" role="status">
        {feedback ||
          (pendingCount > 0
            ? `새 명단 ${pendingCount}명 · 출결을 누르거나 ‘전체 명단 반영’으로 저장하세요.`
            : '출결 변경은 자동 저장됩니다. 미확인은 자동 출석 처리하지 않습니다.')}
      </p>
      {error && (
        <p role="alert">
          {error} · 저장되지 않은 변경은 적용하지 않았습니다. 선택한 학생은 유지되니 다시
          시도하세요.
        </p>
      )}
      {!day ? (
        <p>올바른 수업 날짜를 선택하세요.</p>
      ) : !sorted.length ? (
        <p>등록된 학생이 없습니다. 선수 & 팀에서 학생을 등록하세요.</p>
      ) : (
        <div
          className="daily-table-scroll"
          role="region"
          aria-label="일별 전체 출석 명단"
          tabIndex={0}
        >
          <table className="daily-table">
            <thead>
              <tr>
                <th>
                  <label className="daily-check">
                    <input
                      type="checkbox"
                      aria-label="표시 학생 전체 선택"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.length > 0 && !allSelected;
                      }}
                      onChange={(e) =>
                        setSelected(e.target.checked ? rows.map((s) => s.playerId) : [])
                      }
                    />
                  </label>
                </th>
                <th scope="col">학년·반</th>
                <th scope="col">번호</th>
                <th scope="col">이름</th>
                {statuses.map(([status, label]) => (
                  <th scope="col" key={status}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.playerId}
                  aria-label={`${s.name} 출결`}
                  data-selected={selectedIds.includes(s.playerId)}
                >
                  <td>
                    <label className="daily-check">
                      <input
                        type="checkbox"
                        aria-label={`${groupLabel(s)} ${s.studentNumber ?? '미설정'}번 ${s.name} 선택`}
                        checked={selectedIds.includes(s.playerId)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.playerId]
                              : selected.filter((id) => id !== s.playerId),
                          )
                        }
                      />
                    </label>
                  </td>
                  <td>
                    {s.grade === 'unset' ? '미설정' : s.grade + '학년'}
                    <br />
                    {s.classroom === 'unset' ? '반 미설정' : s.classroom + '반'}
                  </td>
                  <td>{s.studentNumber ?? '—'}</td>
                  <th scope="row">
                    {s.name}
                    <small>
                      등번호 {s.number}
                      {data.players.find((p) => p.id === s.playerId)?.archivedAt
                        ? ' · 삭제 명단'
                        : ''}
                    </small>
                  </th>
                  {statuses.map(([status, label]) => (
                    <td key={status}>
                      <button
                        type="button"
                        aria-label={label}
                        aria-pressed={s.status === status}
                        data-status={status}
                        onClick={() => mark([s.playerId], status)}
                      >
                        <span aria-hidden="true">{s.status === status ? '✓ ' : ''}</span>
                        {label}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p>조건에 맞는 학생이 없습니다. 검색이나 표시 조건을 바꿔 주세요.</p>}
        </div>
      )}
      {day && (
        <details
          className="daily-history"
          open={showHistory}
          onToggle={(e) => setShowHistory(e.currentTarget.open)}
        >
          <summary>출석 변경 이력 · {day.history.length}건</summary>
          {showHistory && (
            <>
              {[...day.history]
                .reverse()
                .slice(0, historyLimit)
                .map((h) => (
                  <p key={h.id}>
                    {day.students.find((s) => s.playerId === h.playerId)?.name ?? '이전 학생'} ·{' '}
                    {ATTENDANCE_LABELS[h.before]} → {ATTENDANCE_LABELS[h.after]} ·{' '}
                    {new Date(h.at).toLocaleString('ko-KR')}
                  </p>
                ))}
              {day.history.length > historyLimit && (
                <button type="button" onClick={() => setHistoryLimit(historyLimit + 50)}>
                  이전 이력 50건 더 보기
                </button>
              )}
            </>
          )}
        </details>
      )}
    </section>
  );
}
