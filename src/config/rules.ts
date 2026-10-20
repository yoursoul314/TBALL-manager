/** User-confirmed rules. Policy proposals must never override these constants. */
export const RULES_VERSION = 'school-tball-1.0' as const;
export const RULES = {
  RULE01: '출전 선수 전원 1회 타격 후 공수교대, 잔루 승계.',
  RULE02: '마지막 타자 1루 포스아웃이면 해당 타격의 진루·득점을 취소하고 직전 잔루 상태 복구.',
  RULE03: '3스트라이크 아웃, 세 번째 파울도 삼진.',
  RULE04:
    '리드·도루·슬라이딩 금지(위반 주자 아웃), 태그업 허용, 추가 진루 의사 없는 1~3루 오버런 인정, 포스아웃/태그아웃 구분.',
  RULE05: '심판 타임으로 플레이 종료; 경기장 밖 악송구 시 안전진루권 1개.',
  RULE06: '잔루 주자에게 타순이 도래하면 감독이 임시주자를 직접 지정; 기존 타순 유지.',
  RULE07:
    '경기별 이닝 수 설정; 양 팀이 동일하게 완료한 공격 이닝까지만 승패 반영; 무승부 허용; 콜드게임 없음.',
  RULE08:
    '볼 데드 시 자유 교체, 무제한 재출전, 수비 포지션 자유 변경; 정식 교체는 타순 자리 승계; 임시주자와 구분.',
} as const;
export const RULE_SETTINGS = Object.freeze({
  version: RULES_VERSION,
  switchAfter: 'all-lineup-slots-bat-once',
  carryRunners: true,
  strikeLimit: 3,
  thirdFoulIsStrikeout: true,
  forbiddenActions: ['lead', 'steal', 'slide'],
  safeAdvanceOnOutOfFieldThrow: 1,
  allowTie: true,
  mercyRule: false,
  substitutions: 'dead-ball-only',
  reentryLimit: null,
} as const);
