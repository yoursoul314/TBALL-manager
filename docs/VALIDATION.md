# 실행 검증 기록

검증일: 2026-10-20 (Asia/Seoul). 초기 버전 v0.1.

## 환경

- Windows / Node.js 24.19.0 / npm 11.17.0
- React 19.3.1, TypeScript 5.9.3, Vite 7.3.7, Vitest 4.1.12
- npm lockfile 포함, GitHub Actions는 Node.js 24 / Ubuntu.

## 자동 검증 결과

| 항목 | 결과 |
|---|---|
| TypeScript strict 검사 | 통과 |
| Vitest | 5개 파일 / 44개 테스트 통과 |
| 프로덕션 빌드 | 통과 |
| PWA | manifest, 서비스 워커, PNG 아이콘, 앱 셸 precache 생성 |
| GitHub Actions Verify | 성공 |
| GitHub Pages build + deploy | 성공 |

검증한 구현 커밋: `05e0de9946b9c19c67b1a154f31d8a784be96ac9`.

- [서버 자동 검사 결과](https://github.com/yoursoul314/TBALL-manager/actions/runs/39389370516)
- [최초 배포 성공 결과](https://github.com/yoursoul314/TBALL-manager/actions/runs/39389370452)
- [실행 웹앱](https://yoursoul314.github.io/TBALL-manager/)

테스트는 RULE01~08 경계, 마지막 타자 잔루 복구, 공통 완료 이닝 판정, 재생 결정성·정정, TYPE1 원문 일치, 결측·최적 배치, 정책별 통계, 백업·충돌·quota 및 React 파울 입력을 포함합니다.

Windows 샌드박스의 기본 임시 폴더 rename 제한은 프로젝트 내부 임시 폴더를 사용하는 테스트 실행기로 해결했습니다. 로컬 미리보기의 loopback 연결은 실행 환경에서 시간 초과되어, 배포된 HTTPS 페이지로 브라우저 검증을 수행했습니다.

## 배포 후 브라우저 검증

- 한국어 제목·대시보드·샘플 2팀 24명 정상 표시.
- 경기 기록실 진입, 타구 결과·주자 위치·아웃·수비 관찰 입력 UI 확인.
- 선수 터치 시 스카우팅 프로필: 9개 능력과 타구 방향·질·수비·주루 유형 표시.
- 저장된 라이브 플레이가 페이지 새로고침 후 복원됨.
- 브라우저 콘솔 오류 0건.
- PC 기본 화면, 820×1180(iPad 세로 크기), 390×844(소형 화면)에서 확인.
- 검사한 각 화면의 document scrollWidth ≤ viewport width: 페이지 가로 넘침 없음.
- PC 대시보드와 iPad 크기 경기 화면 캡처 저장.

업로드 후 Git 원격 트리와 로컬 소스를 비교하여 모든 파일이 일치함을 확인했습니다(Windows lockfile 개행 차이는 정규화하여 비교).

## 검증의 한계

- iPad 크기 검증은 브라우저 뷰포트 검증이며 실제 iPad Safari 하드웨어 테스트가 아닙니다.
- Safari 설치, 장시간 오프라인·백그라운드 복귀, 저장소 정리/용량, 실제 수업 심판 판정은 별도 검증이 필요합니다.
- 오프라인 앱 셸은 빌드·배포 산출물을 확인했으며, 실제 네트워크 차단을 통한 런타임 오프라인 검증은 수행하지 않았습니다.
- 계정·권한·멀티기기 자동 동기화는 미구현입니다.
- 최종 종합 선발·실측 환산 기준은 미확정이며 현재 배치는 시범 수비 포지션 추천입니다.
