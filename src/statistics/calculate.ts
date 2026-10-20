import type { Game, GameEvent, EvaluationPolicy, Id } from '../domain/model';
import { replayGame, scoreboard, effectiveEvents, stateBeforeEvent } from '../engine/game';
import { homeRunQualityKey } from './homeRuns';
export interface PlayerStats {
  playerId: Id;
  pa: number;
  atBats: number;
  hits: number;
  homeRuns: number;
  homeRunQualities: Record<string, number>;
  totalBases: number;
  strikeouts: number;
  runs: number;
  rbi: number;
  fieldersChoices: number;
  putouts: number;
  assists: number;
  errors: number;
  errorAdvanceBases: number;
  zones: Record<string, number>;
  strengths: Record<string, number>;
  errorsByType: Record<string, number>;
  fieldingActions: Record<string, number>;
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
        homeRuns: 0,
        homeRunQualities: {},
        totalBases: 0,
        strikeouts: 0,
        runs: 0,
        rbi: 0,
        fieldersChoices: 0,
        putouts: 0,
        assists: 0,
        errors: 0,
        errorAdvanceBases: 0,
        zones: {},
        strengths: {},
        errorsByType: {},
        fieldingActions: {},
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
    if (play.result === 'home-run') {
      batter.homeRuns++;
      if (play.quality)
        increment(batter.homeRunQualities, homeRunQualityKey(play.quality, play.strength));
    }
    if (play.result === 'fielders-choice') batter.fieldersChoices++;
    if (play.direction && play.distance)
      increment(batter.zones, play.direction + '-' + play.distance);
    if (play.strength) increment(batter.strengths, play.strength);
    for (const detail of play.details ?? []) {
      if (detail.type === 'RBI' && play.runs.includes(detail.runnerId)) batter.rbi++;
      if (detail.type === 'DEFENSIVE_CREDIT')
        row(detail.playerId)[detail.credit === 'putout' ? 'putouts' : 'assists']++;
      if (detail.type === 'DEFENSIVE_ERROR') {
        row(detail.playerId).errors++;
        increment(row(detail.playerId).errorsByType, detail.errorType);
      }
      if (detail.type === 'FIELDING_ACTION')
        increment(
          row(detail.playerId).fieldingActions,
          detail.action + ':' + (detail.success ? 'success' : 'failure'),
        );
      if (detail.type === 'ERROR_ADVANCE' && !play.cancelledAdvances)
        row(detail.playerId).errorAdvanceBases +=
          (detail.to === 'home' ? 4 : detail.to) - detail.from;
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
    const before = stateBeforeEvent(game, events, event.id);
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
