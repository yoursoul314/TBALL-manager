# 학생·엔트리·공수 통합 기록 v3 / 앱 v0.5

## 확인한 문제와 개선

작업 시작 시 공개 main(031afabce394ea74d61f91aa3ad237ecd7cd1ed7)과 로컬 소스가 일치했고 기존114개 테스트가 통과했다. 이전 작업에서 v3 학생·엔트리·연결 수비 확장은 아직 구현되지 않은 상태였다.

- 선수 수정/학년/사진/경기별 출전 상태를 관리할 수 없던 부분을 추가했다. 학생 ID는 고정하고 학년·반·번호는 선택적으로 입력한다. 기존 학년은 미설정으로 보존한다.
- 현재 팀을 기준으로 과거 roster를 검사하면 팀 이동 후 경기가 유효하지 않게 되는 문제를 당시 팀·선수 스냅샷으로 해결했다. 새 경기에서는 양 팀 선발10명을 직접 선택하고 교체 후보/미출전/결석/출전 불가를 구분한다.
- 경기 실제 날짜와 생성 시각을 분리하고 경기/통계 날짜 필터, 추정 날짜 확인·정정 이력을 추가했다.
- 실제 상대 수비 배치에서 선수를 터치해 포구·송구·아웃을 차례로 연결한다. 미배치 선수를 자동 지정하지 않는다. 연결 행동에서 파생된 관찰·PO/A/E는 중복 입력하지 않으며 기존 상세 관찰은 계속 사용할 수 있다.
- 수비 아웃·타격 결과·주자 판정의 충돌을 차단한다. 연결 행동 취소 시 파생값을 다시 계산하고, 과거 정정은 원본과 이력을 남긴다. 입력 중 화면 이탈을 막고 저장 실패 시 초안을 유지한다.
- 사진은 로컬 IndexedDB로 분리하고 저장 실패 시 이전 사진을 복구한다. 선택적 사진 포함 백업을 암호화하며 일반 JSON 백업에는 사진을 넣지 않는다.

## 현장 사용 순서와 조작 수

선수 & 팀 → 정보·사진 수정 → 새 경기에서 날짜·팀·엔트리·타순·초기 수비 확인 → 감독 승인 → 경기 생성.

경기에서는 타격 결과 → 상대 수비수/행동 연결(선택) → 모든 주자의 실제 결과 확인 → 심판 타임 → 기록 확정 순서다. 기존 주자 이동은 제안이며 확정값이 아니다. 안타 후 실책 추가 진루, RBI와 고급 수비 관찰은 상세 화면에서 입력한다.

| 상황                                         | 이전                                                      | 이번 변경                                                                         |
| -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 주자 없는 1루타, 선택 관찰 생략              | 결과→주자 확인→타임→확정,4조작                            | 동일4조작                                                                         |
| 수비 G/A/C/B 관찰과 PO/A까지 기록            | 여러 상세 카드에서 선수·위치·능력·행동·크레딧을 각각 지정 | 수비수·행동 체인으로 관련 값 연결                                                 |
| 유격수 포구→1루 송구→1루수 포구→1루 포스아웃 | 상세 필드 기본값에 따라 달라 고정 횟수 산정하지 않음      | 결과1 + 포구3 + 송구4 + 송구포구3 + 포스아웃5 + 주자확인1 + 타임1 + 확정1 =19조작 |
| 새 경기 선발                                 | 등록 순서 앞10명 자동 결정                                | 각 팀10명 직접 선택,후보·결석 구분,타순 변경,감독 확인                            |

여기서 조작은 버튼 클릭 또는 선택값 변경1회를 뜻하며 드롭다운을 여는 물리적 터치·스크롤·문자 입력은 별도다. 사진/수비 행동 연결은 원본을 더 정확하게 남기는 기능이며 모든 상황에서 터치 수가 감소한다고 주장하지 않는다. 본 릴리스의 실제 화면 측정은 아래 제한으로 미실시했다.

## 데이터와 백업

