# v0.6 경기·팀 목록과 현장 기록 화면

검증일: 2026-10-26. 기존 앱을 확장하며 사용자 데이터가 없는 별도 브라우저 컨텍스트와 가상 선수/도형 사진만 사용한다.

## 변경 기능

- 경기 목록 → 선택 경기 상세, 검색·날짜·상태 필터, 새 경기, 휴지통 삭제/복원.
- 팀 추가, 운영 팀/삭제된 팀 구분, 삭제/복원. 소속 선수·사진·평가·과거 경기는 유지한다. 새 경기는 운영 팀만 선택한다.
- 아이패드 가로 경기 화면: 공격 결과/주자 확인 왼쪽, 실제 수비 배치/행동 입력 오른쪽. 경기 타순·플레이 이력은 펼쳐 보기.
- 타격 기능평가 상세 모드: 전체 화면에 결과·1~10점·9구역·유형·강도·정확성·회차 기록지를 표시. 메모/수정 입력은 왼쪽 여백을 사용한다. 화면을 닫고 다시 열어도 미저장 초안은 유지한다.

## 조작 단계와 터치 수

|흐름|개선 전|개선 후|
|---|---|---|
|경기 열기|기록실에서 경기 드롭다운 선택|목록 카드 1터치로 상세 진입|
|경기 추가|기록실의 새 경기 버튼|목록의 새 경기 1터치, 기존 엔트리 확인 절차 유지|
|경기/팀 삭제|제공하지 않음|삭제 + 확인 2터치, 휴지통/삭제된 팀에서 복원 1터치|
|주자 없는 단타|결과→타자주자 확인→타임→확정 4터치, 영역 간 스크롤|동일 4터치, 가로 화면에서 핵심 영역 동시 노출|
|평가 기본 기록|결과→점수→저장 3터치|동일 3터치, 저장 후 자동 다음 회차|
|평가 상세 기록|결과·점수·9구역·유형·강도·정확성·저장 7터치와 스크롤|동일 7터치, 아이패드 가로에서 한 화면|

타구 및 수비 판정 수를 임의로 줄이지 않는다. 주자 수·수비 연결 단계·수정 사유에 따라 필요한 조작은 늘어난다. 긴 목록은 내부 스크롤, 메모 펼치기·키보드·작은 세로 화면은 추가 스크롤이 필요할 수 있다.

## 데이터와 마이그레이션

Workspace schema6, tb-manager.workspace.v6에 검증 후 저장한다. 이전 v1~v5 키를 지우지 않고 v5 원문을 migrationSource.raw에 보관한다. Team/Game에 선택적 archivedAt/archiveHistory만 추가한다. 이전 팀/경기는 활성으로 취급하며 존재하지 않는 기록을 생성하지 않는다. JSON 읽기1~6/쓰기6, 사진 백업은 기존 암호화 형식을 유지한다. 실패/구버전 탭 충돌 시 기존 원본을 유지한다. MIGRATION.md 참조.

## 검증

- npm run check: 타입 검사·23개 파일 156개 테스트·Vite/PWA 빌드.
- 신규 회귀: schema5 이전, 이전 키 보존/실패/충돌, 경기 삭제·빈 통계·복원·재생, 팀 삭제 후 선수/평가/경기 보존, 삭제된 팀의 새 경기 선택 제외, 평가 모드 전환 중 초안 보존.
- scripts/classroom-qa.cjs: 팀/경기 추가·삭제·새로고침·복원, 가로1180×820·1024×768의 핵심 버튼/필드/회차 기록지 화면 안 노출, 실제 저장/다음 회차/초안 유지.
- scripts/browser-qa.cjs: 선수·사진·엔트리·수비 연결·주자 확인·정정·백업/복원. PC1440×1000, 가로1180/1024, 세로820×1180, 작은390×844. 전체 주요 조작44px 이상/수비48px 이상 및 수비수 버튼 겹침 없음 확인.
- 규칙/가중치 파일 SHA256: rules.ts 3978DAB7888DEBD1BB2D133C2279718BF537089FF1143C91DE195FFD79A3461A, positions.ts 7D76E170493A626BED6A93E75597D758EF8E82E2251F0DC60DC31BE91EF20BA3.

브라우저 재실행 환경변수는 IPAD-QA.md 참조. 배포 검증 시 QA_DIST를 해제한다. Chromium headless 다운로드가 취소되는 환경에서는 생성된 백업 Blob을 검증하며, WebKit에서 실제 파일 다운로드를 확인한다.

