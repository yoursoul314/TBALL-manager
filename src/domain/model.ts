import type { DefenseStep } from './defense';
import type { BattingData } from './batting';
import type { ErrorType, TeamworkCategory } from '../config/recording';
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
  grade?: 1 | 2 | 3 | null;
  classroom?: string | null;
  studentNumber?: number | null;
  primaryPosition?: Position | null;
  secondaryPosition?: Position | null;
  note?: string;
}
export interface Team {
  archivedAt?: string | null;
  archiveHistory?: { action: 'archive' | 'restore'; at: string }[];
  id: Id;
  name: string;
  color: string;
}
export type EntryStatus = 'starter' | 'reserve' | 'not-playing' | 'absent' | 'unavailable';
export interface EntryPlayer extends Player {
  status: EntryStatus;
}
export interface GameEntry {
  capturedAt: string;
  source: 'manager' | 'legacy';
  approvedBy: string | null;
  teams: Record<Side, Team>;
  players: Record<Side, EntryPlayer[]>;
  defense: Record<Side, Partial<Record<Position, Id>>>;
}
export interface Game {
  id: Id;
  name: string;
  createdAt: string;
  playedOn?: string | null;
  dateStatus?: 'confirmed' | 'estimated' | 'unset';
  startTime?: string | null;
  note?: string;
  formation?: 'TYPE1';
  entry?: GameEntry;
  archivedAt?: string | null;
  archiveHistory?: { action: 'archive' | 'restore'; at: string }[];
  dateHistory?: { before: string | null; after: string; changedAt: string; author: string }[];
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
  success: boolean | null;
  difficulty?: 'routine' | 'challenging' | 'difficult' | null;
  position: Position;
}
export type BatResult =
  | 'single'
  | 'double'
  | 'triple'
  | 'home-run'
  | 'out'
  | 'error'
  | 'fielders-choice'
  | 'sacrifice-fly';
export type Direction = 'left' | 'center' | 'right';
export type Quality = 'ground' | 'line' | 'fly';

export type Distance = 'near' | 'middle' | 'far';
export type Strength = 'strong' | 'normal' | 'weak';
/** Individually identified facts within one atomic, umpire-ended play. */
export type PlayDetail = { id: Id } & (
  | { type: 'FIELDERS_CHOICE'; targetRunnerId: Id }
  | { type: 'RBI'; runnerId: Id }
  | { type: 'DEFENSIVE_ERROR'; playerId: Id; errorType: ErrorType; note: string }
  | { type: 'ERROR_ADVANCE'; playerId: Id; from: 0 | Base; to: Base | 'home'; errorId: Id }
  | {
      type: 'FIELDING_ACTION';
      playerId: Id;
      position: Position;
      action: 'receive' | 'throw' | 'base' | 'out';
      success: boolean | null;
      difficulty?: 'routine' | 'challenging' | 'difficult' | null;
      runnerId?: Id;
    }
  | { type: 'DEFENSIVE_CREDIT'; playerId: Id; credit: 'putout' | 'assist'; runnerId: Id }
);
export interface EndPlayPayload {
  type: 'END_PLAY';
  defenseSequence?: DefenseStep[];
  endedBy: 'umpire-time';
  result: BatResult;
  outcomes: RunnerOutcome[];
  direction: Direction | null;
  quality: Quality | null;
  fielding: FieldingObservation[];
  distance?: Distance | null;
  strength?: Strength | null;
  details?: PlayDetail[];
  /** Positions at the moment the ball leaves the field; explicit umpire ruling, never inferred. */
  safetyAward?: { positionsAtThrow: Record<Id, 0 | Base> };
}
export type EventPayload =
  | { type: 'PITCH'; call: 'strike' | 'foul' }
  | { type: 'START_PLAY' }
  | EndPlayPayload
  | {
      type: 'REVISE_PLAY';
      targetId: Id;
      reason: string;
      author: string;
      replacement: EndPlayPayload;
    }
  | { type: 'TEMP_RUNNER'; originalId: Id; replacementId: Id; approvedBy: string }
  | { type: 'SUBSTITUTE'; side: Side; slot: number; playerId: Id }
  | { type: 'DEFENSE'; side: Side; assignments: Partial<Record<Position, Id>> }
  | { type: 'RUNNER_VIOLATION'; playerId: Id; violation: 'lead' | 'steal' | 'slide' }
  | { type: 'FINISH_GAME'; reason: string }
  | { type: 'RETRACT'; targetId: Id; reason: string };
export interface GameEvent {
  schemaVersion: 1 | 2 | 3;
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
  direction?: Direction | null;
  quality?: Quality | null;
  distance?: Distance | null;
  strength?: Strength | null;
  details?: PlayDetail[];
  cancelledAdvances: boolean;
}
export interface GameState {
  inning: number;
  side: Side;
  appearances: number;
  batted: Record<Side, Id[]>;
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
export interface LegacyTeamworkObservation {
  id: Id;
  playerId: Id;
  gameId: Id | null;
  recordedAt: string;
  category: 'communication' | 'support' | 'responsibility' | 'respect';
  score: number;
  note: string;
  observer: string;
}

export interface TeamworkObservation {
  id: Id;
  playerId: Id;
  gameId: Id | null;
  recordedAt: string;
  category: TeamworkCategory;
  opportunity: 'offered' | 'not-offered';
  outcome: 'performed' | 'partial' | 'not-performed' | 'unobserved';
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
export interface Workspace extends BattingData {
  schemaVersion: 6;
  migrationSource?: { schemaVersion: 2 | 3 | 4 | 5; raw: string };
  legacyTeamwork: LegacyTeamworkObservation[];
  legacySource?: { schemaVersion: 1; raw: string };
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
