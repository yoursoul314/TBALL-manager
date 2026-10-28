// Synthetic fixtures in an isolated browser only.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { installStorageReader } = require('./qa-storage.cjs'),
  { chooseAssessor } = require('./qa-assessors.cjs');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'webkit',
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/';
const out = path.resolve(process.env.QA_OUTPUT || 'test-results/assessment-recreate', engine);
fs.mkdirSync(out, { recursive: true });
const report = {
  engine,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  errors: [],
};
let browser, page;
const tap = (name) => page.getByRole('button', { name, exact: true }).click();
async function nav(name) {
  let b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.click();
}
const data = () =>
  page.evaluate(() => window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')));
async function confirm(restore = false) {
  await chooseAssessor(page, '처리 평가자', '가상 기록원');
  await tap(restore ? '복원 확인' : '삭제 확인');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
(async () => {
  browser = await pw[engine].launch({
    headless: true,
    ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  });
  const ctx = await browser.newContext({
    ...pw.devices['iPad (gen 7) landscape'],
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  if (process.env.QA_DIST)
    await ctx.route(url + '**', (r) =>
      r.fulfill({
        path: path.resolve(
          process.env.QA_DIST,
          new URL(r.request().url()).pathname.replace('/TBALL-manager/', '') || 'index.html',
        ),
      }),
    );
  page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await installStorageReader(page);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.14.3');
  await nav('기능평가 & 팀워크');
  await tap('평가자·기록 관리');
  await page.getByLabel('등록할 평가자', { exact: true }).fill('가상 기록원');
  await tap('평가자 등록 저장');
  assert.equal((await data()).assessmentManagement.assessors.length, 1);
  await tap('타격 상세평가');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('공통 타격 횟수', { exact: true }).fill('1');
  await chooseAssessor(page, '공통 평가자', '가상 기록원');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('삭제·복원 QA');
  await tap('평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  await tap('5점 장타성 정타(배럴)');
  await tap('기록 저장 · 다음 회차');
  await tap('전체 화면 닫기');
  const batting = await data();
  assert.equal(batting.battingAttempts[0].score, 5);
  await tap('수비 체크리스트');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-28');
  await chooseAssessor(page, '수비 공통 평가자', '가상 기록원');
  await tap('수비 평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 수비 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 수비 평가 시작');
  await tap('G 땅볼 성공');
  await tap('수비 기록 저장 · 다음 상황');
  await tap('집중 모드 끝내기');
  await tap('펑고 5변수 평가');
  await page.getByLabel('새 펑고 날짜', { exact: true }).fill('2026-10-28');
  await chooseAssessor(page, '펑고 평가자', '가상 기록원');
  await page.getByLabel('샘플 선수 01 · 1번', { exact: true }).check();
  await tap('펑고 날짜 · 학생 저장 (1명)');
  await tap('정밀 모드');
  await page.getByLabel('정밀 G', { exact: true }).fill('8');
  await tap('펑고 기록 저장');
  await tap('전체 화면 닫기');
  const original = await data();
  assert.equal(original.assessmentManagement.assessors.length, 1);
  report.checks.push(
    'One registered evaluator selected by touch for batting, defense and fungo; records saved',
  );

  // Delete all three date groups. New dates must never restore these records.
  await tap('평가자·기록 관리');
  for (const label of ['타격 세션', '수비 상황', '펑고 기록']) {
    await tap(label);
    await tap('선택 날짜 삭제');
    await confirm();
  }
  const deleted = await data();
  await tap('타격 상세평가');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('공통 타격 횟수', { exact: true }).fill('2');
  await chooseAssessor(page, '공통 평가자', '가상 기록원');
  // Verify failed creation is atomic and retains the form before retrying.
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'tb-manager.workspace.v12') {
        Storage.prototype.setItem = set;
        throw Error('QA create failure');
      }
      return set.call(this, k, v);
    };
  });
  await tap('평가 날짜 생성');
  await page.getByRole('alert').filter({ hasText: 'QA create failure' }).first().waitFor();
  assert.deepEqual(await data(), deleted);
  assert.equal(await page.getByLabel('공통 타격 횟수', { exact: true }).inputValue(), '2');
  await tap('평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  await tap('2점 약한 땅볼');
  await tap('기록 저장 · 다음 회차');
  await tap('전체 화면 닫기');
  let d = await data();
  assert.equal(d.battingSessions.length, 2);
  assert.equal(d.battingSessions[0].status, 'cancelled');
  assert.equal(d.battingSessions[1].targetAttempts, 2);
  assert.equal(d.battingAttempts.length, 2);
  assert.equal(d.battingAttempts[1].score, 2);
  assert.deepEqual(d.battingSessions[0], deleted.battingSessions[0]);
  assert.deepEqual(d.battingAttempts[0], deleted.battingAttempts[0]);
  report.checks.push(
    '타격 날짜 삭제→같은 날짜 새 세션→새 점수 저장; 실패 시 원본/입력 보존, 이전 세션은 삭제 상태',
  );
  await tap('수비 체크리스트');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('학생당 수비 횟수', { exact: true }).fill('2');
  await chooseAssessor(page, '수비 공통 평가자', '가상 기록원');
  await tap('수비 평가 날짜 생성');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 수비 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 수비 평가 시작');
  await tap('G 땅볼 부분 수행');
  await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).click();
  await page
    .getByRole('heading', { name: '수비 상황 체크리스트 · 샘플 선수 01', exact: true })
    .waitFor();
  assert(
    (await page.getByLabel('수비 기록 진행', { exact: true }).textContent()).includes('남은 1회'),
  );
  await page.screenshot({ path: path.join(out, 'recreated-defense-1024.png') });
  await tap('G 땅볼 부분 수행');
  await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).click();
  await page
    .getByRole('heading', { name: '수비 상황 체크리스트 · 샘플 선수 02', exact: true })
    .waitFor();
  await tap('집중 모드 끝내기');
  d = await data();
  assert.deepEqual(d.defenseAssessments[0], deleted.defenseAssessments[0]);
  assert.equal(d.defenseAssessments.length, 3);
  assert.equal(d.defenseDays[0].targetAttempts, 2);
  report.checks.push(
    '수비 같은 날짜 새 평가의 1회차 유지, 새 목표 2회 완료 후 다음 학생 이동; 이전 기록 제외',
  );
  await tap('펑고 5변수 평가');
  await page.getByLabel('새 펑고 날짜', { exact: true }).fill('2026-10-28');
  await chooseAssessor(page, '펑고 평가자', '가상 기록원');
  await page.getByLabel('샘플 선수 01 · 1번', { exact: true }).check();
  await tap('펑고 날짜 · 학생 저장 (1명)');
  await tap('정밀 모드');
  assert.equal(await page.getByLabel('정밀 G', { exact: true }).inputValue(), '');
  await page.getByLabel('정밀 G', { exact: true }).fill('4');
  await tap('펑고 기록 저장');
  await tap('전체 화면 닫기');
  d = await data();
  assert.equal(d.fungoAssessments.length, 2);
  assert.deepEqual(d.fungoAssessments[0], deleted.fungoAssessments[0]);
  assert.equal(d.fungoAssessments[1].revisions[0].manual.G, 4);
  await tap('학생 점수 비교');
  assert.deepEqual(
    await page
      .getByRole('row', { name: /샘플 선수 01/ })
      .getByRole('cell')
      .allTextContents(),
    ['4.0', '미측정', '미측정', '미측정', '미측정', '5.0'],
  );
  report.checks.push('펑고 같은 날짜는 빈 입력에서 새 ID로 기록, 이전 5변수 원본/취소 이력 유지');
  assert.equal(d.schemaVersion, 14);
  assert.equal(d.assessmentManagement.dayHistory.filter((h) => h.restart).length, 3);
  assert.deepEqual(d.games, original.games);
  assert.deepEqual(d.players, original.players);
  assert.deepEqual(d.events, original.events);
  await tap('평가자·기록 관리');
  await tap('타격 세션');
  await tap('삭제한 기록');
  await page.getByRole('button', { name: '기록 복원', exact: true }).waitFor();
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'recreated-history-' + width + '.png') });
  }
  const final = await data();
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(await data(), final);
  report.checks.push('기존 기록 삭제 목록 보존, 가로·세로 화면 넘침 없음, 새로고침 후 동일 저장');
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
})()
  .catch(async (e) => {
    report.status = 'failed';
    report.failure = e.stack;
    process.exitCode = 1;
    console.error(e);
    if (page) {
      report.pageText = (await page.locator('body').innerText()).slice(0, 6000);
      await page.screenshot({ path: path.join(out, 'failure.png') });
    }
  })
  .finally(async () => {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    console.log(JSON.stringify(report));
  });
