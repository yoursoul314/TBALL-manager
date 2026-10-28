const { chooseAssessor } = require('./qa-assessors.cjs');
const { installStorageReader } = require('./qa-storage.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'webkit',
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/',
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/defense-assessment', engine);
fs.mkdirSync(out, { recursive: true });
let browser, page;
const report = {
  engine,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
  errors: [],
};
const tap = (name) => page.getByRole('button', { name, exact: true }).click(),
  data = () => page.evaluate(() => window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')));
async function nav(name) {
  await page.locator('.version').waitFor({ state: 'attached' });
  const b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.click();
}
const check = (s) => {
  report.checks.push(s);
  console.log(s);
};
(async () => {
  browser = await pw[engine].launch({
    headless: true,
    ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  });
  const ctx = await browser.newContext({
    ...pw.devices['iPad (gen 7) landscape'],
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
    serviceWorkers: process.env.QA_DIST ? 'block' : 'allow',
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
  await installStorageReader(page);
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.14.3');
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  await tap('수비 개인별 이전 기록');
  await chooseAssessor(page, '평가자·수정자', '가상 QA');
  await tap('G 땅볼 성공');
  await tap('A 송구 정확도 실패');
  await page.getByText('실책·메모·시범 배점 설정', { exact: true }).click();
  await page.getByLabel('실책 분류 (별도 관찰)', { exact: true }).selectOption('throwing');
  await page.getByText('실책·메모·시범 배점 설정', { exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = original;
      if (k === 'tb-manager.workspace.v12') throw new Error('QA write failure');
      return original.call(this, k, v);
    };
  });
  await tap('수비 기록 저장 · 다음 상황');
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 성공', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.ok(await page.getByRole('alert').count());
  await tap('수비 기록 저장 · 다음 상황');
  let d = await data();
  assert.equal(d.defenseAssessments.length, 1);
  const r = d.defenseAssessments[0];
  assert.equal(r.revisions[0].observations.G, 'success');
  assert.equal(r.revisions[0].observations.A, 'failure');
  assert.equal(r.revisions[0].observations.C, null);
  assert.equal(r.revisions[0].error, 'throwing');
  assert.equal(d.events.length, 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 미관찰', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await tap('체크 점수를 수비 기능평가에 적용');
  assert.equal((await data()).defenseEvaluationChoices.at(-1).source, 'checklist');
  await tap('기능평가');
  assert.equal(await page.getByLabel('땅볼', { exact: true }).inputValue(), '100');
  assert.equal(await page.getByLabel('뜬공', { exact: true }).inputValue(), '');
  await tap('수비 체크리스트');
  await tap('수비 개인별 이전 기록');
  check(
    '기능평가 9항목 적용 및 미측정 분리 / 포구 성공·악송구 독립 체크 / 미관찰 null / 저장 실패 유지 / 다음 상황 초기화',
  );
  await tap('수비 기록 집중 모드');
  for (const [w, h] of [
    [1180, 820],
    [1024, 768],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => ({
      w: innerWidth,
      scroll: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('.defense-situations button,.defense-outcomes button')]
        .filter((e) => e.getClientRects().length)
        .map((e) => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })),
    }));
    assert.ok(m.scroll <= m.w + 1);
    assert.ok(m.buttons.every((b) => b.w >= 44 && b.h >= 48));
    report.metrics.push(m);
    if (w === 1180 || w === 390)
      await page.screenshot({ path: path.join(out, 'checklist-' + w + '.png'), fullPage: true });
  }
  await tap('집중 모드 끝내기');
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  await tap('수비 개인별 이전 기록');
  assert.equal((await data()).defenseAssessments.length, 1);
  let section = page.getByRole('region', { name: '수비 체크리스트 분석' });
  await section.getByText('100.0점', { exact: true }).waitFor();
  await section.getByText('0.0점', { exact: true }).waitFor();
  await page.getByText('상황별 기록·정정 이력 (1건)', { exact: true }).click();
  await tap(r.revisions[0].date + ' · 땅볼 수비 · 기록 · 수정');
  await tap('G 땅볼 부분 수행');
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('포구 재확인');
  await tap('수비 기록 정정 저장');
  assert.equal((await data()).defenseAssessments[0].revisions.length, 2);
  await section.getByText('50.0점', { exact: true }).waitFor();
  await tap(r.revisions[0].date + ' · 땅볼 수비 · 기록 · 수정');
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('중복 상황 취소');
  await tap('이 수비 기록 취소');
  d = await data();
  assert.equal(d.defenseAssessments[0].revisions.length, 3);
  assert.deepEqual(d.defenseAssessments[0].revisions[0], r.revisions[0]);
  assert.equal(await section.getByText('미측정', { exact: true }).count(), 9);
  check('새로고침 보존 / 능력별 시범 점수 / 원본 유지 정정·취소 재계산');
  await chooseAssessor(page, '평가자·수정자', '가상 QA');
  await tap('G 땅볼 성공');
  await tap('수비 기록 저장 · 다음 상황');
  await nav('선수 & 팀');
  await page.locator('.player-card').filter({ hasText: '샘플 선수 01' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '기능평가', exact: true }).click();
  section = page.getByRole('dialog').getByRole('region', { name: '수비 체크리스트 분석' });
  await section.getByText('100.0점', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'profile-defense.png'), fullPage: true });
  check('선수 프로필 시범 점수와 입력 화면 일치 / 기존 수동 평가·실전 기록 유지');
  assert.equal(report.errors.length, 0);
  report.status = 'passed';
})()
  .catch(async (e) => {
    report.status = 'failed';
    report.failure = e.stack;
    console.error(e);
    if (page)
      await page
        .screenshot({ path: path.join(out, 'failure.png'), fullPage: true })
        .catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
  });
