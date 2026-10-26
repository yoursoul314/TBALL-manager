import { validateDefenseSequence } from './defenseSequence';
import { validateEntry } from '../domain/roster';
import { validateDetails } from './details';
import { POSITIONS } from '../config/positions';
import { RULES_VERSION } from '../config/rules';
import type {
  Base,
  Bases,
  Game,
  GameEvent,
  GameState,
  Id,
  PlateAppearance,
  Side,
} from '../domain/model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function initialState(game: Game): GameState {
  validateEntry(game);
  assert(game.rulesVersion === RULES_VERSION, '지원하지 않는 경기 규칙 버전');
  assert(
    Number.isInteger(game.innings) && game.innings > 0 && game.innings <= 20,
    '이닝은 1~20 정수',
  );
  assert(game.teamIds.away !== game.teamIds.home, '서로 다른 두 팀이 필요합니다');
  for (const side of ['away', 'home'] as const) {
    assert(game.lineups[side].length > 0, '타순이 비어 있습니다');
    assert(new Set(game.lineups[side]).size === game.lineups[side].length, '타순 중복');
    assert(new Set(game.rosters[side]).size === game.rosters[side].length, '명단 중복');
    assert(
      game.lineups[side].every((id) => game.rosters[side].includes(id)),
      '타순 선수가 명단에 없습니다',
    );
  }
  assert(
    !game.rosters.away.some((id) => game.rosters.home.includes(id)),
    '양 팀에 동일 선수가 있습니다',
  );
  return {
    inning: 1,
    side: 'away',
    appearances: 0,
    batted: { away: [], home: [] },
    strikes: 0,
    outs: 0,
    status: 'playing',
    ball: 'dead',
    lineups: structuredClone(game.lineups),
    bases: { away: {}, home: {} },
    completed: { away: 0, home: 0 },
    defense: structuredClone(game.entry?.defense ?? { away: {}, home: {} }),
    plays: [],
  };
}
export function currentBatter(state: GameState): Id {
  return state.lineups[state.side][state.appearances];
}
export function dueRunner(state: GameState): Id | null {
  const batter = currentBatter(state);
  return Object.values(state.bases[state.side]).includes(batter) ? batter : null;
}
function completeAppearance(state: GameState, game: Game, play: PlateAppearance) {
  assert(
    !state.batted[state.side].includes(play.batterId),
    'RULE01: 같은 공격 이닝에 동일 학생이 중복 타격할 수 없습니다',
  );
  state.batted[state.side].push(play.batterId);
  state.plays.push(play);
  state.appearances++;
  state.strikes = 0;
  state.ball = 'dead';
  delete state.live;
  // Outs are recorded, but NEVER drive an inning switch (RULE01).
  if (state.appearances === state.lineups[state.side].length) {
    state.completed[state.side] = state.inning;
    state.appearances = 0;
    state.outs = 0;
    if (state.side === 'away') {
      state.side = 'home';
      state.batted.home = [];
    } else if (state.inning === game.innings) state.status = 'finished';
    else {
      state.side = 'away';
      state.inning++;
      state.batted.away = [];
    }
  }
}
function apply(state: GameState, game: Game, event: GameEvent) {
  const p = event.payload;
  assert(state.status === 'playing', '이미 종료된 경기입니다');
  const side = state.side;
  const batterId = currentBatter(state);
  if (p.type === 'PITCH' || p.type === 'START_PLAY')
    assert(
      !state.batted[side].includes(batterId),
      'RULE01: 같은 공격 이닝에 동일 학생이 중복 타격할 수 없습니다',
    );
  const dead = () => assert(state.ball === 'dead', '볼 데드 상태에서만 가능합니다');
  switch (p.type) {
    case 'PITCH': {
      dead();
      assert(!dueRunner(state), 'RULE06: 감독이 임시주자를 지정해야 합니다');
      state.strikes++;
      if (state.strikes === 3) {
        state.outs++;
        completeAppearance(state, game, {
          eventId: event.id,
          inning: state.inning,
          side,
          batterId,
          result: 'strikeout',
          runs: [],
          outcomes: [],
          fielding: [],
          cancelledAdvances: false,
        });
      }
      return;
    }
    case 'START_PLAY': {
      dead();
      assert(!dueRunner(state), 'RULE06: 감독이 임시주자를 지정해야 합니다');
      state.ball = 'live';
      state.live = {
        batterId,
        bases: { ...state.bases[side] },
        lastBatter: state.appearances === state.lineups[side].length - 1,
      };
      return;
    }
    case 'END_PLAY': {
      assert(state.ball === 'live' && state.live, '먼저 타구 발생을 기록하세요');
      assert(p.endedBy === 'umpire-time', 'RULE05: 심판 타임으로 플레이를 종료합니다');
      const before = state.live.bases;
      const participants = [...Object.values(before), batterId];
      assert(p.outcomes.length === participants.length, '타자와 모든 주자의 결과를 기록하세요');
      assert(
        new Set(p.outcomes.map((o) => o.playerId)).size === participants.length,
        '주자 결과 중복',
      );
      assert(
        p.outcomes.every((o) => participants.includes(o.playerId)),
        '플레이에 없는 주자',
      );
      const batterOutcome = p.outcomes.find((o) => o.playerId === batterId)!;
      assert(
        (p.result === 'out' || p.result === 'sacrifice-fly') === (batterOutcome.to === 'out'),
        '타격 결과와 타자 결과가 일치하지 않습니다',
      );
      const hitBase = { single: 1, double: 2, triple: 3, 'home-run': 4 }[
        p.result as 'single' | 'double' | 'triple' | 'home-run'
      ];
      if (hitBase) {
        const destination = batterOutcome.to === 'home' ? 4 : Number(batterOutcome.to);
        assert(destination >= hitBase, '안타 종류보다 적은 베이스에 도달했습니다');
      }
      const occupied = new Set<number>();
      const after: Bases = {};
      const runs: Id[] = [];
      for (const o of p.outcomes) {
        const startBase = Number(
          Object.entries(before).find(([, id]) => id === o.playerId)?.[0] ?? 0,
        );
        const forbidden = ['lead', 'steal', 'slide'].includes(o.action);
        if (forbidden)
          assert(
            o.to === 'out' && o.outReason === o.action,
            'RULE04: 리드·도루·슬라이딩 위반 주자는 아웃',
          );
        if (o.to === 'out') {
          assert(o.outReason && o.outAt, '아웃 종류와 발생 베이스를 기록하세요');
          assert(o.outReason !== 'strikeout', '삼진은 스트라이크 기록으로 처리하세요');
          if (o.outReason === 'lead' || o.outReason === 'steal' || o.outReason === 'slide')
            assert(o.action === o.outReason, '위반 행동과 아웃 사유 불일치');
          state.outs++;
        } else {
          const target = o.to === 'home' ? 4 : o.to;
          assert(target >= startBase, '이전 베이스로 이동할 수 없습니다');
          if (o.action === 'hold')
            assert(target === startBase, '잔류는 현재 베이스에만 가능합니다');
          if (o.action === 'overrun')
            assert(
              o.intentToAdvance === false && o.to !== 'home',
              '오버런 인정은 추가 진루 의사 없는 1~3루에 한합니다',
            );
          if (o.action === 'tag-up') assert(p.quality === 'fly', '태그업은 뜬공 상황에 기록하세요');
          if (o.to === 'home') runs.push(o.playerId);
          else {
            assert(!occupied.has(o.to), '한 베이스에 두 주자가 있습니다');
            occupied.add(o.to);
            after[o.to] = o.playerId;
          }
        }
      }
      if (p.safetyAward) {
        const entries = Object.entries(p.safetyAward.positionsAtThrow);
        assert(entries.length > 0, '안전진루권 판정 대상이 없습니다');
        for (const [id, from] of entries) {
          assert(
            participants.includes(id) && Number.isInteger(from) && from >= 0 && from <= 3,
            '잘못된 악송구 시점 주자 위치',
          );
          const outcome = p.outcomes.find((o) => o.playerId === id)!;
          const to = outcome.to === 'home' ? 4 : outcome.to === 'out' ? -1 : outcome.to;
          assert(to >= from + 1, 'RULE05: 경기장 밖 악송구 안전진루권 1개를 반영하세요');
        }
      }
      const defendingSide: Side = side === 'away' ? 'home' : 'away';
      assert(
        p.fielding.every((o) => game.rosters[defendingSide].includes(o.playerId)),
        '수비 기록의 선수가 상대 팀 명단에 없습니다',
      );
      validateDetails(p, before, batterId, game, side);
      validateDefenseSequence(state, p);
      const rollback =
        state.live.lastBatter &&
        batterOutcome.to === 'out' &&
        batterOutcome.outReason === 'force' &&
        batterOutcome.outAt === 1;
      state.bases[side] = rollback ? { ...before } : after;
      completeAppearance(state, game, {
        eventId: event.id,
        inning: state.inning,
        side,
        batterId,
        result: p.result,
        runs: rollback ? [] : runs,
        outcomes: rollback ? [] : p.outcomes,
        fielding: p.fielding,
        direction: p.direction,
        quality: p.quality,
        distance: p.distance,
        strength: p.strength,
        details: p.details,
        cancelledAdvances: rollback,
      });
      return;
    }
    case 'TEMP_RUNNER': {
      dead();
      assert(
        dueRunner(state) === p.originalId,
        'RULE06: 타순이 도래한 잔루 주자만 임시주자로 바꿀 수 있습니다',
      );
      assert(p.approvedBy.trim(), '감독 지정자를 기록하세요');
      assert(
        p.replacementId !== p.originalId && game.rosters[side].includes(p.replacementId),
        '같은 팀의 다른 선수를 지정하세요',
      );
      assert(
        !Object.values(state.bases[side]).includes(p.replacementId),
        '이미 베이스에 있는 선수입니다',
      );
      const base = Number(
        Object.entries(state.bases[side]).find(([, id]) => id === p.originalId)![0],
      ) as Base;
      state.bases[side][base] = p.replacementId;
      return; // Lineup remains unchanged.
    }
    case 'SUBSTITUTE': {
      dead();
      assert(
        Number.isInteger(p.slot) && p.slot >= 0 && p.slot < state.lineups[p.side].length,
        '유효하지 않은 타순 자리',
      );
      assert(game.rosters[p.side].includes(p.playerId), '팀 명단에 없는 선수');
      assert(!state.lineups[p.side].includes(p.playerId), '이미 출전 중인 선수입니다');
      assert(
        !Object.values(state.bases[p.side]).includes(p.playerId),
        '이미 주자로 출전 중인 선수입니다',
      );
      assert(
        !(
          p.side === side &&
          p.slot >= state.appearances &&
          state.batted[side].includes(p.playerId)
        ),
        'RULE01: 이미 타격한 학생을 같은 공격 이닝의 남은 타순에 넣을 수 없습니다',
      );
      const previous = state.lineups[p.side][p.slot];
      state.lineups[p.side][p.slot] = p.playerId;
      for (const [base, id] of Object.entries(state.bases[p.side])) {
        if (id === previous) state.bases[p.side][Number(base) as Base] = p.playerId;
      }
      for (const position of POSITIONS) {
        if (state.defense[p.side][position] === previous)
          state.defense[p.side][position] = p.playerId;
      }
      return;
    }
    case 'DEFENSE': {
      dead();
      const ids = Object.values(p.assignments);
      assert(new Set(ids).size === ids.length, '수비 포지션 중복 배치');
      assert(
        ids.every((id) => state.lineups[p.side].includes(id)),
        '수비에는 출전 타순의 선수만 배치하세요',
      );
      state.defense[p.side] = { ...p.assignments };
      return;
    }
    case 'RUNNER_VIOLATION': {
      dead();
      const entry = Object.entries(state.bases[side]).find(([, id]) => id === p.playerId);
      assert(entry, '베이스에 없는 주자입니다');
      delete state.bases[side][Number(entry[0]) as Base];
      state.outs++;
      return;
    }
    case 'FINISH_GAME':
      dead();
      assert(p.reason.trim(), '경기 종료 사유를 기록하세요');
      state.status = 'finished';
      return;
    case 'REVISE_PLAY':
    case 'RETRACT':
      throw new Error('RETRACT는 재생 전 처리해야 합니다');
  }
}
/** Original envelopes remain unchanged; revisions replace only the replay projection. */
export function effectiveEvents(events: GameEvent[]): GameEvent[] {
  const active: GameEvent[] = [];
  for (const event of events) {
    const p = event.payload;
    if (p.type === 'REVISE_PLAY') {
      assert(p.reason.trim() && p.author.trim(), '수정 사유와 작성자가 필요합니다');
      const index = active.findIndex((e) => e.id === p.targetId);
      assert(
        index >= 0 && active[index].payload.type === 'END_PLAY',
        '수정 대상 플레이가 없거나 취소되었습니다',
      );
      active[index] = { ...active[index], payload: structuredClone(p.replacement) };
    } else if (p.type === 'RETRACT') {
      assert(p.reason.trim(), '정정 사유가 필요합니다');
      assert(active.at(-1)?.id === p.targetId, '가장 최근 유효 이벤트부터 정정하세요');
      active.pop();
    } else active.push(event);
  }
  return active;
}
/** Reconstruct the target's actual context using all effective historical corrections. */
export function stateBeforeEvent(game: Game, events: GameEvent[], targetId: Id) {
  const state = initialState(game);
  for (const event of effectiveEvents(events)) {
    if (event.id === targetId) return state;
    apply(state, game, event);
  }
  throw new Error('대상 이벤트가 없습니다');
}
export function replayGame(game: Game, events: GameEvent[]): GameState {
  const state = initialState(game);
  const ids = new Set<string>();
  events.forEach((event, index) => {
    assert(
      event.schemaVersion === 1 || event.schemaVersion === 2 || event.schemaVersion === 3,
      '지원하지 않는 이벤트 버전',
    );
    assert(event.gameId === game.id, '다른 경기의 이벤트');
    assert(event.sequence === index + 1, '이벤트 순서 누락 또는 충돌');
    assert(!ids.has(event.id), '중복 이벤트 ID');
    ids.add(event.id);
  });
  for (const event of effectiveEvents(events)) apply(state, game, event);
  return state;
}
export function scoreboard(state: GameState) {
  const completedInnings = Math.min(state.completed.away, state.completed.home);
  const total = { away: 0, home: 0 };
  const official = { away: 0, home: 0 };
  for (const play of state.plays) {
    total[play.side] += play.runs.length;
    if (play.inning <= completedInnings) official[play.side] += play.runs.length;
  }
  return {
    total,
    official,
    completedInnings,
    result:
      state.status !== 'finished'
        ? 'in-progress'
        : completedInnings === 0
          ? 'no-completed-inning'
          : official.away === official.home
            ? 'tie'
            : official.away > official.home
              ? 'away'
              : 'home',
  };
}
