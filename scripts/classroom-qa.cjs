const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.argv[2] || 'webkit',
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/classroom', engine),
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/';
fs.mkdirSync(out, { recursive: true });
const report = {
  engine,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
};
let browser, page;
const check = (t) => {
  console.log(t);
  report.checks.push(t);
};
async function nav(name) {
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).tap();
}
async function data() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tb-manager.workspace.v7')));
}
async function fit(name, locators) {
  const rows = [];
  for (const l of locators) {
    const r = await l.boundingBox();
    assert(r, name + ' missing');
    assert(
      r.x >= -1 &&
        r.y >= -1 &&
        r.x + r.width <= page.viewportSize().width + 1 &&
        r.y + r.height <= page.viewportSize().height + 1,
      name + ' outside screen ' + JSON.stringify(r),
    );
    rows.push(r);
  }
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth),
    page.viewportSize().width,
  );
  report.metrics.push({ name, viewport: page.viewportSize(), regions: rows });
}
(async () => {
  browser = await pw[engine].launch({
    headless: true,
    ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  });
  const context = await browser.newContext({
    ...pw.devices['iPad (gen 7) landscape'],
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
    serviceWorkers: process.env.QA_DIST ? 'block' : 'allow',
  });
  if (process.env.QA_DIST)
    await context.route(url + '**', (route) =>
      route.fulfill({
        path: path.resolve(
          process.env.QA_DIST,
          new URL(route.request().url()).pathname.replace('/TBALL-manager/', '') || 'index.html',
        ),
      }),
    );
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  await nav('선수 & 팀');
  await page.getByRole('button', { name: '팀 추가', exact: true }).tap();
  await page.getByLabel('팀 이름', { exact: true }).fill('QA 세 번째 팀');
  await page.getByRole('button', { name: '팀 저장', exact: true }).tap();
  let before = await data();
  assert.equal(before.teams.length, 3);
  await page.getByRole('button', { name: '그린 윙스 팀 삭제', exact: true }).tap();
  await page.getByRole('button', { name: '팀 삭제 확정', exact: true }).tap();
  let after = await data();
  assert(after.teams[0].archivedAt);
  assert.deepEqual(after.players, before.players);
  assert.deepEqual(after.games, before.games);
  assert.deepEqual(after.assessments, before.assessments);
  await page.reload({ waitUntil: 'networkidle' });
  await nav('선수 & 팀');
  await page.getByRole('button', { name: '삭제된 팀 · 1', exact: true }).tap();
  await page.getByRole('button', { name: '그린 윙스 팀 복원', exact: true }).tap();
  assert.equal((await data()).teams[0].archivedAt, null);
  check('팀 추가·삭제·새로고침·복원 및 선수·평가·경기 보존');
  await nav('경기 기록실');
  await page.getByRole('button', { name: '2학년 티볼 연습 경기 삭제', exact: true }).tap();
  await page.getByRole('button', { name: '휴지통으로 이동', exact: true }).tap();
  await page.getByText('표시할 경기가 없습니다. 새 경기를 추가하세요.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await nav('경기 분석');
  await page
    .getByText('표시할 경기가 없습니다. 경기 목록에서 추가하거나 휴지통에서 복원하세요.', {
      exact: true,
    })
    .waitFor();
  await nav('경기 기록실');
  await page.getByRole('button', { name: '휴지통 · 1', exact: true }).tap();
  await page.getByRole('button', { name: '2학년 티볼 연습 경기 복원', exact: true }).tap();
  await page.getByRole('button', { name: '경기 목록 · 1', exact: true }).tap();
  await page.screenshot({ path: path.join(out, '01-match-library.png') });
  check('경기 목록·삭제·빈 통계·복원');
  await page.getByRole('button', { name: '새 경기', exact: true }).tap();
  await page.getByLabel('경기 이름', { exact: true }).fill('QA 분할 기록 경기');
  await page.getByRole('button', { name: '수비 기능 추천 적용 · 초안', exact: true }).tap();
  await page.getByRole('button', { name: '후공 엔트리 · 0/10명', exact: true }).tap();
  await page.getByRole('button', { name: '수비 기능 추천 적용 · 초안', exact: true }).tap();
  await page.getByLabel('엔트리 확인 감독').fill('QA 감독');
  await page.getByLabel(/양 팀 선발 10명/).check();
  await page.getByRole('button', { name: '경기 생성', exact: true }).tap();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '1루타', exact: true }).tap();
  const game = (await data()).games.at(-1),
    batter = (await data()).players.find((p) => p.id === game.lineups.away[0]);
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await fit('game-' + size.width, [
      page.locator('.match-status'),
      page.getByRole('button', { name: '1루타', exact: true }),
      page.getByRole('button', { name: batter.name + ' 결과 확인', exact: true }),
      page.getByRole('button', { name: '심판 타임 · 플레이 확정', exact: true }),
      page.locator('.defense-recorder .field'),
    ]);
    await page.screenshot({ path: path.join(out, '02-cockpit-' + size.width + '.png') });
  }
  await page.getByRole('button', { name: batter.name + ' 결과 확인', exact: true }).tap();
  await page.getByLabel('심판 타임 선언 확인').check();
  await page.getByRole('button', { name: '심판 타임 · 플레이 확정', exact: true }).tap();
  await page.getByRole('button', { name: '← 경기 목록', exact: true }).tap();
  await page.getByRole('button', { name: 'QA 분할 기록 경기 경기 열기', exact: true }).tap();
  await page.getByRole('heading', { name: 'QA 분할 기록 경기', exact: true }).waitFor();
  check('아이패드 가로에서 공격·수비·주자확인·확정 동시 노출 및 저장/재진입');
  const eventCount = (await data()).events.length;
  await page.setViewportSize({ width: 1180, height: 820 });
  await nav('기능평가 & 팀워크');
  await page.getByLabel('평가 날짜', { exact: true }).fill('2026-10-26');
  await page.getByLabel('세션 평가자', { exact: true }).fill('QA 감독');
  await page.getByLabel('평가 목적', { exact: true }).fill('전체 화면 검증');
  await page.getByRole('button', { name: '평가 세션 생성', exact: true }).tap();
  await page.getByRole('button', { name: '상세 모드', exact: true }).tap();
  await page.getByRole('button', { name: '정상 타격', exact: true }).tap();
  await page.getByRole('button', { name: '평가 8점', exact: true }).tap();
  await page.getByRole('button', { name: '좌 원거리', exact: true }).tap();
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await page.locator('.record-input-anchor').evaluate((e) => (e.scrollTop = 0));
    await fit('assessment-' + size.width, [
      page.getByRole('button', { name: '정상 타격', exact: true }),
      page.getByRole('button', { name: '평가 10점', exact: true }),
      page.getByRole('button', { name: '우 근거리', exact: true }),
      page.locator('.attempt-sheet-pane'),
      page.getByRole('button', { name: '기록 저장 · 다음 회차', exact: true }),
    ]);
    await page.screenshot({ path: path.join(out, '03-assessment-' + size.width + '.png') });
  }
  await page.getByRole('button', { name: '정상 타격', exact: true }).tap();
  await page.getByRole('button', { name: '좌 원거리', exact: true }).tap();
  await page
    .getByRole('group', { name: '타구 유형', exact: true })
    .getByRole('button', { name: '땅볼', exact: true })
    .tap();
  await page
    .getByRole('group', { name: '타구 강도', exact: true })
    .getByRole('button', { name: '강', exact: true })
    .tap();
  await page.getByRole('button', { name: '평가 8점', exact: true }).tap();
  await page.getByRole('button', { name: '기록 저장 · 다음 회차', exact: true }).tap();
  await page.getByRole('heading', { name: '2회차 기록', exact: true }).waitFor();
  assert.equal((await data()).battingAttempts.at(-1).score, 8);
  assert.equal((await data()).events.length, eventCount);
  await page.getByRole('button', { name: '정상 타격', exact: true }).tap();
  await page.getByRole('button', { name: '평가 9점', exact: true }).tap();
  await page.getByRole('button', { name: '전체 화면 닫기', exact: true }).tap();
  assert.equal(
    await page.getByRole('button', { name: '평가 9점', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: '상세 모드', exact: true }).tap();
  await page.getByRole('button', { name: '기록 저장 · 다음 회차', exact: true }).tap();
  assert.equal(
    (await data()).battingAttempts.filter((a) => a.score !== null).reduce((s, a) => s + a.score, 0),
    17,
  );
  check('상세평가 결과·9구역·점수·회차 기록지 동시 노출 및 초안 보존/다음 회차 저장');
  report.status = 'passed';
})()
  .catch(async (e) => {
    report.status = 'failed';
    report.failure = e.stack;
    console.error(e.stack);
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
  });
