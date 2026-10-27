import type { BattingQualityGrade, BattingRubric } from '../domain/batting';
export const QUALITY_RUBRIC = 'quality-six-v1' as const;
export const LEGACY_RUBRIC = 'manual-ten-v1' as const;
export const QUALITY_GRADES = [
  'barrel',
  'solid',
  'weak-ground',
  'popup',
  'foul',
  'tee-miss',
] as const;
export const QUALITY_SCALE: Record<
  BattingQualityGrade,
  { score: number; label: string; description: string; result: 'fair' | 'foul' | 'miss' }
> = {
  barrel: {
    score: 5,
    label: '장타성 정타(배럴)',
    description: '외야를 가르는 강한 직선타·장타',
    result: 'fair',
  },
  solid: {
    score: 4,
    label: '강한 땅볼·단타성 직선타',
    description: '내야를 빠르게 통과하는 타구',
    result: 'fair',
  },
  'weak-ground': {
    score: 2,
    label: '약한 땅볼',
    description: '내야에 힘없이 굴러가는 타구',
    result: 'fair',
  },
  popup: {
    score: 1,
    label: '팝플라이·내야뜬공',
    description: '수비수가 쉽게 잡는 높이 뜬 공',
    result: 'fair',
  },
  foul: { score: 0, label: '일반 파울', description: '파울 라인 밖 타구', result: 'foul' },
  'tee-miss': {
    score: -1,
    label: '티 타격 파울·헛스윙',
    description: '티 기둥 타격 또는 헛스윙',
    result: 'miss',
  },
};
export const rubricOf = (session: { rubricVersion?: BattingRubric }) =>
  session.rubricVersion ?? LEGACY_RUBRIC;
export const rubricLabel = (rubric: BattingRubric) =>
  rubric === QUALITY_RUBRIC ? '타구 질 6단계 (−1~5점)' : '이전 수동 (1~10점)';
export const toBatting100 = (average: number, rubric: BattingRubric) =>
  rubric === QUALITY_RUBRIC ? ((average + 1) / 6) * 100 : average * 10;
