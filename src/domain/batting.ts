import type { Direction, Distance, Quality, Strength } from './model';
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
  createdAt: string;
  updatedAt: string;
}
export interface BattingAssessmentAttempt {
  id: string;
  sessionId: string;
  attemptNumber: number;
  result: AssessmentResult | null;
  directionZone: DirectionZone | null;
  trajectory: Quality | null;
  intensity: Strength | null;
  contactQuality: ContactQuality | null;
  score: number | null;
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
export interface BattingData {
  battingSessions: BattingAssessmentSession[];
  battingAttempts: BattingAssessmentAttempt[];
  battingAudit: BattingAudit[];
  battingSettings: BattingSettings;
}
