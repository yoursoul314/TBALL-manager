# 초간편 UI v2.0 변경·검증 보고서

## 입력 단계와 터치 횟수

같은 선수를 연속 기록하는 정상 상황, 선수/세션 최초 설정과 스크롤은 제외한다. 드롭다운 열기와 항목 선택은 각각1회로 센다. 관찰을 생략한 최소 흐름이므로 필수 판정이 추가되는 경우에는 횟수가 늘어난다.

| 시나리오 | 이전 | 개선 후 |
|---|---|---|
| 기능평가 필수 항목만 기록 후 다음 회차 | 결과1 → 점수1 → 저장1 → 다음1 = **4회** | 결과1 → 점수1 → 저장·다음1 = **3회** |
| 기능평가 좌측만 관찰 | 9구역에서 거리를 함께 선택해야 했음 | 기본3회 + 좌측1 = **4회**, 거리는 null |
| 기능평가 9구역 추가 | 기본4회 + 구역1 = **5회** | 기본3회 + 방향1 + 거리1 = **5회**; 상세 모드에서는 필드맵1로 선택 가능 |
| 무주자 1루타, 수비 관찰 없음 | 시작1 → 9구역1 → 강도 드롭다운2 → 타임확정1 = **5회**, 주자 기본값 확인 누락 가능 | 결과1 → 타자 최종 위치 확인1 → 심판 타임1 → 확정1 = **4회** |
| 기존 주자 N명 | 주자별 드롭다운 조작 필요, 확인 여부는 추적하지 않음 | 기본4회 + 기존 주자별 확인 N회. 실제 위치 변경·아웃 종류·위치·FC 대상 등 추가 판정은 별도 |

정밀 관찰을 모두 입력하는 경우 터치 감소를 보장하지 않는다. 이번 개선은 선택 관찰을 생략할 수 있게 하면서 필수 주자 판정은 명시적으로 확인하는 것이다. 홈런의 땅볼형/직선타형/뜬공형 및 강도 분류는 상세 화면에 유지한다.

## 데이터와 저장

- 기존 날짜별 세션/회차/감사 모델을 유지하고 회차 `direction`을 nullable로 추가했다. 거리까지 관찰했을 때만 기존 `directionZone`에9구역을 저장한다.
- 게임 이벤트 버전3: 방향·유형 및 수비 success에 null 허용. 수비 난도는 별도의 선택 관찰이고 평가 점수로 환산하지 않는다. 미관찰 success는 성공률 분모와 실패 수에서 제외한다.
- v4 신규 저장 키, v1~v3 원본 키 및 v3 전체 raw 보존. 이전 감사 스냅샷의 필드를 소급 변경하지 않는다. JSON 입력1~4/출력4. 저장 실패·충돌 시 원본과 초안 보호. 자세한 절차는 [MIGRATION](MIGRATION.md).
- 날짜별 평균을 재평균하지 않고 유효 회차 전체 합계/횟수로 계산한다. 15회·126점=84점. 취소/미평가 제외, 진행 중 세션은 잠정. 기능평가가 PA/H에 합산되지 않는다.
- 저장 성공 후 다음 회차, 마지막 기록의 논리적 취소, 기존 회차 정정과 원본 이력, 미저장 선수/메뉴 이동 차단을 제공한다. 상세 모드 선택만 유지하며 다음 회차 관찰은 초기화한다.

## 검증

- 변경 전 `npm run check`: 13파일98테스트 통과.
- 변경 후 `npm run check`: 16파일114테스트, TypeScript와 Vite/PWA 빌드 성공. 기존98개 테스트를 유지하고 새16개 시나리오 추가. 기존 UI 테스트는 새로운 버튼 흐름으로 갱신했다.
- 추가 검증: 필수3터치·모든 미관찰 null·자동 이동·중복 클릭, 방향만 기록/모드 초안 유지, 마지막 취소/평균 재계산, 미저장 이동/저장 실패 후 재시도, 간편 경기/주자·타임 확인, 아웃 판정 누락/재확인, 수비 미관찰 난도, 프로필 모드 분리, v3 원문·감사·수동점수 보존, JSON 왕복, 이전 실패·구버전 충돌, 이동 제안 비변이, 주자 누락/중복/베이스 충돌, 간편 RULE02와 과거 정정 재계산.
- 기존 RULE01~08, 동일 학생 중복 타격,9구역,복수 수비/FC/RBI,126/15→84 및 날짜별 회차 수 차이,새로고침,프로필 그래프 일치 테스트도 통과했다.
- rules.ts SHA256 `3978DAB7888DEBD1BB2D133C2279718BF537089FF1143C91DE195FFD79A3461A`; positions.ts SHA256 `7D76E170493A626BED6A93E75597D758EF8E82E2251F0DC60DC31BE91EF20BA3`. 변경 전과 동일. 평가 정책 파일도 변경 없음.
- 기존 Zod PURE 주석 경고2개는 비차단 경고다.
- 배포 후 반응형 브라우저 검증 결과는 이 문서의 후속 절과 VALIDATION에 기록한다. 실제 iPad 하드웨어는 아래 별도 확인 대상이다.

## 실제 iPad에서 추가 확인할 사항

