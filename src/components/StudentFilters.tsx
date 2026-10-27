import type { Player } from '../domain/model';
import { classroomOptions, type StudentFilter } from '../domain/studentFilter';
export function StudentFilters({
  players,
  value,
  onChange,
  prefix,
  disabled = false,
}: {
  players: Player[];
  value: StudentFilter;
  onChange: (v: StudentFilter) => void;
  prefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-row student-filters">
      <label>
        학년
        <select
          aria-label={prefix + ' 학년'}
          disabled={disabled}
          value={value.grade}
          onChange={(e) => onChange({ ...value, grade: e.target.value, classroom: 'all' })}
        >
          <option value="all">전체 학년</option>
          {[1, 2, 3].map((g) => (
            <option key={g} value={g}>
              {g}학년
            </option>
          ))}
          <option value="unset">학년 미설정</option>
        </select>
      </label>
      <label>
        반
        <select
          aria-label={prefix + ' 반'}
          disabled={disabled}
          value={value.classroom}
          onChange={(e) => onChange({ ...value, classroom: e.target.value })}
        >
          <option value="all">전체 반</option>
          {classroomOptions(players, value.grade).map((c) => (
            <option key={c} value={c}>
              {c}반
            </option>
          ))}
          <option value="unset">반 미설정</option>
        </select>
      </label>
      <label>
        학생 검색
        <input
          aria-label={prefix + ' 검색'}
          disabled={disabled}
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="이름·등번호·학생 번호"
        />
      </label>
    </div>
  );
}
