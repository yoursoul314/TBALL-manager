# TB Manager | 티볼 통합 매니지먼트 시스템

중학교 티볼 수업의 실시간 경기 기록, 선수 분석, 기능평가와 TYPE1 포지션 시뮬레이션을 위한 **React + TypeScript + Vite PWA** v0.3입니다.

- 웹앱: https://yoursoul314.github.io/TBALL-manager/
- 저장소: https://github.com/yoursoul314/TBALL-manager
- 무손실 이전·백업 계약: [docs/MIGRATION.md](docs/MIGRATION.md)
- 개발 명세: [docs/SPEC.md](docs/SPEC.md)
- 확정·미확정 결정: [docs/DECISIONS.md](docs/DECISIONS.md)
- 검증 결과: [docs/VALIDATION.md](docs/VALIDATION.md)

## 빠른 실행

Node.js 22.12 이상 (검증: 24.19), npm 사용.

```sh
git clone https://github.com/yoursoul314/TBALL-manager.git
cd TBALL-manager
npm ci
npm run dev
```

브라우저에서 터미널의 Local URL을 여세요. 기본 주소는 http://127.0.0.1:5173 입니다.

```sh
npm run typecheck
npm test
npm run build
npm run preview
# 전체 확인
npm run check
```

테스트 실행기는 Windows 샌드박스의 임시 디렉터리 rename 제한을 피하기 위해 프로젝트 내부의 무시된 캐시 디렉터리를 사용합니다. 일반 OS와 CI에서도 같은 명령으로 실행합니다.

## 이 버전에서 가능한 일

- 가상 샘플 2팀·24명으로 시작, 팀·선수 추가, 선수 검색과 프로필
- 경기별 이닝·출전 인원 설정, 전원 타격제 타순 생성
- 스트라이크·파울, 타구 발생, 타구 9구역·유형·강도, 모든 주자의 최종 위치·아웃 구분, 심판 타임 확정
- 임시주자 감독 지정, 정식 교체, 경기 조기 종료, 직전 입력 취소, 과거 플레이 수정 및 감사 이력
- FC·RBI, 실책 유형·실책 추가 진루, 복수 수비 동작과 PO/A/E, 타격·수비·주루 통계, 스카우팅 분포, CSV 내보내기
- 날짜별·복수 세션 타격 평가, 9구역 터치 입력, 회차별 1~10점, 정정·취소 이력, 날짜/기간 가중 평균·성장 그래프·히트맵
- 9개 수비 능력과 이전 수동 타격·주루 기능 입력, 5영역 팀워크 기회·수행 결과 분리 및 이전 관찰 보존
- TYPE1 v2.0 가중치에 따른 중복 없는 최대 합계 포지션 배치, 시범 배치 감독 승인
- 기기 내 저장, v1/v2 원본 보존 마이그레이션, v1/v2/v3 JSON 백업 읽기·v3 내보내기, PWA 설치·앱 셸 오프라인 캐시
- 규칙 엔진·통계·평가·데이터 접근 계층의 독립 테스트와 GitHub Actions

## 초기 버전의 범위

**서버 인증·접근 권한이 미구현입니다. 실명·학번 등 실제 학생 개인정보를 입력하지 말고 별칭·가상 데이터로 사용하세요. 백업을 저장소에 올리지 마세요.**

- 브라우저 localStorage 저장입니다. 서버 DB, 계정, 학급 권한, 멀티기기 자동 동기화는 TODO입니다.
- 공개 배포 파일에는 가상 선수만 있습니다. 사용자가 입력한 선수·경기 데이터는 GitHub로 전송되지 않습니다.
- 같은 브라우저의 순차적인 다른 탭 변경은 리비전 검사로 탐지하지만, 거의 동시인 쓰기에 대한 원자적 잠금은 아직 없습니다. 경기당 한 탭·한 기록 기기를 사용하세요.
- 백업을 보관해야 합니다. 브라우저 저장소 초기화·삭제, 용량 제한, 기기 분실에 대비한 서버 백업은 아직 없습니다.
- 최초 온라인 로드 후 앱 셸을 오프라인에서 사용할 수 있습니다. iPad는 Safari 공유 메뉴 → 홈 화면에 추가. 실제 iPad Safari 하드웨어 검증 여부는 VALIDATION을 확인하세요.
- 실측 환산표, 최종 종합 선발, 타격/수비 40:60, 영역 36:36:18:10, 희생플라이, 미완료 이닝 선발 통계 포함 여부는 **확정되지 않았습니다**. UI에서 바꾸는 값도 TODO 초안입니다.
- 주루 기능 40%·실전 60%와 확정 경기 규칙, TYPE1 가중치는 변경하지 않습니다.
- 현재 선발 시뮬레이션은 **수비 기능 점수 기반 포지션 배치**입니다. 타격·주루·팀워크를 합친 최종 엔트리 추천으로 해석하지 마세요.
- 볼 데드 수비 배치 편집·복수 수비 관찰 UI를 지원합니다. 실측 입력, 삼진의 과거 투구 수정 및 여러 플레이 일괄 복구는 TODO입니다.
- 화면 검증은 URL에 ?preview=1을 붙여 sessionStorage의 가상 데이터로 수행할 수 있습니다.

