import type { Position, Ability } from '../config/positions';
import type { ErrorType } from '../config/recording';
export const DEFENSE_ACTIONS = [
  'ground-catch',
  'fly-catch',
  'catch-fail',
  'throw',
  'bad-throw',
  'receive',
  'receive-fail',
  'tag-out',
  'force-out',
  'base',
  'fielders-choice',
] as const;
export type DefenseAction = (typeof DEFENSE_ACTIONS)[number];
export interface DefenseStep {
  id: string;
  playerId: string;
  position: Position;
  action: DefenseAction;
  targetBase: 1 | 2 | 3 | 'home' | null;
  runnerId: string | null;
  catchSkill: Extract<Ability, 'G' | 'F'> | null;
  errorType: ErrorType | null;
  assistIds: string[];
}
