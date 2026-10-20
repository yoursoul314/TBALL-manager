# TB Manager | 티볼 통합 매니지먼트 시스템

중학교 티볼 수업의 실시간 경기 기록, 선수 분석, 기능평가와 TYPE1 포지션 시뮬레이션을 위한 **React + TypeScript + Vite PWA** 초기 버전입니다.

- 웹앱: https://yoursoul314.github.io/TBALL-manager/
- 저장소: https://github.com/yoursoul314/TBALL-manager
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
- 스트라이크·파울, 타구 발생, 타구 방향·질, 모든 주자의 최종 위치·아웃 구분, 심판 타임 확정
- 임시주자 감독 지정, 정식 교체, 경기 조기 종료, 직전 입력 정정 이벤트
- 타격·수비·주루 기초 통계, 스카우팅 분포, CSV 내보내기
- 9개 수비 능력과 타격·주루 기능 입력, 팀워크 행동 관찰
- TYPE1 v2.0 가중치에 따른 중복 없는 최대 합계 포지션 배치, 시범 배치 감독 승인
- 기기 내 저장, 검증된 JSON 백업·복원, PWA 설치·앱 셸 오프라인 캐시
- 규칙 엔진·통계·평가·데이터 접근 계층의 독립 테스트와 GitHub Actions

## 초기 버전의 범위

**수업 운영용 완성 제품이 아니라 검증 가능한 개발 기반입니다.**

- 브라우저 localStorage 저장입니다. 서버 DB, 계정, 학급 권한, 멀티기기 자동 동기화는 TODO입니다.
- 공개 배포 파일에는 가상 선수만 있습니다. 사용자가 입력한 선수·경기 데이터는 GitHub로 전송되지 않습니다.
- 같은 브라우저의 순차적인 다른 탭 변경은 리비전 검사로 탐지하지만, 거의 동시인 쓰기에 대한 원자적 잠금은 아직 없습니다. 경기당 한 탭·한 기록 기기를 사용하세요.
- 백업을 보관해야 합니다. 브라우저 저장소 초기화·삭제, 용량 제한, 기기 분실에 대비한 서버 백업은 아직 없습니다.
- 최초 온라인 로드 후 앱 셸을 오프라인에서 사용할 수 있습니다. iPad는 Safari 공유 메뉴 → 홈 화면에 추가. 실제 iPad Safari 하드웨어 검증 여부는 VALIDATION을 확인하세요.
- 실측 환산표, 최종 종합 선발, 타격/수비 40:60, 영역 36:36:18:10, 희생플라이, 미완료 이닝 선발 통계 포함 여부는 **확정되지 않았습니다**. UI에서 바꾸는 값도 TODO 초안입니다.
- 주루 기능 40%·실전 60%와 확정 경기 규칙, TYPE1 가중치는 변경하지 않습니다.
- 현재 선발 시뮬레이션은 **수비 기능 점수 기반 포지션 배치**입니다. 타격·주루·팀워크를 합친 최종 엔트리 추천으로 해석하지 마세요.
- 수비 포지션 변경 이벤트와 다중 수비 관찰은 엔진 모델에서 지원합니다. 전용 포지션 편집 UI·한 플레이 다중 수비 관찰 UI·실측 입력 UI는 다음 단계입니다.

## 디렉터리

```text
src/
  components/    화면·입력 컴포넌트
  config/        확정 규칙, TYPE1 v2.0, 미확정 정책
  domain/        초기 타입·이벤트 계약
  engine/        순수 경기 이벤트 재생과 판정
  statistics/    원본 기반 통계 재계산
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
