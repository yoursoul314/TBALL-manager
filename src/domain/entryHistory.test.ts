import { expect, it } from 'vitest';
import { createDemoWorkspace } from '../data/seed';
import { captureLegacyEntry } from './roster';
import { copyGameEntry } from './entryHistory';
import { POSITIONS } from '../config/positions';
function fixture() {
  const d = createDemoWorkspace(),
    g = d.games[0];
  g.entry = captureLegacyEntry(g, d);
  g.entry!.captains = { away: 'green-1', home: 'orange-1' };
  for (const side of ['away', 'home'] as const)
    g.entry!.defense[side] = Object.fromEntries(POSITIONS.map((p, i) => [p, g.lineups[side][i]]));
  return d;
}
it('지난 경기 시작 편성·주장·후보·타순·수비를 복사하되 원본은 공유·수정하지 않는다', () => {
  const d = fixture(),
    before = structuredClone(d),
    copied = copyGameEntry(d, 'demo-game');
  expect(copied.captains).toEqual(d.games[0].entry!.captains);
  expect(copied.entries.away.lineup).toEqual(d.games[0].lineups.away);
  expect(copied.entries.away.status['green-11']).toBe('reserve');
  expect(copied.entries.home.defense).toEqual(d.games[0].entry!.defense.home);
  copied.entries.away.lineup.reverse();
  copied.entries.home.defense.SS = 'orange-1';
  copied.teams.away = 'changed';
  expect(d).toEqual(before);
});
it('이전 주장·수비가 없으면 추정하지 않고 안내하며 저장된 후보도 보존한다', () => {
  const copied = copyGameEntry(createDemoWorkspace(), 'demo-game');
  expect(copied.captains).toEqual({});
  expect(copied.entries.away.defense).toEqual({});
  expect(copied.entries.away.assigned).toHaveLength(12);
  expect(copied.warnings.join(' ')).toContain('주장 정보');
});
it('현재 삭제·출전 불가 학생을 제외하고 빈자리·주장을 안내하며 과거 결석을 보존한다', () => {
  const d = fixture();
  d.players[0].archivedAt = new Date().toISOString();
  d.players[1].active = false;
  d.games[0].entry!.players.away.find((p) => p.id === 'green-12')!.status = 'absent';
  d.games[0].rosters.away = d.games[0].rosters.away.filter((id) => id !== 'green-12');
  const before = structuredClone(d),
    copied = copyGameEntry(d, 'demo-game');
  expect(copied.entries.away.lineup).toHaveLength(8);
  expect(copied.entries.away.assigned).not.toContain('green-1');
  expect(copied.entries.away.status['green-2']).toBe('unavailable');
  expect(copied.entries.away.status['green-12']).toBe('absent');
  expect(copied.captains.away).toBeUndefined();
  expect(Object.values(copied.entries.away.defense)).not.toContain('green-1');
  expect(d).toEqual(before);
});
it('휴지통 경기·삭제 팀·불명확한 중복 명단은 조용히 복원하지 않고 거절한다', () => {
  const d = fixture();
  d.games[0].archivedAt = new Date().toISOString();
  expect(() => copyGameEntry(d, 'demo-game')).toThrow('지난 경기');
  d.games[0].archivedAt = null;
  d.teams[0].archivedAt = new Date().toISOString();
  expect(() => copyGameEntry(d, 'demo-game')).toThrow('팀이 삭제');
  d.teams[0].archivedAt = null;
  d.games[0].entry = undefined;
  d.games[0].rosters.home.push('green-1');
  expect(() => copyGameEntry(d, 'demo-game')).toThrow('중복');
});
