import type { Player, Workspace } from './model';
import type { MatchEntryDrafts } from './randomEntry';
export const ATTENDANCE_LABELS = {
  unmarked: '미확인',
  present: '출석',
  absent: '결석',
  late: '지각',
  left: '조퇴',
  restricted: '활동 제한',
} as const;
export type AttendanceStatus = keyof typeof ATTENDANCE_LABELS;
export interface ClassGroup {
  grade: string;
  classroom: string;
}
export const groupKey = (g: ClassGroup) => JSON.stringify([g.grade, g.classroom]);
export const playerGroup = (p: Pick<Player, 'grade' | 'classroom'>): ClassGroup => ({
  grade: p.grade == null ? 'unset' : String(p.grade),
  classroom: p.classroom?.trim() || 'unset',
});
export const groupLabel = (g: ClassGroup) =>
  `${g.grade === 'unset' ? '학년 미설정' : g.grade + '학년'} · ${g.classroom === 'unset' ? '반 미설정' : g.classroom + '반'}`;
export interface ClassStudent extends ClassGroup {
  playerId: string;
  name: string;
  number: number;
  studentNumber?: number | null;
  status: AttendanceStatus;
}
export interface ClassDay {
  id: string;
  date: string;
  groups: ClassGroup[];
  students: ClassStudent[];
  createdAt: string;
  updatedAt: string;
  history: {
    id: string;
    at: string;
    playerId: string;
    before: AttendanceStatus;
    after: AttendanceStatus;
  }[];
}
export interface EntryAttendance {
  dayId: string;
  date: string;
  groups: ClassGroup[];
  checkedAt: string;
  students: (ClassStudent & { eligible: boolean })[];
}
export function isAttendanceDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
/** Prepare the whole daily roster without writing storage or changing historical snapshots. */
export function prepareDailyAttendance(
  data: Workspace,
  date: string,
  at = new Date().toISOString(),
): ClassDay {
  if (!isAttendanceDate(date)) throw new Error('올바른 수업 날짜를 선택하세요');
  const old = data.classDays.find((d) => d.date === date);
  const next: ClassDay = old
    ? structuredClone(old)
    : {
        id: crypto.randomUUID(),
        date,
        groups: [],
        students: [],
        history: [],
        createdAt: at,
        updatedAt: at,
      };
  const ids = new Set(next.students.map((s) => s.playerId));
  const groups = new Set(next.groups.map(groupKey));
  for (const p of data.players) {
    if (p.archivedAt || ids.has(p.id)) continue;
    const group = playerGroup(p);
    if (!groups.has(groupKey(group))) {
      next.groups.push(group);
      groups.add(groupKey(group));
    }
    next.students.push({
      playerId: p.id,
      name: p.name,
      number: p.number,
      studentNumber: p.studentNumber ?? null,
      ...group,
      status: 'unmarked',
    });
    ids.add(p.id);
    next.updatedAt = at;
  }
  return next;
}
export function sortAttendanceStudents(students: ClassStudent[]) {
  const compareGroup = (a: string, b: string) =>
    a === b
      ? 0
      : a === 'unset'
        ? 1
        : b === 'unset'
          ? -1
          : a.localeCompare(b, 'ko', { numeric: true });
  return [...students].sort(
    (a, b) =>
      compareGroup(a.grade, b.grade) ||
      compareGroup(a.classroom, b.classroom) ||
      (a.studentNumber ?? Infinity) - (b.studentNumber ?? Infinity) ||
      a.name.localeCompare(b.name, 'ko', { numeric: true }) ||
      a.playerId.localeCompare(b.playerId),
  );
}
export function addClassGroup(
  data: Workspace,
  date: string,
  group: ClassGroup,
  at = new Date().toISOString(),
): ClassDay {
  if (!isAttendanceDate(date)) throw new Error('올바른 수업 날짜를 선택하세요');
  const students = data.players.filter(
    (p) => !p.archivedAt && groupKey(playerGroup(p)) === groupKey(group),
  );
  if (!students.length) throw new Error('선택한 학년·반에 등록된 학생이 없습니다');
  const old = data.classDays.find((d) => d.date === date);
  const next: ClassDay = old
    ? structuredClone(old)
    : {
        id: crypto.randomUUID(),
        date,
        groups: [],
        students: [],
        history: [],
        createdAt: at,
        updatedAt: at,
      };
  if (!next.groups.some((g) => groupKey(g) === groupKey(group))) next.groups.push(group);
  for (const p of students)
    if (!next.students.some((s) => s.playerId === p.id))
      next.students.push({
        playerId: p.id,
        name: p.name,
        number: p.number,
        studentNumber: p.studentNumber ?? null,
        ...playerGroup(p),
        status: 'unmarked',
      });
  next.updatedAt = at;
  return next;
}
export function markAttendance(
  day: ClassDay,
  ids: string[],
  status: AttendanceStatus,
  at = new Date().toISOString(),
): ClassDay {
  const next = structuredClone(day);
  const selected = new Set(ids);
  for (const row of next.students)
    if (selected.has(row.playerId) && row.status !== status) {
      next.history.push({
        id: crypto.randomUUID(),
        at,
        playerId: row.playerId,
        before: row.status,
        after: status,
      });
      row.status = status;
    }
  next.updatedAt = at;
  return next;
}
export function attendanceRows(day: ClassDay | undefined, groups: string[]) {
  return day?.students.filter((s) => groups.includes(groupKey(s))) ?? [];
}
export function unlistedClassStudents(
  data: Workspace,
  day: ClassDay | undefined,
  groups: string[],
) {
  return data.players.filter(
    (p) =>
      !p.archivedAt &&
      groups.includes(groupKey(playerGroup(p))) &&
      !day?.students.some((s) => s.playerId === p.id),
  );
}
export function entryCoverage(data: Workspace, rows: ClassStudent[], entries: MatchEntryDrafts) {
  const roster = new Set(
    (['away', 'home'] as const).flatMap((side) =>
      entries[side].assigned.filter((id) =>
        ['starter', 'reserve'].includes(entries[side].status[id]),
      ),
    ),
  );
  const active = (id: string) => data.players.some((p) => p.id === id && p.active && !p.archivedAt);
  const eligible = rows.filter((s) => ['present', 'late'].includes(s.status) && active(s.playerId));
  const excluded = rows.filter((s) => s.status !== 'unmarked' && !eligible.includes(s));
  return {
    eligible,
    excluded,
    unmarked: rows.filter((s) => s.status === 'unmarked'),
    missing: eligible.filter((s) => !roster.has(s.playerId)),
    conflicts: excluded.filter((s) => roster.has(s.playerId)),
    assigned: eligible.filter((s) => roster.has(s.playerId)),
  };
}
export function fillAttendanceEntries(
  data: Workspace,
  rows: ClassStudent[],
  entries: MatchEntryDrafts,
): MatchEntryDrafts {
  const coverage = entryCoverage(data, rows, entries);
  if (coverage.unmarked.length) throw new Error('미확인 출석을 먼저 체크하세요');
  const next = structuredClone(entries);
  for (const row of coverage.excluded)
    for (const side of ['away', 'home'] as const) {
      const e = next[side];
      if (!e.assigned.includes(row.playerId)) continue;
      e.status[row.playerId] = row.status === 'absent' ? 'absent' : 'unavailable';
      e.lineup = e.lineup.filter((id) => id !== row.playerId);
      e.defense = Object.fromEntries(
        Object.entries(e.defense).filter(([, id]) => id !== row.playerId),
      );
    }
  const count = (side: 'away' | 'home') =>
    next[side].assigned.filter((id) => ['starter', 'reserve'].includes(next[side].status[id]))
      .length;
  for (const row of coverage.missing) {
    const previous = (['away', 'home'] as const).find((side) =>
      next[side].assigned.includes(row.playerId),
    );
    const side =
      previous ??
      (next.away.lineup.length !== next.home.lineup.length
        ? next.away.lineup.length < next.home.lineup.length
          ? 'away'
          : 'home'
        : count('away') <= count('home')
          ? 'away'
          : 'home');
    const e = next[side];
    e.loaded = true;
    if (!e.assigned.includes(row.playerId)) e.assigned.push(row.playerId);
    e.status[row.playerId] = e.lineup.length < 10 ? 'starter' : 'reserve';
    if (e.status[row.playerId] === 'starter' && !e.lineup.includes(row.playerId))
      e.lineup.push(row.playerId);
  }
  // Fill vacancies from already registered reserves too (e.g. absence corrected after import).
  const eligibleIds = new Set(coverage.eligible.map((s) => s.playerId));
  for (const side of ['away', 'home'] as const) {
    const e = next[side],
      other = side === 'away' ? 'home' : 'away';
    while (e.lineup.length < 10) {
      const own = e.assigned.find((id) => eligibleIds.has(id) && e.status[id] === 'reserve');
      const id =
        own ??
        next[other].assigned.find(
          (id) => eligibleIds.has(id) && next[other].status[id] === 'reserve',
        );
      if (!id) break;
      if (!own) {
        next[other].assigned = next[other].assigned.filter((v) => v !== id);
        delete next[other].status[id];
        e.assigned.push(id);
      }
      e.status[id] = 'starter';
      e.lineup.push(id);
      e.loaded = true;
    }
  }
  return next;
}
