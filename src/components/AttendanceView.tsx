import { useState } from 'react';
import type { Workspace } from '../domain/model';
import { localDate } from '../domain/roster';
import {
  ATTENDANCE_LABELS,
  addClassGroup,
  markAttendance,
  groupKey,
  groupLabel,
  playerGroup,
  type AttendanceStatus,
  type ClassDay,
} from '../domain/attendance';
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
  const [date, setDate] = useState(initialDate ?? localDate()),
    [group, setGroup] = useState(''),
    [filter, setFilter] = useState('all'),
    [error, setError] = useState('');
  const groups = [
    ...new Map(
      data.players
        .filter((p) => !p.archivedAt)
        .map((p) => [groupKey(playerGroup(p)), playerGroup(p)]),
    ).values(),
  ];
  const day = data.classDays.find((d) => d.date === date),
    rows = day?.students.filter((s) => filter === 'all' || groupKey(s) === filter) ?? [];
  const save = (next: ClassDay) => {
    try {
      onSave({ ...data, classDays: [...data.classDays.filter((d) => d.id !== next.id), next] });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '출석 저장 실패');
    }
  };
  const mark = (ids: string[], status: AttendanceStatus) => {
    if (day) save(markAttendance(day, ids, status));
  };
  return (
    <section className={'attendance-view ' + (compact ? 'compact' : '')} aria-label="수업 출석부">
      <h2>수업 출석부</h2>
      <p>
        학년·반 전체 명단으로 출석을 확인합니다. 미확인은 자동 출석 처리하지 않습니다. 변경 즉시
        기기에 저장하고 정정 이력을 남깁니다.
      </p>
      <div className="form-row">
        <label>
          수업 날짜
          <input
            aria-label="출석 날짜"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFilter('all');
            }}
          />
        </label>
        <label>
          학년·반
          <select
            aria-label="출석 학년·반"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">수업 학급 선택</option>
            {groups.map((g) => (
              <option key={groupKey(g)} value={groupKey(g)}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!group || !date}
          onClick={() => {
            try {
              save(addClassGroup(data, date, groups.find((g) => groupKey(g) === group)!));
              setFilter(group);
            } catch (e) {
              setError(e instanceof Error ? e.message : '명단 생성 실패');
            }
          }}
        >
          학급 명단 추가·새 학생 반영
        </button>
      </div>
      {day && (
        <>
          <div className="tabs">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              전체 학급
            </button>
            {day.groups.map((g) => (
              <button
                type="button"
                key={groupKey(g)}
                aria-pressed={filter === groupKey(g)}
                onClick={() => setFilter(groupKey(g))}
              >
                {groupLabel(g)}
              </button>
            ))}
          </div>
          <p role="status">
            대상 {rows.length}명 · 출석/지각{' '}
            {rows.filter((s) => ['present', 'late'].includes(s.status)).length}명 · 결석/조퇴/제한{' '}
            {rows.filter((s) => ['absent', 'left', 'restricted'].includes(s.status)).length}명 ·
            미확인 {rows.filter((s) => s.status === 'unmarked').length}명
          </p>
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
          <div className="attendance-students">
            {rows.map((s) => (
              <div
                key={s.playerId}
                className="attendance-student"
                role="group"
                aria-label={s.name + ' 출석'}
              >
                <b>
                  {s.name}{' '}
                  <small>
                    {groupLabel(s)} ·{' '}
                    {s.studentNumber ? `${s.studentNumber}번` : `등번호 ${s.number}`}
                    {data.players.find((p) => p.id === s.playerId)?.archivedAt
                      ? ' · 삭제 명단'
                      : ''}
                  </small>
                </b>
                <div>
                  {(Object.entries(ATTENDANCE_LABELS) as [AttendanceStatus, string][]).map(
                    ([status, label]) => (
                      <button
                        type="button"
                        key={status}
                        aria-pressed={s.status === status}
                        onClick={() => mark([s.playerId], status)}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
          <details>
            <summary>출석 변경 이력 · {day.history.length}건</summary>
            {[...day.history].reverse().map((h) => (
              <p key={h.id}>
                {day.students.find((s) => s.playerId === h.playerId)?.name ?? '이전 학생'} ·{' '}
                {ATTENDANCE_LABELS[h.before]} → {ATTENDANCE_LABELS[h.after]} ·{' '}
                {new Date(h.at).toLocaleString('ko-KR')}
              </p>
            ))}
          </details>
        </>
      )}
      {!day && <p>이 날짜의 출석부가 없습니다. 학급을 선택해 명단을 만드세요.</p>}
      {error && <p role="alert">{error} · 저장되지 않은 변경은 적용하지 않았습니다.</p>}
    </section>
  );
}
