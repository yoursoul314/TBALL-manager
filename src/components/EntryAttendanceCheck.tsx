import type { Workspace } from '../domain/model';
import type { MatchEntryDrafts } from '../domain/randomEntry';
import {
  attendanceRows,
  entryCoverage,
  fillAttendanceEntries,
  groupKey,
  groupLabel,
  unlistedClassStudents,
} from '../domain/attendance';
import { AttendanceView } from './AttendanceView';
export function EntryAttendanceCheck({
  data,
  date,
  groups,
  onGroups,
  entries,
  onEntries,
  onSave,
}: {
  data: Workspace;
  date: string;
  groups: string[];
  onGroups: (v: string[]) => void;
  entries: MatchEntryDrafts;
  onEntries: (v: MatchEntryDrafts) => void;
  onSave?: (d: Workspace) => void;
}) {
  const day = data.classDays.find((d) => d.date === date),
    rows = attendanceRows(day, groups),
    check = entryCoverage(data, rows, entries);
  const unlisted = unlistedClassStudents(data, day, groups);
  return (
    <section className="entry-attendance-check" aria-label="당일 수업 명단 확인">
      <h3>{date} · 출석·편성 누락 확인</h3>
      <p>
        해당 수업의 학급을 선택하세요. 출석·지각 학생은 선발 또는 교체 후보에 포함하고,
        결석·조퇴·활동 제한은 출전에서 제외합니다.
      </p>
      {day && (
        <div className="button-row">
          {day.groups.map((g) => (
            <label className="check" key={groupKey(g)}>
              <input
                type="checkbox"
                checked={groups.includes(groupKey(g))}
                onChange={(e) =>
                  onGroups(
                    e.target.checked
                      ? [...groups, groupKey(g)]
                      : groups.filter((k) => k !== groupKey(g)),
                  )
                }
              />
              {groupLabel(g)} 수업 대상
            </label>
          ))}
        </div>
      )}
      {!day && <p className="callout amber">먼저 이 날짜의 출석부를 만드세요.</p>}
      {!!unlisted.length && (
        <p role="alert">
          출석부 생성 후 등록된 학생: {unlisted.map((p) => p.name).join(' · ')}. 아래 출석부에서
          해당 학급을 선택하고 ‘학급 명단 추가·새 학생 반영’을 누른 뒤 출석을 확인하세요.
        </p>
      )}
      {!!rows.length && (
        <>
          <p role="status">
            수업 대상 {rows.length}명 · 출전 대상 {check.eligible.length}명 · 편성{' '}
            {check.assigned.length}명 · 누락 {check.missing.length}명 · 미확인 출석{' '}
            {check.unmarked.length}명 · 결석/활동 제한 등 {check.excluded.length}명
          </p>
          {!!check.missing.length && (
            <p className="callout amber">미편성: {check.missing.map((s) => s.name).join(' · ')}</p>
          )}
          {!!check.conflicts.length && (
            <p role="alert">
              출전 제외 학생이 편성되어 있습니다: {check.conflicts.map((s) => s.name).join(' · ')}
            </p>
          )}
          <button
            type="button"
            disabled={!!check.unmarked.length}
            onClick={() => onEntries(fillAttendanceEntries(data, rows, entries))}
          >
            출석 기준 적용 · 누락 학생 모두 편성
          </button>
          <small>
            출석 대상인 기존 선발·타순은 유지합니다. 빈 선발 자리를 채우고 나머지는 양 팀 교체
            후보로 배정합니다. 후보 편성은 실제 출전을 뜻하지 않습니다.
          </small>
        </>
      )}
      {onSave && (
        <details>
          <summary>출석부 생성·수정</summary>
          <AttendanceView key={date} data={data} onSave={onSave} initialDate={date} compact />
        </details>
      )}
    </section>
  );
}
