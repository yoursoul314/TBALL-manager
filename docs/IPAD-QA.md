# iPad 현장 입력 검증 — v0.5.1

검증일: 2026-10-26. 공개 앱 v0.5.0을 먼저 시험하고 발견한 문제를 수정했다. React/경기 엔진을 재작성하지 않았다.

## 재현 및 수정

|항목|변경 전|변경 후|
|---|---|---|
|사진 저장|Windows WebKit에서 Blob 저장 중 오류 발생|ArrayBuffer 저장 + 기존 Blob 읽기 호환. 업로드·방향 보정·교체·삭제·복원 검증|
|선수 편집|닫기38px, 저장 버튼이 긴 폼 아래로 사라짐|닫기48px, 고정 제목·56px 저장 버튼|
|검색/알림 닫기|검색36px, 알림 닫기22px 폭|48px 이상|
|엔트리|700px 창에서 선수·타순·승인 사이 긴 왕복 스크롤|최대960px, 고정 팀 탭, 단계 바로가기 1터치|
|중복 포지션|중복 선택 후 제출 시 오류|이미 배치한 선수를 다른 포지션에서 선택 차단|
|수비 필드|일부 인접 수비 버튼 겹침 및 좁은 화면 오른쪽 잘림|버튼 간격·필드 높이/너비 보정, 10명 터치 영역 분리|

일반 기록의 필수 터치 수는 줄이지 않았다. 타격 결과1회 → 각 주자 확인1회 → 심판 타임1회 → 확정1회(주자 없는 경우4회)를 유지한다. 수비 4행동 연결은 수비수·행동·연결 각1회씩12회에 필요한 베이스/주자 선택을 더한다. 편의를 위해 실제 아웃·주자·심판 판정을 생략하지 않는다. 엔트리의 각 단계 이동은 긴 스크롤 대신 바로가기1회이며, 스크롤 횟수는 화면/명단 크기에 따라 달라 고정 수치로 주장하지 않는다.

## 데이터 보존

- 사용자 브라우저 프로필에 접속하지 않고, 매 시험 새 비영구 브라우저 컨텍스트를 생성한다. 가상 별칭과 도형 사진만 사용한다.
- 일반 앱 모드에서 localStorage·IndexedDB·새로고침을 검증한다. preview 모드는 사진이 메모리에만 있으므로 이번 시험에 사용하지 않는다.
- 기존24명 샘플 선수와 기능평가/경기 이벤트의 동일성을 비교한다. 실패 시 입력과 기존 사진 복구, 백업 복원 후 경기 이벤트 동일성을 확인한다.
- Workspace schema5/기존 JSON 계약 그대로. 기존 사진 Blob을 읽고 새 사진은 formatVersion2 ArrayBuffer로 저장한다. 전면 재저장/삭제 없음. 세부 방식은 MIGRATION.md 참조.
- RULE01~08 및 TYPE1 v2.0 설정 파일 SHA256은 수정 전후 동일하다.

## 자동 확인 범위

- npm run check 통과: 21개 파일, 145개 테스트 + 타입 검사·프로덕션 빌드. 신규 사진 읽기/변환/실패와 엔트리 단계/중복 방지 테스트 포함.
- Chromium / WebKit: 선수 등록, 형식 위장 파일 거절, PNG 축소, JPEG EXIF 방향 보정, 사진 교체/삭제/새로고침, 저장 실패/재시도, 기존 Blob 읽기(Chromium), JSON/사진 암호화 백업과 UI 복원.
- 감독이 양 팀10명·교체 후보·결석·타순·TYPE1 배치 후 승인하여 경기 생성. 등록과 경기 명단 분리 확인.
- 유격수 포구→송구→1루수 포구→포스아웃→주자 확인→심판 타임→자살/보살 통계. 미관찰은 null/기회없음.
- 아이패드 가로1180×820·1024×768, 세로820×1180, PC1440×1000, 좁은 화면390×844. 가로 넘침, 주요 조작48px, 수비수 간 겹침 여부를 실제 DOM 치수로 검증한다.
- 기존 주자가 있는 야수선택/2루 포스아웃, 주자 미확인 차단, 과거 플레이 수정 이력과 원본 보존·재계산도 확인했다.
- 브라우저 콘솔 오류와 스크린샷을 함께 기록한다. Chromium headless 환경은 파일 다운로드가 canceled여서 생성된 Blob 내용으로 백업/복원 시험을 계속하며 report.json에 제한을 남긴다. WebKit은 실제 파일 다운로드까지 확인한다.

## 브라우저 시험 재실행

선택 개발 도구 Playwright가 필요하다. 기본 check는 추가 설치 없이 기존 의존성으로 동작한다. 별도 도구 폴더에 Playwright를 설치하고 해당 브라우저를 설치한 뒤 아래 환경변수를 지정할 수 있다.

- PLAYWRIGHT_MODULE: Playwright 모듈 경로(생략하면 require('playwright')).
- QA_BROWSER_PATH: 브라우저 실행 파일 경로(생략하면 Playwright 기본 설치).
- QA_URL: 시험 주소, 기본 https://yoursoul314.github.io/TBALL-manager/.
- QA_OUTPUT: 보고서·스크린샷·가상 백업 출력 위치, 기본 test-results/browser. 저장소에서 제외됨.
- QA_DIST: 선택. 로컬 dist를 동일 URL에 라우팅하여 배포 전 시험. 공개 앱 검증 시 반드시 해제.

실행: node scripts/browser-qa.cjs webkit release 또는 node scripts/browser-qa.cjs chromium release.
테스트 이미지 위치: src/test/browser-fixtures. 사진은 실제 인물이 아닌 QA 도형이다. 스크립트는 storageState/userDataDir을 받지 않으며 기존 사용자 데이터를 로드하지 않는다.

## 변경 파일

- src/data/photos.ts, photoStorage.ts, photoStorage.test.ts: 사진 저장 호환성 및 실패 보호.
- src/components/Field.tsx, NewGame.tsx, PlayerEditor.tsx, ui.tsx, styles.css: 필드/엔트리/편집 터치 화면.
- src/components/RosterDefense.test.tsx: 엔트리 조작 회귀.
- scripts/browser-qa.cjs, src/test/browser-fixtures/*: 독립 브라우저 회귀 시험.
- src/App.tsx, package.json, package-lock.json: v0.5.1 표시.
- README.md, docs/SPEC.md, DECISIONS.md, MIGRATION.md, IPAD-QA.md: 사용법·보존·검증 기록.

## 실제 iPad에서 남은 확인

물리 iPad 하드웨어를 연결해 시험한 것은 아니다. Safari 사진 보관함/카메라 파일 선택, 가상 키보드 표시 중 고정 버튼, 홈 화면 설치 PWA 업데이트, 저용량 기기 IndexedDB 보관 정책은 현장 실기 확인이 필요하다. 인증 서버·다중 기기 동기화·실제 학생 개인정보 접근 제어와 미확정 종합 선발 가중치는 이번 변경 범위 밖이며 기존 TODO로 유지한다.
