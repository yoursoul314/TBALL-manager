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
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.13.1');

  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const d = window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12'));
    delete d.defenseDays;
    delete d.comparisonSelection;
    for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
    d.schemaVersion = 8;
    localStorage.setItem('tb-manager.workspace.v8', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v12');
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).schemaVersion, 12);
  assert.ok(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v8')));
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-27');
  await page.getByLabel('수비 공통 평가자', { exact: true }).fill('가상 QA');
  await tap('수비 평가 날짜 생성');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  assert.equal(await page.getByLabel('수비 날짜 선택', { exact: true }).inputValue(), '2026-10-27');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 수비 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 수비 평가 시작');
  const abilities = {
    G: '땅볼',
    F: '뜬공',
    C: '송구 포구',
    A: '송구 정확도',
    L: '송구 거리·강도',
    Q: '첫 반응',
    M: '수비 범위',
    J: '상황 판단',
    B: '베이스 처리',
  };
  if (
    await page
      .getByRole('button', { name: '첫 반응·수비 범위·판단 등 9능력 펼치기', exact: true })
      .isVisible()
  )
    await tap('첫 반응·수비 범위·판단 등 9능력 펼치기');
  for (const [k, l] of Object.entries(abilities)) await tap(k + ' ' + l + ' 성공');
  assert.ok(await page.getByRole('button', { name: '다음 수비 학생', exact: true }).isDisabled());
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = orig;
      if (k === 'tb-manager.workspace.v12')
        throw new Error('QA write failure');
      return orig.call(this, k, v);
    };
  });
  await tap('수비 기록 저장 · 다음 학생');
  assert.equal((await data()).defenseAssessments.length, 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 성공', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await tap('수비 기록 저장 · 다음 학생');
  await page
    .getByRole('heading', { name: '수비 상황 체크리스트 · 샘플 선수 02', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 미관찰', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  if (
    await page
      .getByRole('button', { name: '첫 반응·수비 범위·판단 등 9능력 펼치기', exact: true })
      .isVisible()
  )
    await tap('첫 반응·수비 범위·판단 등 9능력 펼치기');
  for (const [k, l] of Object.entries(abilities)) await tap(k + ' ' + l + ' 부분 수행');
  await tap('수비 기록 저장 · 다음 학생');
  await tap('집중 모드 끝내기');
  assert.equal((await data()).defenseAssessments.length, 2);
  await tap('평가 학생 누적 체크 점수 적용');
  assert.equal((await data()).defenseEvaluationChoices.length, 2);
  await page
    .locator('.defense-comparison-table')
    .screenshot({ path: path.join(out, '01-defense-nine.png') });
  check(
    'v8 원문 보존 / 수비 날짜 먼저 저장·새로고침 / 2명 선택·저장 후 다음 학생·실패 유지 / 9능력 점수 일괄 적용',
  );
  await nav('선수 비교 & 선택');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 비교 선택', { exact: true }).check();
  await page.getByLabel('비교 분석 최소 관찰 수', { exact: true }).fill('1');
  await tap('수비 수치');
  assert.ok(await page.getByText(/비교 1명 평균 50.0/).count());
  await page
    .locator('.comparison-insights')
    .screenshot({ path: path.join(out, '02-evidence-comparison.png') });
  await page.getByLabel('샘플 선수 01 검토 후보', { exact: true }).check();
  await page.getByLabel('후보 선정 메모', { exact: true }).fill('가상 관찰 근거 검토');
  await tap('검토 후보 저장');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('선수 비교 & 선택');
  assert.deepEqual((await data()).comparisonSelection.playerIds, ['green-1']);
  assert.equal((await data()).comparisonSelection.status, 'draft');
  await nav('경기 기록실');
  await tap('새 경기');
  await tap('비교 후보 불러오기');
  await page.getByText('선택 1명 · 표시 24명', { exact: true }).waitFor();
  await tap('선택 학생 팀에 배정');
  await page.getByRole('button', { name: '선공 엔트리 · 1/10명', exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  check(
    '타격·수비 비교 및 표본 제한 / 상대 장단점 근거 / 후보 초안 저장·새로고침 / 경기 불러오기·수동 팀 배정',
  );
  await nav('기능평가 & 팀워크');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-27');
  await page.getByLabel('공통 평가자', { exact: true }).fill('가상 QA');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('타격');
  await page.getByLabel('날짜 평가 척도',{exact:true}).selectOption('manual-ten-v1');
  await tap('평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  await tap('정상 타격');
  await tap('평가 8점');
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await page.getByRole('button', { name: /기록지 보기/ }).click();
  assert.ok(await page.locator('.attempt-sheet').isVisible());
  await page.getByRole('button', { name: /기록지 숨기기/ }).click();
  assert.equal(
    await page.getByRole('button', { name: '평가 8점', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
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
      editor: document.querySelector('.attempt-editor-pane').getBoundingClientRect().toJSON(),
    }));
    assert.ok(m.scroll <= m.w + 1);
    report.metrics.push(m);
    if (w === 1180) await page.screenshot({ path: path.join(out, '03-batting-sheet-hidden.png') });
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  await tap('기록 저장 · 다음 회차');
  assert.equal((await data()).battingAttempts[0].score, 8);
  check('타격 상세 기록지 기본 숨김·보기/숨김 전환·초안 유지·넓은 입력 / 4개 화면 크기');
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
