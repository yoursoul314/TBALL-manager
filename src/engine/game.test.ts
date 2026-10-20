import { describe, it, expect } from 'vitest';
import { game, record } from '../test/fixtures';
import { currentBatter, dueRunner, replayGame, scoreboard } from './game';
describe('확정 경기 규칙', () => {
  it('RULE01: 3아웃으로 교대하지 않고 전원 타격 후 교대한다', () => {
    const g = { ...game, lineups: { away: ['a1', 'a2', 'a3', 'a4'], home: ['h1', 'h2', 'h3'] } };
    const r = record(g);
    r.strikeout();
    r.strikeout();
    expect(r.strikeout().side).toBe('away');
    expect(r.state().outs).toBe(3);
    expect(r.strikeout().side).toBe('home');
  });
  it('RULE01: 공수교대와 다음 이닝에도 잔루를 승계한다', () => {
    const r = record();
    r.hit();
    r.strikeout();
    r.strikeout();
    expect(r.state().bases.away).toEqual({ 1: 'a1' });
    r.strikeout();
    r.strikeout();
    r.strikeout();
    expect(r.state().inning).toBe(2);
    expect(r.state().bases.away).toEqual({ 1: 'a1' });
  });
  it('RULE02: 마지막 타자 1루 포스아웃 시 해당 타격 진루·득점만 취소하고 직전 잔루를 복구한다', () => {
    const r = record();
    r.hit();
    r.hit();
    const before = r.state().bases.away;
    r.add({ type: 'START_PLAY' });
    const state = r.add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'out',
      direction: 'left',
      quality: 'ground',
      fielding: [],
      outcomes: [
        { playerId: 'a2', to: 'home', action: 'advance' },
        { playerId: 'a3', to: 'out', action: 'advance', outReason: 'force', outAt: 1 },
      ],
    });
    expect(state.bases.away).toEqual(before);
    expect(state.plays.at(-1)?.runs).toEqual([]);
    expect(scoreboard(state).total.away).toBe(1);
    expect(state.plays.at(-1)?.cancelledAdvances).toBe(true);
  });
  it.each(['tag', 'fly'] as const)(
    'RULE02: 마지막 타자 %s 아웃에는 진루 취소를 적용하지 않는다',
    (reason) => {
      const r = record();
      r.hit();
      r.strikeout();
      r.add({ type: 'START_PLAY' });
      const s = r.add({
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'out',
        direction: 'left',
        quality: reason === 'fly' ? 'fly' : 'ground',
        fielding: [],
        outcomes: [
          { playerId: 'a1', to: 'home', action: 'advance' },
          { playerId: 'a3', to: 'out', action: 'advance', outReason: reason, outAt: 1 },
        ],
      });
      expect(s.plays.at(-1)?.cancelledAdvances).toBe(false);
      expect(scoreboard(s).total.away).toBe(1);
    },
  );
  it('RULE02: 마지막 타자의 2루 포스아웃은 복구 대상이 아니다', () => {
    const r = record();
    r.hit();
    r.strikeout();
    r.add({ type: 'START_PLAY' });
    const s = r.add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'out',
      direction: 'center',
      quality: 'ground',
      fielding: [],
      outcomes: [
        { playerId: 'a1', to: 'home', action: 'advance' },
        { playerId: 'a3', to: 'out', action: 'advance', outReason: 'force', outAt: 2 },
      ],
    });
    expect(s.plays.at(-1)?.runs).toEqual(['a1']);
  });
  it('RULE03: 스트라이크 이후 파울도 누적되어 세 번째 스트라이크에 삼진 처리', () => {
    const r = record();
    expect(r.strikeout().plays[0].result).toBe('strikeout');
    expect(currentBatter(r.state())).toBe('a2');
    expect(r.state().strikes).toBe(0);
  });
  it.each(['lead', 'steal', 'slide'] as const)(
    'RULE04: %s 위반은 주자 아웃이며 타순은 유지한다',
    (violation) => {
      const r = record();
      r.hit();
      const s = r.add({ type: 'RUNNER_VIOLATION', playerId: 'a1', violation });
      expect(s.bases.away).toEqual({});
      expect(s.outs).toBe(1);
      expect(currentBatter(s)).toBe('a2');
    },
  );
  it('RULE04: 추가 진루 의사 없는 3루 오버런을 인정한다', () => {
    const r = record();
    r.add({ type: 'START_PLAY' });
    const s = r.add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'triple',
      direction: 'left',
      quality: 'line',
      fielding: [],
      outcomes: [{ playerId: 'a1', to: 3, action: 'overrun', intentToAdvance: false }],
    });
    expect(s.bases.away).toEqual({ 3: 'a1' });
  });
  it('RULE04: 추가 진루 의사가 있는 오버런은 자동 인정하지 않는다', () => {
    const r = record();
    r.add({ type: 'START_PLAY' });
    expect(() =>
      r.add({
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'left',
        quality: 'line',
        fielding: [],
        outcomes: [{ playerId: 'a1', to: 1, action: 'overrun', intentToAdvance: true }],
      }),
    ).toThrow('오버런');
  });
  it('RULE04: 뜬공 아웃 후 주자 태그업을 허용한다', () => {
    const r = record();
    r.hit();
    r.add({ type: 'START_PLAY' });
    const s = r.add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result: 'out',
      direction: 'center',
      quality: 'fly',
      fielding: [],
      outcomes: [
        { playerId: 'a1', to: 2, action: 'tag-up' },
        { playerId: 'a2', to: 'out', action: 'advance', outReason: 'fly', outAt: 1 },
      ],
    });
    expect(s.bases.away).toEqual({ 2: 'a1' });
  });
  it('RULE05: 심판 타임 이전에는 타석이 완료되지 않는다', () => {
    const r = record();
    const s = r.add({ type: 'START_PLAY' });
    expect(s.ball).toBe('live');
    expect(s.plays).toHaveLength(0);
    expect(() => r.add({ type: 'FINISH_GAME', reason: '종료' })).toThrow('볼 데드');
  });
  it('RULE05: 악송구 시점으로부터 안전진루권 1개를 검증한다', () => {
    const r = record();
    r.add({ type: 'START_PLAY' });
    expect(() =>
      r.add({
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'center',
        quality: 'ground',
        fielding: [],
        safetyAward: { positionsAtThrow: { a1: 1 } },
        outcomes: [{ playerId: 'a1', to: 1, action: 'advance' }],
      }),
    ).toThrow('안전진루권');
    expect(
      r.add({
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'center',
        quality: 'ground',
        fielding: [],
        safetyAward: { positionsAtThrow: { a1: 1 } },
        outcomes: [{ playerId: 'a1', to: 2, action: 'advance' }],
      }).bases.away,
    ).toEqual({ 2: 'a1' });
  });
  it('RULE06: 잔루 주자의 타순에서는 감독의 임시주자 지정이 필수이며 타순을 바꾸지 않는다', () => {
    const r = record();
    r.hit();
    r.strikeout();
    r.strikeout();
    r.strikeout();
    r.strikeout();
    r.strikeout();
    expect(dueRunner(r.state())).toBe('a1');
    expect(() => r.add({ type: 'PITCH', call: 'strike' })).toThrow('임시주자');
    const s = r.add({
      type: 'TEMP_RUNNER',
      originalId: 'a1',
      replacementId: 'a4',
      approvedBy: '감독',
    });
    expect(s.bases.away).toEqual({ 1: 'a4' });
    expect(s.lineups.away).toEqual(game.lineups.away);
    expect(currentBatter(s)).toBe('a1');
  });
  it('RULE07: 동일 완료 이닝만 승패에 반영하고 미완료 원본 점수는 보존한다', () => {
    const r = record();
    for (let i = 0; i < 6; i++) r.strikeout();
    r.hit('home-run');
    const s = r.add({ type: 'FINISH_GAME', reason: '수업 종료' });
    expect(scoreboard(s)).toMatchObject({
      completedInnings: 1,
      total: { away: 1, home: 0 },
      official: { away: 0, home: 0 },
      result: 'tie',
    });
  });
  it('RULE07: 0개의 동일 완료 이닝이면 승패 판정 없음', () => {
    const r = record();
    r.hit('home-run');
    expect(scoreboard(r.add({ type: 'FINISH_GAME', reason: '중단' })).result).toBe(
      'no-completed-inning',
    );
  });
  it('RULE07: 설정 이닝이 양 팀 모두 끝나야 자동 종료하며 콜드게임을 적용하지 않는다', () => {
    const g = { ...game, innings: 1 };
    const r = record(g);
    r.hit('home-run');
    r.hit('home-run');
    r.hit('home-run');
    expect(r.state().status).toBe('playing');
    r.strikeout();
    r.strikeout();
    expect(r.strikeout().status).toBe('finished');
    expect(scoreboard(r.state()).result).toBe('away');
  });
  it('RULE08: 볼 데드 때 타순 자리 승계와 무제한 재출전을 허용한다', () => {
    const r = record();
    r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a4' });
    expect(r.state().lineups.away[1]).toBe('a4');
    for (let i = 0; i < 3; i++) {
      r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a2' });
      r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a4' });
    }
    r.add({ type: 'START_PLAY' });
    expect(() => r.add({ type: 'SUBSTITUTE', side: 'away', slot: 1, playerId: 'a2' })).toThrow(
      '볼 데드',
    );
  });
  it('RULE08: 수비 위치 자유 변경, 중복 배치와 라이브 변경은 거부', () => {
    const r = record();
    r.add({ type: 'DEFENSE', side: 'home', assignments: { '1B': 'h1', P: 'h2' } });
    expect(() =>
      r.add({ type: 'DEFENSE', side: 'home', assignments: { '1B': 'h1', P: 'h1' } }),
    ).toThrow('중복');
    r.add({ type: 'DEFENSE', side: 'home', assignments: { P: 'h1', '1B': 'h2' } });
    r.add({ type: 'START_PLAY' });
    expect(() => r.add({ type: 'DEFENSE', side: 'home', assignments: { P: 'h1' } })).toThrow(
      '볼 데드',
    );
  });
});
describe('이벤트 무결성과 정정', () => {
  it('동일 원본 재생은 동일 상태이고 입력을 수정하지 않는다', () => {
    const r = record();
    r.hit();
    const original = JSON.stringify(r.events);
    expect(replayGame(game, r.events)).toEqual(replayGame(game, r.events));
    expect(JSON.stringify(r.events)).toBe(original);
  });
  it('최근 유효 이벤트 취소를 누적해도 원본 이벤트는 보존한다', () => {
    const r = record();
    r.hit();
    const before = r.events.length;
    r.add({ type: 'RETRACT', targetId: 'e2', reason: '오입력' });
    expect(r.state().ball).toBe('live');
    r.add({ type: 'RETRACT', targetId: 'e1', reason: '오입력' });
    expect(r.state().ball).toBe('dead');
    expect(r.events.length).toBe(before + 2);
  });
  it('이벤트 순서 충돌·중복·다른 경기 참조를 거부한다', () => {
    const r = record();
    r.strikeout();
    expect(() => replayGame(game, [{ ...r.events[0], sequence: 2 }])).toThrow('순서');
    expect(() => replayGame(game, [r.events[0], { ...r.events[1], id: r.events[0].id }])).toThrow(
      '중복',
    );
    expect(() => replayGame(game, [{ ...r.events[0], gameId: 'wrong' }])).toThrow('다른 경기');
  });
  it('두 주자가 한 베이스를 차지할 수 없다', () => {
    const r = record();
    r.hit();
    r.add({ type: 'START_PLAY' });
    expect(() =>
      r.add({
        type: 'END_PLAY',
        endedBy: 'umpire-time',
        result: 'single',
        direction: 'center',
        quality: 'ground',
        fielding: [],
        outcomes: [
          { playerId: 'a1', to: 1, action: 'hold' },
          { playerId: 'a2', to: 1, action: 'advance' },
        ],
      }),
    ).toThrow('두 주자');
  });
});
