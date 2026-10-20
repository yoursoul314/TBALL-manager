export const DISTANCES = ['near', 'middle', 'far'] as const;
export const DIRECTIONS = ['left', 'center', 'right'] as const;
export const STRENGTHS = ['strong', 'normal', 'weak'] as const;
export const DIRECTION_LABELS = { left: '좌', center: '중', right: '우' } as const;
export const DISTANCE_LABELS = { near: '근거리', middle: '중거리', far: '원거리' } as const;
export const STRENGTH_LABELS = { strong: '강', normal: '보통', weak: '약' } as const;
export const ERROR_LABELS = {
  'ground-fielding': '땅볼 처리',
  'fly-drop': '뜬공 낙구',
  receiving: '송구 포구',
  'throw-direction': '송구 방향',
  'throw-distance': '송구 거리·강도',
  'base-handling': '베이스 처리',
  judgment: '상황 판단',
  other: '기타',
} as const;
export type ErrorType = keyof typeof ERROR_LABELS;
export const TEAMWORK_WEIGHTS = {
  communication: 25,
  coverBackup: 25,
  roleExecution: 20,
  teammateSupport: 15,
  teamTactics: 15,
} as const;
export type TeamworkCategory = keyof typeof TEAMWORK_WEIGHTS;
export const TEAMWORK_LABELS: Record<TeamworkCategory, string> = {
  communication: '의사소통',
  coverBackup: '커버·백업',
  roleExecution: '역할수행',
  teammateSupport: '동료지원',
  teamTactics: '공동전술',
};
