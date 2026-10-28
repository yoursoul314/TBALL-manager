const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { installStorageReader } = require('./qa-storage.cjs');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  url = 'https://yoursoul314.github.io/TBALL-manager/';
const out = path.resolve(process.env.QA_OUTPUT || 'test-results/assessment-defaults');
fs.mkdirSync(out, { recursive: true });
const report = { source: process.env.QA_DIST ? 'local-dist' : 'deployed', checks: [], errors: [] };
let browser, page;
const key = 'tb-manager.last-assessor.v1';
const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
const group = (label) => page.getByRole('group', { name: label, exact: true });
const data = () =>
  page.evaluate(() => window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')));
async function nav(name) {
  const b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.tap();
}
async function select(label, name) {
  await group(label)
    .getByRole('button', { name: new RegExp('^(✓ )?' + name + '$') })
    .tap();
}
async function selected(label, name) {
  assert.equal(
    await group(label)
      .getByRole('button', { name: '✓ ' + name, exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
}
async function battingNew() {
  await tap('타격 상세평가');
  await tap('새 평가 날짜 만들기');
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
  await tap('평가자·기록 관리');
  for (const name of ['가상 A', '가상 B']) {
    await page.getByLabel('등록할 평가자', { exact: true }).fill(name);
    await tap('평가자 등록 저장');
  }
  const original = await data();
  await tap('타격 상세평가');
  await selected('공통 평가 목적 선택', '타격 평가');
  await select('공통 평가자', '가상 A');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-27');
  await tap('평가 날짜 생성');
  await tap('1 날짜·설정');
  await tap('새 평가 날짜 만들기');
  await selected('공통 평가자', '가상 A');
  await selected('공통 평가 목적 선택', '타격 평가');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('가상 사용자 목적');
  await tap('평가 날짜 생성');
  await tap('1 날짜·설정');
  await tap('새 평가 날짜 만들기');
  await selected('공통 평가 목적 선택', '타격 평가');
  await tap('수비 체크리스트');
  await selected('수비 평가 목적 선택', '수비 평가');
  await selected('수비 공통 평가자', '가상 A');
  await select('수비 공통 평가자', '가상 B');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-28');
  await tap('수비 평가 날짜 생성');
  let d = await data();
  assert.deepEqual(
    d.battingDays.map((x) => [x.date, x.purpose, x.assessor]),
    [
      ['2026-10-27', '타격 평가', '가상 A'],
      ['2026-10-28', '가상 사용자 목적', '가상 A'],
    ],
  );
  assert.equal(d.defenseDays[0].assessor, '가상 B');
  assert.equal(d.defenseDays[0].purpose, '수비 평가');
  report.checks.push(
    '타격/수비 기본 목적, 다른 목적 직접 입력, 새 날짜 기본값 복귀; 평가자 A→B 변경 후 과거 날짜 보존',
  );
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('새 평가 날짜 만들기');
  await selected('공통 평가자', '가상 B');
  await tap('펑고 5변수 평가');
  await selected('펑고 평가자', '가상 B');
  await tap('평가자·기록 관리');
  await tap('타격 세션');
  await tap('선택 날짜 삭제');
  assert.equal(
    await page.getByRole('button', { name: '삭제 확인', exact: true }).isDisabled(),
    true,
  );
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().tap();
  await tap('가상 B 사용 중지');
  await battingNew();
  assert.equal(await group('공통 평가자').locator('input[type=hidden]').inputValue(), '');
  assert.equal(
    await group('공통 평가자')
      .getByRole('button', { name: /가상 B/ })
      .count(),
    0,
  );
  await select('공통 평가자', '가상 A');
  await tap('평가자·기록 관리');
  await tap('가상 B 사용 복원');
  await battingNew();
  await selected('공통 평가자', '가상 A');
  report.checks.push(
    '새로고침/펑고에 마지막 평가자 적용, 사용 중지 평가자 자동 선택 차단, 삭제 확인 평가자는 자동 선택하지 않음',
  );
  await page.evaluate((k) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === k) {
        Storage.prototype.setItem = set;
        throw new DOMException('QA quota', 'QuotaExceededError');
      }
      return set.call(this, key, value);
    };
  }, key);
  await select('공통 평가자', '가상 B');
  await selected('공통 평가자', '가상 B');
  await group('공통 평가자').getByRole('status').waitFor();
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-30');
  await tap('평가 날짜 생성');
  assert.equal((await data()).battingDays.find((d) => d.date === '2026-10-30').assessor, '가상 B');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('새 평가 날짜 만들기');
  await selected('공통 평가자', '가상 A');
  await select('공통 평가자', '가상 B');
  report.checks.push(
    '기억 저장 실패 시 현재 선택으로 날짜 저장 가능, 경고 표시, 재실행 시 마지막 성공 값 유지',
  );
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await selected('공통 평가자', '가상 B');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const b = group('공통 평가자').getByRole('button', { name: '✓ 가상 B', exact: true });
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert(box.height >= 48);
    await page.screenshot({ path: path.join(out, 'defaults-' + width + '.png') });
  }
  const final = await data();
  for (const field of [
    'players',
    'teams',
    'games',
    'events',
    'assessments',
    'battingAttempts',
    'defenseAssessments',
  ])
    assert.deepEqual(final[field], original[field]);
  assert.equal(final.battingDays[0].assessor, '가상 A');
  assert.equal(final.defenseDays[0].assessor, '가상 B');
  assert.equal(
    await page.evaluate((k) => localStorage.getItem(k), key),
    final.assessmentManagement.assessors.find((a) => a.name === '가상 B').id,
  );
  report.checks.push(
    '가로/세로 48px 터치 및 입력칸 확인; ID만 기억하고 기존 선수/경기/평가 원본 변경 없음',
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
