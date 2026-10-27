import type { Direction, Distance, Quality, Strength } from './model';
export type BattingRubric = 'manual-ten-v1' | 'quality-six-v1';
export type BattingQualityGrade =
  | 'barrel'
  | 'solid'
  | 'weak-ground'
  | 'popup'
  | 'foul'
  | 'tee-miss';
export type DirectionZone = `${Direction}-${Distance}`;
export type AssessmentResult = 'fair' | 'foul' | 'miss';
export type ContactQuality = 'solid' | 'normal' | 'mishit';
export interface BattingAssessmentSession {
  id: string;
  playerId: string;
  date: string;
  sessionNumber: number;
  targetAttempts: number;
  assessor: string;
  purpose: string;
  note: string;
  status: 'in-progress' | 'completed' | 'cancelled';
  zoneDefinitionVersion: string;
  /** Missing only on preserved manual 1–10 sessions. Immutable after creation. */
  rubricVersion?: BattingRubric;
  createdAt: string;
  updatedAt: string;
}
export interface BattingAssessmentAttempt {
  id: string;
  sessionId: string;
  attemptNumber: number;
  result: AssessmentResult | null;
  /** Optional only on preserved v3 rows; never invent distance. */
  direction?: Direction | null;
  directionZone: DirectionZone | null;
  trajectory: Quality | null;
  intensity: Strength | null;
  contactQuality: ContactQuality | null;
  score: number | null;
  qualityGrade?: BattingQualityGrade | null;
  note: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}
export type BattingAudit = {
  id: string;
  changedAt: string;
  changedBy: string;
  reason: string;
} & (
  | {
      entity: 'session';
      originalId: string;
      before: BattingAssessmentSession | null;
      after: BattingAssessmentSession;
    }
  | {
      entity: 'attempt';
      originalId: string;
      before: BattingAssessmentAttempt | null;
      after: BattingAssessmentAttempt;
    }
);
export interface BattingSettings {
  scoreSource: 'detailed' | 'legacy';
  currentZoneVersion: string;
  zoneDefinitions: { version: string; near: string; middle: string; far: string }[];
  classification: {
    minimumBalls: number;
    strongRatio: number | null;
    solidRatio: number | null;
    sideRatio: number | null;
    spreadMaxRatio: number | null;
  };
}
export interface BattingAssessmentDay {
  rubricVersion?: BattingRubric;
  date: string;
  targetAttempts: number;
  assessor: string;
  purpose: string;
  note: string;
  createdAt: string;
}
export interface BattingData {
  battingDays: BattingAssessmentDay[];
  battingSessions: BattingAssessmentSession[];
  battingAttempts: BattingAssessmentAttempt[];
  battingAudit: BattingAudit[];
  battingSettings: BattingSettings;
}