- Safari 가로/세로 회전, 손가락 터치, 화면 확대·글자 크기, 키보드 표시 중 하단 저장 버튼 접근.
- 홈 화면 PWA 설치와 업데이트 적용, 오프라인 기록 후 다시 열기, Safari 저장 공간 제한·백업 복원.
- 수업 속도에서 주자 여러 명의 판정·취소 동작을 감독이 혼동하지 않는지 확인. 브라우저 뷰포트 점검은 실제 기기 검증을 대체하지 않는다.

## 미구현·미확정

- 서버 인증·학급 권한·멀티기기 동기화·원자적 동시 쓰기 잠금·IndexedDB 및 암호화 백업은 기존 TODO. 실제 학생 개인정보 사용 금지 안내를 유지한다. 테스트/샘플에는 가상 데이터만 사용한다.
- 타격/수비 기능·실전 비율, 종합 영역 비율, 실측 환산표, 희생플라이 정책, 미완료 이닝 선발 통계, 최종 엔트리 알고리즘, 타격 성향 경계값은 계속 TODO. 주루40:60은 확정값 유지.
- 평가 전용CSV, 과거 삼진 투구 수정, 여러 플레이 일괄 복구 및 복잡한 추가 진루 도중 아웃의 상세 액션 체인은 기존 TODO.
- 경기 상세 입력 중 다른 화면으로 이동하면 저장 전 상세 초안은 유지되지 않는다. START_PLAY는 저장되어 플레이 진행 상태는 보존된다. 평가 입력에는 미저장 이동 보호가 적용되어 있다.

## 변경 파일

파일별 전체 목록은 아래에 기록한다.

- `README.md`
- `docs/DECISIONS.md`
- `docs/MIGRATION.md`
- `docs/QUICK_UI.md`
- `docs/SPEC.md`
- `docs/VALIDATION.md`
- `package-lock.json`
- `package.json`
- `src/App.tsx`
- `src/assessment/batting.ts`
- `src/assessment/battingSummary.ts`
- `src/components/App.test.tsx`
- `src/components/AssessmentView.tsx`
- `src/components/BattedBallMap.tsx`
- `src/components/BattingAssessment.test.tsx`
- `src/components/BattingAssessmentPanel.tsx`
- `src/components/BattingAssessmentReport.tsx`
- `src/components/DirectionPicker.tsx`
- `src/components/HomeRuns.test.tsx`
- `src/components/MatchView.tsx`
- `src/components/PlayDetailsEditor.tsx`
- `src/components/PlayForm.tsx`
- `src/components/Players.tsx`
- `src/components/QuickRecording.test.tsx`
- `src/components/Recording.test.tsx`
- `src/components/SettingsView.tsx`
- `src/data/migration.test.ts`
- `src/data/migration.ts`
- `src/data/quickMigration.test.ts`
- `src/data/repository.ts`
- `src/data/schema.ts`
- `src/data/schemaCommon.ts`
- `src/data/seed.ts`
- `src/domain/batting.ts`
- `src/domain/model.ts`
- `src/engine/game.ts`
- `src/engine/quickRecording.test.ts`
- `src/engine/recording.ts`
- `src/statistics/calculate.ts`
- `src/styles.css`

## 배포 화면 점검 결과

- [PR #4](https://github.com/yoursoul314/TBALL-manager/pull/4)를 병합하고 main의 GitHub Verify 및 Pages 배포를 확인했다. [배포 앱](https://yoursoul314.github.io/TBALL-manager/)에서 별도 검증 탭의 가상 데이터만 사용했다. 기존 사용자 탭의 선수·경기 기록은 직접 입력하거나 수정하지 않았다.
- v3 가상 JSON을 설정 화면에서 복원했다. 기능평가 3일·15회·126점 → **84.0점**, 날짜별 평균 7.8/8.4/9.0과 누적 추세 7.8/8.1/8.4를 확인했다. 실전 **1타석·1안타**는 별도로 유지됐다.
- 최소 입력 → 자동 다음 회차 → 미관찰 값 초기화, 마지막 기록 취소 → 평가 기록 없음, 사유를 남긴 복원, 방향만 입력, 상세 9구역 입력, 새로고침 후 기록 유지 흐름을 확인했다. 선수 프로필의 기능평가/실전 경기 탭도 분리된다.
- 경기에서 결과 선택 후 모든 주자의 실제 결과를 확인해야 하며, 확인을 마쳐도 심판 타임 전에는 확정할 수 없다. 타임 확인 후 활성화와 저장 후 다음 타자 이동을 확인했다. 검증용 진행 중 플레이 취소 후 기존 1타석 기록도 유지됐다.

| 브라우저 뷰포트 | 확인 결과 |
|---|---|
| PC 1440×1000 | 프로필의 84점·15회·날짜별 그래프 표시, 기능평가/실전 탭 전환 |
| iPad 가로 크기 1180×820 | 평가 점수 60px 높이, 저장 버튼까지 핵심 입력 노출. 경기 결과와 주자 확인을 좌우 배치 |
| iPad 세로 크기 820×1180 | 점수 약100.4×60px, 결과 버튼 가로 글자 유지, 저장 버튼 하단 약811px |
| 작은 화면 390×844 | 점수 약54.2×56px, 5열×2행. 상단 메뉴62px 아래 요약을 고정하여 겹침 방지 |

위 화면에서 가로 넘침이 없었다. 실제 iPad Safari 하드웨어·키보드·손가락 조작·오프라인 설치 검증은 별도로 필요하다. 화면 캡처에는 가상 선수만 포함했다.
