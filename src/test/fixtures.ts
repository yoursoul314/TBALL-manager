import { RULES_VERSION } from '../config/rules';
import { replayGame } from '../engine/game';
import type { EventPayload, Game, GameEvent } from '../domain/model';
export const game: Game = {
  id: 'test',
  name: '테스트 경기',
  createdAt: '2026-10-20T00:00:00.000Z',
  innings: 2,
  rulesVersion: RULES_VERSION,
  teamIds: { away: 'a', home: 'h' },
  rosters: { away: ['a1', 'a2', 'a3', 'a4', 'a5'], home: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  lineups: { away: ['a1', 'a2', 'a3'], home: ['h1', 'h2', 'h3'] },
};
export function record(g: Game = game) {
  const events: GameEvent[] = [];
  const add = (payload: EventPayload) => {
    const next: GameEvent = {
      schemaVersion: 1,
      id: 'e' + (events.length + 1),
      gameId: g.id,
      sequence: events.length + 1,
      deviceId: 'test',
      recordedAt: g.createdAt,
      payload,
    };
    replayGame(g, [...events, next]);
    events.push(next);
    return replayGame(g, events);
  };
  const strikeout = () => {
    add({ type: 'PITCH', call: 'strike' });
    add({ type: 'PITCH', call: 'foul' });
    return add({ type: 'PITCH', call: 'foul' });
  };
  const hit = (result: 'single' | 'home-run' = 'single') => {
    const state = replayGame(g, events);
    const batter = state.lineups[state.side][state.appearances];
    add({ type: 'START_PLAY' });
    return add({
      type: 'END_PLAY',
      endedBy: 'umpire-time',
      result,
      direction: 'center',
      quality: 'line',
      fielding: [],
      outcomes: [
        ...Object.values(state.bases[state.side]).map((id) => ({
          playerId: id,
          to: 'home' as const,
          action: 'advance' as const,
        })),
        { playerId: batter, to: result === 'single' ? 1 : 'home', action: 'advance' },
      ],
    });
  };
  return { events, add, strikeout, hit, state: () => replayGame(g, events) };
}
