import type { Game, GameEvent, EvaluationPolicy, Id } from '../domain/model';
import { replayGame, scoreboard, effectiveEvents } from '../engine/game';
export interface PlayerStats {
  playerId: Id;
  pa: number;
  atBats: number;
  hits: number;
  totalBases: number;
  strikeouts: number;
  runs: number;
  battingAverage: number | null;
  fieldingAttempts: number;
  fieldingSuccesses: number;
  advances: number;
  runningOuts: number;
  violations: number;
  directions: Record<string, number>;
  qualities: Record<string, number>;
  fieldingTypes: Record<string, number>;
  runningTypes: Record<string, number>;
}
export function calculateStats(
  game: Game,
  events: GameEvent[],
  policy: EvaluationPolicy,
  scope: 'record' | 'selection' = 'record',
) {
  const state = replayGame(game, events);
  const rows = new Map<Id, PlayerStats>();
  const row = (id: Id) => {
    if (!rows.has(id))
      rows.set(id, {
        playerId: id,
        pa: 0,
        atBats: 0,
        hits: 0,
        totalBases: 0,
        strikeouts: 0,
        runs: 0,
        battingAverage: null,
        fieldingAttempts: 0,
        fieldingSuccesses: 0,
        advances: 0,
        runningOuts: 0,
        violations: 0,
        directions: {},
        qualities: {},
        fieldingTypes: {},
        runningTypes: {},
      });
    return rows.get(id)!;
  };
  const common = scoreboard(state).completedInnings;
  const include = (inning: number) =>
    scope === 'record' || policy.incompleteInnings.value === 'include' || inning <= common;
  const increment = (record: Record<string, number>, key: string) => {
    record[key] = (record[key] || 0) + 1;
  };
  for (const play of state.plays) {
    if (!include(play.inning)) continue;
    const batter = row(play.batterId);
    batter.pa++;
    if (!(play.result === 'sacrifice-fly' && policy.sacrificeFly.value === 'exclude-from-at-bats'))
      batter.atBats++;
    const bases =
      { single: 1, double: 2, triple: 3, 'home-run': 4 }[
        play.result as 'single' | 'double' | 'triple' | 'home-run'
      ] || 0;
    if (bases) {
      batter.hits++;
      batter.totalBases += bases;
    }
    if (play.result === 'strikeout') batter.strikeouts++;
    if (play.direction) increment(batter.directions, play.direction);
    if (play.quality) increment(batter.qualities, play.quality);
    for (const id of play.runs) row(id).runs++;
    for (const observation of play.fielding) {
      const fielder = row(observation.playerId);
      fielder.fieldingAttempts++;
      if (observation.success) fielder.fieldingSuccesses++;
      increment(fielder.fieldingTypes, observation.skill);
    }
    for (const outcome of play.outcomes) {
      // A caught fly is a batting out, not a base-running attempt.
      if (outcome.playerId === play.batterId && outcome.outReason === 'fly') continue;
      const runner = row(outcome.playerId);
      increment(runner.runningTypes, outcome.action);
      if (outcome.to === 'out') runner.runningOuts++;
      else if (outcome.action !== 'hold' && outcome.action !== 'overrun') runner.advances++;
      if (['lead', 'steal', 'slide'].includes(outcome.action)) runner.violations++;
    }
  }
  for (const event of effectiveEvents(events)) {
    if (event.payload.type !== 'RUNNER_VIOLATION') continue;
    // Prefix replay gives the event's actual inning, including substitutions/corrections.
    const before = replayGame(game, events.slice(0, event.sequence - 1));
    if (!include(before.inning)) continue;
    const runner = row(event.payload.playerId);
    runner.runningOuts++;
    runner.violations++;
    increment(runner.runningTypes, event.payload.violation);
  }
  for (const r of rows.values()) r.battingAverage = r.atBats ? r.hits / r.atBats : null;
  return {
    rows: [...rows.values()],
    provisional:
      policy.sacrificeFly.status === 'TODO' ||
      (scope === 'selection' && policy.incompleteInnings.status === 'TODO'),
    policyVersion: policy.version,
  };
}
