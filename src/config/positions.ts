export const ABILITIES = ['G', 'F', 'C', 'A', 'L', 'Q', 'M', 'J', 'B'] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_LABELS: Record<Ability, string> = {
  G: '땅볼',
  F: '뜬공',
  C: '송구 포구',
  A: '송구 정확도',
  L: '송구 거리·강도',
  Q: '첫 반응',
  M: '수비 범위',
  J: '상황 판단',
  B: '베이스 처리',
};
export const POSITION_WEIGHTS_VERSION = 'TYPE1-v2.0' as const;
export const POSITIONS = ['1B', '2B', 'SS', '3B', 'HP', 'P', 'LF', 'CF1', 'CF2', 'RF'] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_LABELS: Record<Position, string> = {
  '1B': '1루수',
  '2B': '2루수',
  SS: '유격수',
  '3B': '3루수',
  HP: '본루수',
  P: '투수 위치 수비수',
  LF: '좌익수',
  CF1: '제1중견수',
  CF2: '제2중견수',
  RF: '우익수',
};
/** Columns: G,F,C,A,L,Q,M,J,B. Keep exact user-confirmed v2.0 values. */
export const POSITION_WEIGHTS: Record<Position, readonly number[]> = {
  '1B': [10, 5, 30, 5, 5, 5, 5, 10, 25],
  '2B': [20, 5, 10, 20, 5, 10, 10, 15, 5],
  SS: [20, 5, 5, 20, 10, 10, 10, 15, 5],
  '3B': [20, 5, 5, 20, 15, 15, 5, 10, 5],
  HP: [5, 5, 30, 10, 5, 10, 5, 15, 15],
  P: [30, 5, 5, 20, 5, 20, 5, 10, 0],
  LF: [10, 30, 5, 15, 15, 5, 15, 5, 0],
  CF1: [5, 30, 5, 15, 10, 5, 25, 5, 0],
  CF2: [5, 30, 5, 15, 10, 5, 25, 5, 0],
  RF: [10, 30, 5, 15, 15, 5, 15, 5, 0],
};
export const TYPE2 = {
  status: 'reference-only',
  positions: null,
  todo: '보조 포메이션 정의 대기; 선발 추천에 사용하지 않음',
} as const;