Workspace v5, Player 선택적 학적/포지션, Game.entry 당시 팀·선수·상태·초기 수비, playedOn/dateStatus/startTime/dateHistory, END_PLAY.defenseSequence를 추가했다. DefenseStep은 선택한 선수·포지션·행동·대상 주자·베이스·공식 실책·확인한 보살 후보를 담는다. 이벤트 버전1~3과 이전 payload를 유지한다.

일반 JSON v1~v5 복원/v5 출력, 이전 저장 키와 원문을 보존한다. 기존 날짜별 타격평가와 수동점수는 변환하거나 혼합하지 않는다. 상세 이전 절차와 실패/롤백 계약은 [MIGRATION.md](MIGRATION.md)의 v5 절을 따른다.

사진은 현재 기기의 학생 ID에만 연결한다. JPEG/PNG/WebP 실제 형식과8MB를 검증하고 EXIF 방향 적용 후 최대320px JPEG(200KB 이하)로 저장한다. 사진 원본·메타데이터·얼굴 인식·서버 전송 없음. 사진 포함 백업은 별도10자 이상 암호, PBKDF2-SHA256 600000회,무작위salt/12byte IV,AES-256-GCM이다. 암호가 없으면 복원할 수 없다. 일반 백업과 기기의 저장소 자체가 암호화되는 것은 아니다.

## 검증

- npm run check 성공: TypeScript,20개 파일141개 테스트,Vite/PWA 빌드. 기존114개 + 신규27개.
- 신규27개: 마이그레이션·엔트리6개,수비 연결/재계산10개,사진 검증/암호화/복구5개,화면 통합6개.
- 검증한 핵심 시나리오: v4 원문·평가 보존,쓰기 실패·구버전 탭 충돌,팀 이동 후 과거 엔트리 유지,선발10명/후보/결석/3팀,날짜 전용 값,포구→송구→아웃과 PO/A/관찰 집계,미관찰/공식 실책 분리,FC,마지막 타자1루 포스아웃 복구,안타 후 실책 진루,과거 정정 및 백업 왕복,사진 삭제/실패 복구,암호 오류/변조 거절,앱 재마운트 저장 유지.
- RULE01~08 및 TYPE1 v2.0 설정 SHA256가 기준본과 동일하다. 날짜별 평가 가중 평균·기존 스카우팅·RULE08/중복 타격 회귀도 통과했다.
- 빌드는 성공했으며 기존 Zod 주석 경고2개와 새 주번들500KB 초과 안내가 있다(압축 전 약525KB,gzip 약158KB). 분할 로딩은 후속 최적화 후보다.
- 실제 브라우저 자동 조작은 현재 URL을 확인할 수 없다는 도구 정책 오류로 중단되었다. 따라서 이번 변경의 전후 스크린샷,실제 viewport 측정,실제 IndexedDB 사진 새로고침 검증은 완료하지 않았다. jsdom/순수 함수 테스트와 실제 렌더링 검증을 구분한다.

## 실제 iPad에서 추가 확인할 사항

1. 가로1180×820/세로820×1180,좁은 화면에서 필드의10개 터치 영역·긴 별칭·사진이 겹치지 않는지 확인한다. CSS는 주요 입력48px 이상,결과60px,수비행동54px,수비수64px 이상 및 세로 한 열 배치를 적용했다.
2. JPEG/PNG/WebP 업로드,EXIF 회전,사진 교체/삭제,새로고침 후 IndexedDB 유지,저장 용량 오류를 확인한다. 가상 preview 탭의 사진은 의도적으로 메모리 저장이므로 실제 모드와 다르다.
3. PWA 설치/업데이트/오프라인 전환,사진 포함 암호화 백업 다운로드·재복원,수업 중 한 손 조작과 스크롤 위치를 확인한다.

## 남은 TODO와 범위

