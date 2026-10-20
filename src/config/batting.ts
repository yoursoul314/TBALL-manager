import type { BattingData } from '../domain/batting';
import { DIRECTIONS, DISTANCES, DIRECTION_LABELS, DISTANCE_LABELS } from './recording';
export const ZONES = DIRECTIONS.flatMap((d) => DISTANCES.map((r) => `${d}-${r}` as const));
export const TRAJECTORY_LABELS = { ground: '땅볼', line: '직선타', fly: '뜬공' } as const;
export const CONTACT_LABELS = { solid: '정타', normal: '보통', mishit: '빗맞음' } as const;
export const RESULT_LABELS = { fair: '정상 타격', foul: '파울', miss: '헛스윙' } as const;
export const SESSION_LABELS = {
  'in-progress': '진행 중',
  completed: '완료',
  cancelled: '취소',
} as const;
export const zoneLabel = (zone: string | null) => {
  if (!zone) return '—';
  const [d, r] = zone.split('-');
  return `${DIRECTION_LABELS[d as keyof typeof DIRECTION_LABELS]} ${DISTANCE_LABELS[r as keyof typeof DISTANCE_LABELS]}`;
};
export function emptyBattingData(): BattingData {
  return {
    battingSessions: [],
    battingAttempts: [],
    battingAudit: [],
    battingSettings: {
      scoreSource: 'detailed',
      currentZoneVersion: 'zone-unset-v1',
      zoneDefinitions: [
        {
          version: 'zone-unset-v1',
          near: '현장 기준 미설정',
          middle: '현장 기준 미설정',
          far: '현장 기준 미설정',
        },
      ],
      classification: {
        minimumBalls: 15,
        strongRatio: null,
        solidRatio: null,
        sideRatio: null,
        spreadMaxRatio: null,
      },
    },
  };
}