## 디렉터리

```text
src/
  components/    화면·입력 컴포넌트
  config/        확정 규칙, TYPE1 v2.0, 미확정 정책
  domain/        초기 타입·이벤트 계약
  engine/        순수 경기 이벤트 재생과 판정
  statistics/    원본 기반 통계 재계산
  assessment/    타격 평가 명령·감사 이력·순수 집계
  evaluation/    가중합·비율 계산·전역 포지션 최적화
  data/          스키마 검증, 저장 어댑터, 백업, 샘플
  test/          공유 테스트 준비·픽스처
docs/            명세·결정·검증 기록
public/          PWA 아이콘
.github/workflows/  CI 및 GitHub Pages 배포
```

## 배포

저장소 Settings → Pages → Source는 **GitHub Actions**를 사용합니다.
main 푸시 시 타입 검사 → 테스트 → 빌드 성공 후 Pages에 배포합니다. PR에서는 검증만 수행합니다.

`BASE_PATH=/TBALL-manager/`를 CI 빌드에 적용합니다. 다른 경로에 배포하면 해당 경로로 설정하고, 루트 경로 배포는 기본 상대 경로 빌드를 사용할 수 있습니다. 비밀키와 실제 선수 백업 파일을 저장소에 커밋하지 마세요.

공식 참고: [Vite](https://vite.dev/guide/), [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 날짜별 타격 기능평가 v1.0 사용법

1. 기능평가 & 팀워크 → 타격 상세평가에서 선수와 날짜를 선택하고 세션을 생성합니다. 기본 10회이며 1~200회로 직접 설정할 수 있습니다. 같은 날짜에 여러 세션을 만들 수 있습니다.
2. 타격 결과, 9구역, 유형·강도·정확성 및 감독의 1~10점을 선택하고 기록 저장합니다. 순서대로 다음 회차에 입력합니다. 미측정 임시 저장도 가능합니다. 파울 관찰은 선택 사항이며 헛스윙은 타구 관찰값을 null로 저장합니다.
3. 기록지의 회차를 터치해 수정자·사유를 입력하여 정정하거나 취소합니다. 세션 정보에서 날짜·목적·상태도 정정할 수 있습니다. 모든 회차를 평가 또는 취소한 후 완료할 수 있습니다.
4. 선수 프로필에서 실전 PA/H와 상세 기능평가를 비교합니다. 기간 필터, 날짜별 평균·누적 추세, 9구역 히트맵과 유형·강도·정확성 비율을 확인합니다.
5. 규칙 & 설정 → 타격 기능평가 설정에서 거리 구역 정의를 새 버전으로 추가하고, 점수 출처 및 참고 성향 분석 기준을 설정합니다.

전체 평균은 날짜별 평균의 재평균이 아니라 유효 회차 점수 합계/회차 수입니다. 15회·126점은 84점입니다. 취소·미평가 제외, 분모 0은 평가 기록 없음, 진행 중 세션은 잠정 평균으로 표시합니다. 기존 수동 점수는 삭제·역산·혼합하지 않습니다. 기본 출처는 상세 기록이며 상세 기록이 없으면 점수 없음입니다. 수동 점수 사용은 설정에서 명시적으로 선택합니다. 최종 선발 점수는 생성하지 않습니다.

거리의 미터 기준과 성향 분석 경계값은 기본 미확정(TODO)입니다. 최소 관찰 수 기본 15개, 경계값이 비어 있는 유형은 판정을 보류합니다. 감사 이력은 로컬 변경 기록이며 인증된 전자서명/위변조 방지 로그가 아닙니다. 신규 평가의 CSV 전용 내보내기 및 실제 iPad Safari 하드웨어 검증은 TODO이며 모든 신규 원본·이력은 JSON 백업에 포함됩니다.

주요 변경 파일: domain/batting.ts, config/batting.ts, assessment/batting.ts·battingSummary.ts, data/schema.ts·schemaV2.ts·migration.ts·repository.ts·seed.ts, components/BattingAssessmentPanel.tsx·BattingAssessmentReport.tsx·BattingAssessmentSettings.tsx, AssessmentView.tsx·Players.tsx·SettingsView.tsx, App.tsx, styles.css 및 평가/마이그레이션/UI 테스트. 상세 계약은 [SPEC](docs/SPEC.md), [MIGRATION](docs/MIGRATION.md)을 참조하세요.
