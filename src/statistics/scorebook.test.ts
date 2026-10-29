import { expect, it } from 'vitest';
import { game, record } from '../test/fixtures';
import { createDemoWorkspace } from '../data/seed';
import { buildScorebook } from './scorebook';
import { calculateStats } from './calculate';
import type { EndPlayPayload } from '../domain/model';

it('인쇄는 정정·취소된 원본 대신 유효 플레이, 득점·타점·타순을 읽고 원본을 변경하지 않음', () => {
  const r = record();
  r.hit('home-run');
  const original = structuredClone(r.events[1]);
  const replacement: EndPlayPayload = {
    ...(original.payload as EndPlayPayload),
    details: [{ id: 'rbi', type: 'RBI', runnerId: 'a1' }],
  };
  r.add({
    type: 'REVISE_PLAY',
    targetId: original.id,
    author: 'QA',
    reason: '종이 타점 확인',
    replacement,
  });
  r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a4' });
  r.strikeout();
  const d = { ...createDemoWorkspace(), games: [game], events: r.events };
  const before = structuredClone(d);
  const book = buildScorebook(game, d);
  expect(book.plays.map((p) => [p.code, p.slot, p.rbi])).toEqual([
    ['HR', 1, 1],
    ['K', 2, 0],
  ]);
  expect(book.plays[1].batterId).toBe('a4');
  expect(book.plays[1].pitches).toBe('S·F·F');
  expect(book.changes[0].text).toContain('2번 a2 → a4');
  expect(book.score.total.away).toBe(1);
  expect(calculateStats(game, r.events, d.policy).rows.find((p) => p.playerId === 'a1')?.rbi).toBe(
    book.plays[0].rbi,
  );
  expect(d).toEqual(before);
  expect(r.events[1]).toEqual(original);
});

it('마지막 타자 포스아웃의 취소 득점은 인쇄·타점에도 포함되지 않음', () => {
  const r = record();
  r.hit();
  r.strikeout();
  r.add({ type: 'START_PLAY' });
  r.add({
    type: 'END_PLAY',
    endedBy: 'umpire-time',
    result: 'out',
    direction: null,
    quality: null,
    fielding: [],
    outcomes: [
      { playerId: 'a1', to: 'home', action: 'advance' },
      { playerId: 'a3', to: 'out', outAt: 1, outReason: 'force', action: 'advance' },
    ],
    details: [{ id: 'rbi', type: 'RBI', runnerId: 'a1' }],
  });
  const book = buildScorebook(game, { ...createDemoWorkspace(), events: r.events });
  expect(book.plays.at(-1)).toMatchObject({ rbi: 0, runs: [], cancelledAdvances: true });
  expect(book.plays.at(-1)?.runners).toContain('직전 잔루 복구');
  expect(book.score.total.away).toBe(0);
});
