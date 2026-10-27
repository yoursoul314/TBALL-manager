import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { assignEntryBatch, type EntryDraft } from './entryBatch';
import { filterStudents, classroomOptions } from './studentFilter';
const blank = (): EntryDraft => ({
  loaded: true,
  assigned: [],
  status: {},
  lineup: [],
  defense: {},
});
it('학년과 반을 독립 필터링하고 미설정 학생을 임의 분류하지 않는다', () => {
  const p = createDemoWorkspace()
    .players.slice(0, 3)
    .map((p, i) => ({
      ...p,
      grade: i === 2 ? null : (2 as const),
      classroom: i === 0 ? '1' : i === 1 ? '2' : null,
    }));
  expect(filterStudents(p, { grade: '2', classroom: '1', search: '' }).map((p) => p.id)).toEqual([
    p[0].id,
  ]);
  expect(filterStudents(p, { grade: 'unset', classroom: 'unset', search: '' })).toEqual([p[2]]);
  expect(classroomOptions(p, '2')).toEqual(['1', '2']);
});
it('여러 학생을 순서대로 배정하되 중복을 제거한다', () => {
  const p = createDemoWorkspace().players;
  const result = assignEntryBatch(blank(), ['green-2', 'green-1', 'green-2'], 'starter', p, []);
  expect(result.lineup).toEqual(['green-2', 'green-1']);
  expect(result.assigned).toHaveLength(2);
  expect(assignEntryBatch(result, ['green-2'], 'reserve', p, []).lineup).toEqual(['green-1']);
});
it('10명 초과·상대 팀 중복·출전 불가를 원자적으로 차단한다', () => {
  const d = blank(),
    p = createDemoWorkspace().players;
  expect(() =>
    assignEntryBatch(
      d,
      p.slice(0, 11).map((p) => p.id),
      'starter',
      p,
      [],
    ),
  ).toThrow('10명');
  expect(() => assignEntryBatch(d, ['green-1', 'green-2'], 'starter', p, ['green-2'])).toThrow(
    '상대 팀',
  );
  p[0].active = false;
  expect(() => assignEntryBatch(d, ['green-1'], 'reserve', p, [])).toThrow('출전 불가');
  expect(d).toEqual(blank());
  expect(assignEntryBatch(d, ['green-1'], 'absent', p, []).status['green-1']).toBe('absent');
});