## 남은 확인/TODO

물리 iPad의 Safari 주소창/가상 키보드, 사진 보관함, 홈 화면 PWA 업데이트는 실기 확인이 필요하다. 긴 이름·많은 주자/수비 연결은 영역 내부 스크롤을 허용한다. 서버 인증·접근 제어·자동 동기화, 동시 쓰기 원자적 잠금, 영구 삭제는 미구현이다. 실제 학생 개인정보 주의 안내를 유지한다. 미확정 최종 종합 선발/환산 기준은 확정하지 않는다.

## 변경 파일

- README.md
- docs/DECISIONS.md
- docs/MATCH_UI.md
- docs/MIGRATION.md
- docs/SPEC.md
- docs/VALIDATION.md
- package-lock.json
- package.json
- scripts/browser-qa.cjs
- scripts/classroom-qa.cjs
- src/App.tsx
- src/components/App.test.tsx
- src/components/BattingAssessmentPanel.tsx
- src/components/DefenseRecorder.tsx
- src/components/HomeRuns.test.tsx
- src/components/MatchLibrary.test.tsx
- src/components/MatchLibrary.tsx
- src/components/MatchView.tsx
- src/components/NewGame.tsx
- src/components/PlayForm.tsx
- src/components/PlayerEditor.tsx
- src/components/Players.tsx
- src/components/QuickRecording.test.tsx
- src/components/Recording.test.tsx
- src/components/RosterDefense.test.tsx
- src/components/SelectionView.tsx
- src/components/StatsView.tsx
- src/components/TeamworkPanel.tsx
- src/data/gameLibrary.test.ts
- src/data/migration.test.ts
- src/data/migration.ts
- src/data/quickMigration.test.ts
- src/data/repository.ts
- src/data/rosterMigration.test.ts
- src/data/schema.ts
- src/data/seed.ts
- src/domain/gameLibrary.ts
- src/domain/model.ts
- src/styles.css

### 로컬 브라우저 결과

Chromium 151과 WebKit 26.5에서 classroom-qa 및 browser-qa 모두 통과했다. WebKit은 사진 포함 암호화 백업의 파일 내려받기·UI 복원까지 통과했고 Chromium의 다운로드 제한은 보고서에 분리했다. 가로1024×768/1180×820에서 결과·점수·9구역·회차 기록지·저장 버튼 및 경기 공격/수비/확정 영역의 화면 내 위치를 검사했다. 경고는 기존 Zod 주석 처리 및 500KB 번들 크기 안내이며 빌드를 차단하지 않는다. 공개 배포 검증은 배포 후 별도로 수행한다.

### v0.6 공개 앱 배포 검증 완료 (2026-10-26)

소스 커밋 3cbcfaf72e2052f410e1f8ecfcd78da03d82e52b를 GitHub Desktop으로 main에 전송했다. [Verify](https://github.com/yoursoul314/TBALL-manager/actions/runs/40271235557)와 [GitHub Pages](https://github.com/yoursoul314/TBALL-manager/actions/runs/40271235533)가 모두 성공했다. 공개 주소에서 HTTP200, BETA0.6.0, index-BW3g4fBs.js/index-CMm5I77t.css를 확인했다.

QA_DIST를 해제한 실제 공개 앱을 새 비영구 Chromium151/WebKit26.5 컨텍스트에서 시험했다. browser-qa 및 classroom-qa 모두 통과했다. 팀/경기 추가·삭제·복원·새로고침, 평가 상세화면의 9구역/점수/회차 기록지 동시 노출·초안 유지·다음 회차 저장, 사진 및 엔트리·수비 연결·정정·백업/복원까지 검증했다. 콘솔 오류0. 기존 사용자 브라우저 저장소는 열거나 수정하지 않았다.

WebKit은 실제 백업 파일 다운로드까지 통과했다. Chromium headless는 다운로드 canceled 제한으로 생성된 Blob 내용과 복원 흐름을 검증했다. iPad 크기 화면 에뮬레이션이며 물리 iPad의 사진 선택기·가상 키보드·홈 화면 PWA 갱신은 별도 실기 확인이 필요하다. 기존 화면이 남으면 기록 저장 후 앱의 모든 창을 닫고 다시 열어 BETA0.6.0을 확인한다. 브라우저 저장 데이터 삭제는 필요하지 않다.
