import type { Player } from './model';
export interface StudentFilter {
  grade: string;
  classroom: string;
  search: string;
}
export const emptyStudentFilter = (): StudentFilter => ({
  grade: 'all',
  classroom: 'all',
  search: '',
});
export function filterStudents(players: Player[], filter: StudentFilter) {
  const query = filter.search.trim().toLocaleLowerCase();
  return players.filter(
    (p) =>
      (filter.grade === 'all' || (p.grade == null ? 'unset' : String(p.grade)) === filter.grade) &&
      (filter.classroom === 'all' || (p.classroom?.trim() || 'unset') === filter.classroom) &&
      (!query ||
        [
          p.name,
          p.number,
          p.studentNumber ?? '',
          p.grade == null ? '미설정' : p.grade + '학년',
          p.classroom ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)),
  );
}
export function classroomOptions(players: Player[], grade: string) {
  return [
    ...new Set(
      players
        .filter((p) => grade === 'all' || (p.grade == null ? 'unset' : String(p.grade)) === grade)
        .map((p) => p.classroom?.trim())
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
}
