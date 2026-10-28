const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { installStorageReader } = require('./qa-storage.cjs'),
  { chooseAssessor } = require('./qa-assessors.cjs');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  url = 'https://yoursoul314.github.io/TBALL-manager/';
const out = path.resolve(process.env.QA_OUTPUT || 'test-results/defense-sequence');
fs.mkdirSync(out, { recursive: true });
const report = {
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
  errors: [],
};
let browser, page;
const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
const data = () =>
  page.evaluate(() => window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')));
const save = () => page.getByRole('button', { name: /^수비 기록 저장 ·/ }).tap();
const heading = (n) =>
  page.getByRole('heading', { name: '수비 상황 체크리스트 · 샘플 선수 ' + n, exact: true });
async function nav(name) {
  const b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.tap();
}
(async () => {
  browser = await pw.webkit.launch({
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
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.14.2');
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('학생당 수비 횟수', { exact: true }).fill('3');
  await chooseAssessor(page, '수비 공통 평가자', '가상 수비 기록원');
  await tap('수비 평가 날짜 생성');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 수비 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 수비 평가 시작');
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.getByRole('button', { name: /^수비 기록 저장 ·/ });
    const box = await b.boundingBox();
    assert(box.y >= 0 && box.y + box.height <= height + 1, JSON.stringify(box));
    assert(box.height >= 44);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'sequence-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  for (let i = 1; i <= 2; i++) {
    await tap('G 땅볼 성공');
    await save();
    await heading('01').waitFor();
    assert.equal((await data()).defenseAssessments.length, i);
    assert(
      (await page.getByLabel('수비 기록 진행', { exact: true }).textContent()).includes(
        '남은 ' + (3 - i) + '회',
      ),
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'G 땅볼 미관찰', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
  }
  await tap('G 땅볼 성공');
  const before = await data();
  await page.evaluate(() => {
    const s = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = s;
      if (k === 'tb-manager.workspace.v12') throw Error('QA write failure');
      return s.call(this, k, v);
    };
  });
  await save();
  await page.getByRole('alert').filter({ hasText: 'QA write failure' }).first().waitFor();
  await heading('01').waitFor();
  assert.deepEqual(await data(), before);
  await save();
  await heading('02').waitFor();
  assert.deepEqual(
    (await data()).defenseAssessments.map((r) => r.playerId),
    ['green-1', 'green-1', 'green-1'],
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 미관찰', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  report.checks.push(
    '첫 학생1·2회 저장은 유지,3회 성공 후 다음 학생; 마지막 회차 저장 실패는 입력과 학생 유지',
  );
  for (let i = 1; i <= 3; i++) {
    await tap('G 땅볼 부분 수행');
    await save();
    await heading('02').waitFor();
    assert.equal((await data()).defenseAssessments.length, 3 + i);
  }
  assert.equal(await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).isDisabled(), true);
  assert(
    (await page.getByLabel('수비 기록 진행', { exact: true }).textContent()).includes(
      '3 / 3회 · 완료',
    ),
  );
  const original = await data();
  report.metrics.push({ student1: 3, student2: 3, total: original.defenseAssessments.length });
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  assert.deepEqual((await data()).defenseAssessments, original.defenseAssessments);
  await heading('01').waitFor();
  assert.equal(await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).isDisabled(), true);
  report.checks.push(
    '두번째 학생도3회까지 유지, 마지막 학생 완료 후 추가 저장 차단; 새로고침 시 원본6건과 진행률 보존',
  );
  await page.getByText('상황별 기록·정정 이력 (3건)', { exact: true }).tap();
  await page
    .getByRole('button', { name: '2026-10-28 · 땅볼 수비 · 기록 · 수정', exact: true })
    .first()
    .tap();
  await tap('G 땅볼 실패');
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('가상 정정 검증');
  await tap('수비 기록 정정 저장');
  await heading('01').waitFor();
  await page
    .getByRole('button', { name: '2026-10-28 · 땅볼 수비 · 기록 · 수정', exact: true })
    .first()
    .tap();
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('가상 취소 검증');
  await tap('이 수비 기록 취소');
  await heading('01').waitFor();
  assert(
    (await page.getByLabel('수비 기록 진행', { exact: true }).textContent()).includes('남은 1회'),
  );
  await tap('G 땅볼 성공');
  await save();
  await heading('02').waitFor();
  const final = await data();
  assert.equal(
    final.defenseAssessments.filter(
      (r) => r.playerId === 'green-1' && r.revisions.at(-1).status === 'active',
    ).length,
    3,
  );
  for (const r of original.defenseAssessments)
    assert.deepEqual(
      final.defenseAssessments.find((x) => x.id === r.id).revisions[0],
      r.revisions[0],
    );
  assert.deepEqual(final.events, original.events);
  assert.deepEqual(final.players, original.players);
  report.checks.push(
    '정정·취소는 이동하지 않음; 취소한 회차 보충 후에만 다음 학생 이동; 원본·정정 이력 및 경기/학생 보존',
  );
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
})()
  .catch(async (e) => {
    report.status = 'failed';
    report.failure = e.stack;
    process.exitCode = 1;
    console.error(e);
    if (page) {
      report.text = (await page.locator('body').innerText()).slice(0, 6000);
      await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
  })
  .finally(async () => {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    console.log(JSON.stringify(report));
  });
