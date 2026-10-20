import type { Ability, Position } from '../config/positions';
import type { RULES_VERSION } from '../config/rules';

export type Id = string;
export type Side = 'away' | 'home';
export type Base = 1 | 2 | 3;
export type Bases = Partial<Record<Base, Id>>;
export interface Player {
  id: Id;
  teamId: Id;
  name: string;
  number: number;
  active: boolean;
}
export interface Team {
  id: Id;
  name: string;
  color: string;
}
export interface Game {
  id: Id;
  name: string;
  createdAt: string;
  innings: number;
  rulesVersion: typeof RULES_VERSION;
  teamIds: Record<Side, Id>;
  rosters: Record<Side, Id[]>;
  lineups: Record<Side, Id[]>;
}
export type OutReason = 'force' | 'tag' | 'fly' | 'strikeout' | 'lead' | 'steal' | 'slide';
export type RunnerAction = 'advance' | 'tag-up' | 'overrun' | 'hold' | 'lead' | 'steal' | 'slide';
export interface RunnerOutcome {
  playerId: Id;
  to: Base | 'home' | 'out';
  action: RunnerAction;
  outReason?: OutReason;
  outAt?: Base | 'home';
  intentToAdvance?: boolean;
}
export interface FieldingObservation {
  playerId: Id;
  skill: Ability;
  success: boolean;
  position: Position;
}
export type BatResult =
  | 'single'
  | 'double'
  | 'triple'
  | 'home-run'
  | 'out'
  | 'error'
  | 'sacrifice-fly';
export type Direction = 'left' | 'center' | 'right';
export type Quality = 'ground' | 'line' | 'fly';
export type EventPayload =
  | { type: 'PITCH'; call: 'strike' | 'foul' }
  | { type: 'START_PLAY' }
  | {
      type: 'END_PLAY';
      endedBy: 'umpire-time';
      result: BatResult;
      outcomes: RunnerOutcome[];
      direction: Direction;
      quality: Quality;
      fielding: FieldingObservation[];
      /** Positions at the moment the ball leaves the field; explicit umpire ruling, never inferred. */
      safetyAward?: { positionsAtThrow: Record<Id, 0 | Base> };
    }
  | { type: 'TEMP_RUNNER'; originalId: Id; replacementId: Id; approvedBy: string }
  | { type: 'SUBSTITUTE'; side: Side; slot: number; playerId: Id }
  | { type: 'DEFENSE'; side: Side; assignments: Partial<Record<Position, Id>> }
  | { type: 'RUNNER_VIOLATION'; playerId: Id; violation: 'lead' | 'steal' | 'slide' }
  | { type: 'FINISH_GAME'; reason: string }
  | { type: 'RETRACT'; targetId: Id; reason: string };
export interface GameEvent {
  schemaVersion: 1;
  id: Id;
  gameId: Id;
  sequence: number;
  deviceId: string;
  recordedAt: string;
  payload: EventPayload;
}
export interface PlateAppearance {
  eventId: Id;
  inning: number;
  side: Side;
  batterId: Id;
  result: BatResult | 'strikeout';
  runs: Id[];
  outcomes: RunnerOutcome[];
  fielding: FieldingObservation[];
  direction?: Direction;
  quality?: Quality;
  cancelledAdvances: boolean;
}
export interface GameState {
  inning: number;
  side: Side;
  appearances: number;
  strikes: number;
  outs: number;
  status: 'playing' | 'finished';
  ball: 'dead' | 'live';
  lineups: Record<Side, Id[]>;
  bases: Record<Side, Bases>;
  completed: Record<Side, number>;
  defense: Record<Side, Partial<Record<Position, Id>>>;
  plays: PlateAppearance[];
  live?: { batterId: Id; bases: Bases; lastBatter: boolean };
}
export type Domain = 'batting' | 'defense' | 'running' | 'teamwork';
export interface Decision<T> {
  status: 'TODO' | 'confirmed';
  value: T;
  note: string;
}
export interface EvaluationPolicy {
  version: string;
  domainWeights: Decision<Record<Domain, number>>;
  battingMix: Decision<{ skill: number; game: number }>;
  defenseMix: Decision<{ skill: number; game: number }>;
  runningMix: { readonly skill: 40; readonly game: 60 };
  conversion: Decision<'manual-0-100' | 'table'>;
  sacrificeFly: Decision<'exclude-from-at-bats' | 'include-in-at-bats'>;
  incompleteInnings: Decision<'include' | 'exclude'>;
}
export interface Assessment {
  id: Id;
  playerId: Id;
  recordedAt: string;
  assessor: string;
  abilities: Partial<Record<Ability, number>>;
  battingSkill: number | null;
  runningSkill: number | null;
  rawMeasurements: { metric: string; value: number; unit: string }[];
}
export interface TeamworkObservation {
  id: Id;
  playerId: Id;
  gameId: Id | null;
  recordedAt: string;
  category: 'communication' | 'support' | 'responsibility' | 'respect';
  score: number;
  note: string;
  observer: string;
}
export interface Selection {
  id: Id;
  teamId: Id;
  createdAt: string;
  policyVersion: string;
  sourceRevision: number;
  assignments: { position: Position; playerId: Id; score: number }[];
  status: 'draft' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
}
export interface Workspace {
  schemaVersion: 1;
  revision: number;
  teams: Team[];
  players: Player[];
  games: Game[];
  events: GameEvent[];
  assessments: Assessment[];
  teamwork: TeamworkObservation[];
  selections: Selection[];
  policy: EvaluationPolicy;
}