- 서버 인증·학급/승인자 권한·동기화,동시 쓰기 원자적 잠금,localStorage와 사진 IndexedDB 사이의 강제 종료까지 포함하는 원자적 저장.
- 실제 iPad/브라우저 시각 검증,사진 IndexedDB 지속성/용량/오프라인 실기기 검증,전후 스크린샷.
- 최종 종합 선발 알고리즘·미확정 가중치/환산 기준은 계속 TODO. 주루40:60·확정 규칙·수비 가중치는 유지.
- 안타를 친 타자가 추가 진루 중 아웃되는 복합 판정은 기존 엔진의 한계로 남는다. 중계·복잡한 보살 판정은 감독 상세 입력이 필요하며 현재 자동 제안은 직전 아웃 이후 동일 목표 베이스에 성공 송구한 선수로 제한한다. RBI와 실책 진루는 자동 판정하지 않는다.
- 과거 투구/삼진 수정,여러 플레이 일괄 정정,사진의 과거 시점 스냅샷,배치 순서 드래그는 미구현이다.

## 변경 파일

- README.md
- docs/DECISIONS.md
- docs/MIGRATION.md
- docs/ROSTER_DEFENSE_V3.md
- docs/SPEC.md
- docs/VALIDATION.md
- package-lock.json
- package.json
- src/App.tsx
- src/components/App.test.tsx
- src/components/DefenseEditor.tsx
- src/components/DefenseRecorder.tsx
- src/components/Field.tsx
- src/components/MatchView.tsx
- src/components/NewGame.tsx
- src/components/PhotoBackupPanel.tsx
- src/components/PlayDetailsEditor.tsx
- src/components/PlayForm.tsx
- src/components/PlayerAvatar.tsx
- src/components/PlayerEditor.tsx
- src/components/Players.tsx
- src/components/RosterDefense.test.tsx
- src/components/SelectionView.tsx
- src/components/SettingsView.tsx
- src/components/StatsView.tsx
- src/data/migration.test.ts
- src/data/migration.ts
- src/data/migrationV4.ts
- src/data/photoBackup.ts
- src/data/photos.test.ts
- src/data/photos.ts
- src/data/quickMigration.test.ts
- src/data/repository.ts
- src/data/rosterMigration.test.ts
- src/data/schema.ts
- src/data/schemaCommon.ts
- src/data/schemaV4.ts
- src/data/seed.ts
- src/domain/defense.ts
- src/domain/model.ts
- src/domain/roster.ts
- src/engine/defenseSequence.test.ts
- src/engine/defenseSequence.ts
- src/engine/game.ts
- src/styles.css
- vitest.config.ts

## 공식 기술 참고

- [createImageBitmap EXIF 방향](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
- [IndexedDB 트랜잭션](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
- [Web Crypto 암호화](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

### 직전 작업의 원격 반영 이력

2026-10-26: 네트워크 권한 허용 후 git fetch origin main은 성공했다. 최신 main과 기준 소스가 동일함을 확인한 뒤 작업 브랜치를 최신 main 위로 재배치했다. GitHub 연결 도구의 쓰기는403 Resource not accessible by integration,git push는 Windows Git credential-manager 실행 실패(NtCreateDirectoryObject 0xC0000022 / terminal prompts disabled)로 완료하지 못했다. 공개 GitHub Pages에 이번 변경이 배포되었다고 표시하지 않는다. 로컬 코드·커밋·반영용 패치는 보존한다.

### 인증 경로 복구 및 배포 진행 (2026-10-26)

GitHub 계정의 저장소 관리자·쓰기 권한을 확인했다. 연결 도구의403과 자동 실행 환경의 Windows 자격 증명 접근 오류는 별도 문제였다. 설치된 GitHub Desktop에 이 로컬 저장소를 등록하고 기존 로그인으로 feat/roster-defense-v3 게시에 성공했으며,원격 fd6eebc0b931e279bd57ac1c66177d583aa15667과 로컬 수정본의 일치를 확인했다. 토큰을 추출하거나 권한을 확대하지 않았다. 이후 main 반영은 GitHub Desktop의 Push origin으로 진행하고 GitHub Actions의 Verify/Pages 결과를 확인한다. 이전의 배포 실패 기록은 이력으로 보존한다.
