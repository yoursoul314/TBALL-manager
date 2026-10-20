import type { EvaluationPolicy } from '../domain/model';
export const DEFAULT_POLICY: EvaluationPolicy = {
  version: 'draft-0.1',
  domainWeights: {
    status: 'TODO',
    value: { batting: 36, defense: 36, running: 18, teamwork: 10 },
    note: '최종 영역별 비율 미확정',
  },
  battingMix: {
    status: 'TODO',
    value: { skill: 40, game: 60 },
    note: '타격 기능/실전 비율 미확정',
  },
  defenseMix: {
    status: 'TODO',
    value: { skill: 40, game: 60 },
    note: '수비 기능/실전 비율 미확정',
  },
  runningMix: { skill: 40, game: 60 },
  conversion: {
    status: 'TODO',
    value: 'manual-0-100',
    note: '실측 환산표 미확정; 수동 0~100 입력은 임시 지표',
  },
  sacrificeFly: { status: 'TODO', value: 'exclude-from-at-bats', note: '희생플라이 처리 미확정' },
  incompleteInnings: {
    status: 'TODO',
    value: 'exclude',
    note: '미완료 이닝의 선발 통계 포함 여부 미확정',
  },
};
