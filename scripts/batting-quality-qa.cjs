const { chooseAssessor } = require('./qa-assessors.cjs');
const { installStorageReader } = require('./qa-storage.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'webkit',
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/',
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/tablet-assessment', engine);
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
  // Simulate keyboard geometry in an isolated test browser, never user storage.
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    let height = null,
      top = 0;
    Object.defineProperties(viewport, {
      height: { get: () => height ?? innerHeight },
      width: { get: () => innerWidth },
      offsetTop: { get: () => top },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    window.__qaKeyboard = (h = null, t = 0) => {
      height = h;
      top = t;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
    window.addEventListener('resize', () => viewport.dispatchEvent(new Event('resize')));
  });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.14.3');

  // Create genuine legacy observations via the preserved editor, then emulate v11 storage.
  await nav('기능평가 & 팀워크');
  await tap('개인별 이전 기록');
  await page.getByLabel('평가 날짜', { exact: true }).fill('2026-10-26');
  await page.getByLabel('세션 평가 척도', { exact: true }).selectOption('manual-ten-v1');
  await chooseAssessor(page, '세션 평가자', '가상 QA');
  await page.getByLabel('평가 목적', { exact: true }).fill('이전 평가');
  await tap('평가 세션 생성');
  await tap('정상 타격');
  await tap('평가 8점');
  await tap('기록 저장 · 다음 회차');
  const old = await page.evaluate(() => {
    const d = window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12'));
    for (const key of Object.keys(d)) if (key.startsWith('_')) delete d[key];
    d.schemaVersion = 11;
    for (const s of d.battingSessions) delete s.rubricVersion;
    for (const a of d.battingAudit)
      if (a.entity === 'session') {
        if (a.before) delete a.before.rubricVersion;
        delete a.after.rubricVersion;
      }
    localStorage.setItem('tb-manager.workspace.v11', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v12');
    return d;
  });
  await page.reload({ waitUntil: 'networkidle' });
  const migrated = await data();
  assert.equal(migrated.schemaVersion, 13);
  assert.deepEqual(migrated.battingAttempts, old.battingAttempts);
  assert.deepEqual(migrated.battingAudit, old.battingAudit);
  assert.deepEqual(
    JSON.parse(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v11'))),
    old,
  );
  check('v11 원문·이전8점·감사 이력 그대로 이전');
  await nav('기능평가 & 팀워크');
  await tap('새 평가 날짜 만들기');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-28');
  await page.getByLabel('공통 타격 횟수', { exact: true }).fill('6');
  await chooseAssessor(page, '공통 평가자', '가상 QA');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('타구 질');
  assert.equal(
    await page.getByLabel('날짜 평가 척도', { exact: true }).inputValue(),
    'quality-six-v1',
  );
  await tap('평가 날짜 생성');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  assert.equal(await page.locator('.quality-grades button').count(), 6);
  assert.equal(await page.getByRole('group', { name: '타구 강도', exact: true }).count(), 0);
  assert.equal(await page.getByRole('group', { name: '타격 정확성', exact: true }).count(), 0);
  for (const [width, height] of [
    [1440, 900],
    [1180, 820],
    [1024, 768],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const root = document.querySelector('.batting-studio');
      return {
        w: innerWidth,
        h: innerHeight,
        scroll: root.scrollHeight,
        height: root.clientHeight,
        horizontal: document.documentElement.scrollWidth,
        buttons: [
          ...root.querySelectorAll(
            '.quality-grades button,.zone-row button,.record-save-bar button',
          ),
        ]
          .filter((b) => b.getBoundingClientRect().width)
          .map((b) => ({ text: b.textContent, ...b.getBoundingClientRect().toJSON() })),
      };
    });
    report.metrics.push(m);
    assert.ok(m.horizontal <= width + 1);
    if (width >= 700) {
      assert.ok(m.scroll <= m.height + 2, 'scroll ' + JSON.stringify(m));
      for (const b of m.buttons) {
        assert.ok(b.width >= 48 && b.height >= 48, 'small ' + JSON.stringify(b));
        assert.ok(b.top >= 0 && b.bottom <= height + 1, 'outside ' + JSON.stringify(b));
      }
    }
    await page.screenshot({ path: path.join(out, 'quality-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await tap('5점 장타성 정타(배럴)');
  await tap('우 원거리');
  await page.locator('.quality-optional summary').click();
  await tap('직선타');
  await page.locator('.quality-optional summary').click();
  await tap('메모·정정');
  await page.getByLabel('회차 메모', { exact: true }).fill('가상 질 관찰');
  await page.evaluate(() => window.__qaKeyboard(400, 80));
  await page.waitForTimeout(100);
  const memo = await page.getByLabel('회차 메모', { exact: true }).boundingBox(),
    save = await page
      .getByRole('button', { name: '기록 저장 · 다음 회차', exact: true })
      .boundingBox();
  assert.ok(memo.height > 0 && memo.y >= 80 && memo.y + memo.height <= save.y);
  assert.ok(save.y + save.height <= 480);
  await page.screenshot({ path: path.join(out, 'quality-keyboard.png') });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = original;
      if (k === 'tb-manager.workspace.v12')
        throw new Error('QA write failure');
      return original.call(this, k, v);
    };
  });
  await tap('기록 저장 · 다음 회차');
  assert.equal((await data()).battingAttempts.length, 1);
  assert.equal(await page.getByLabel('회차 메모', { exact: true }).inputValue(), '가상 질 관찰');
  await tap('기록 저장 · 다음 회차');
  await page.evaluate(() => window.__qaKeyboard());
  assert.equal(
    await page
      .getByRole('button', { name: '5점 장타성 정타(배럴)', exact: true })
      .getAttribute('aria-pressed'),
    'false',
  );
  const names = [
    '4점 강한 땅볼·단타성 직선타',
    '2점 약한 땅볼',
    '1점 팝플라이·내야뜬공',
    '0점 일반 파울',
    '-1점 티 타격 파울·헛스윙',
  ];
  for (const name of names) {
    await tap(name);
    if (name.startsWith('-1'))
      assert.ok(await page.getByRole('button', { name: '우 원거리', exact: true }).isDisabled());
    await tap('기록 저장 · 다음 회차');
  }
  let d = await data(),
    rounds = d.battingAttempts.filter((a) => a.sessionId !== old.battingSessions[0].id);
  assert.deepEqual(
    rounds.map((a) => a.score),
    [5, 4, 2, 1, 0, -1],
  );
  assert.equal(rounds[0].trajectory, 'line');
  assert.equal(rounds[0].directionZone, 'right-far');
  assert.ok(rounds.every((a) => a.intensity === null && a.contactQuality === null));
  assert.ok(rounds.slice(1).every((a) => a.directionZone === null && a.trajectory === null));
  await tap('성장 분석');
  assert.equal(await page.getByTestId('batting-score').textContent(), '47.2');
  await page.getByLabel('조회 평가 척도', { exact: true }).selectOption('manual-ten-v1');
  assert.equal(await page.getByTestId('batting-score').textContent(), '80.0');
  await page.getByLabel('조회 평가 척도', { exact: true }).selectOption('quality-six-v1');
  await page.screenshot({ path: path.join(out, 'quality-analysis.png') });
  check(
    '6등급 점수·9구역·유형 독립 관찰 / 강도·정확성 미생성 / 누적47.2와 이전80 분리 / 키보드·저장실패 보존',
  );
  await tap('기록지 조회');
  await page.getByRole('listitem', { name: '1회차 5점', exact: true }).click();
  await tap('4점 강한 땅볼·단타성 직선타');
  await tap('메모·정정');
  await page.getByLabel('회차 수정 사유', { exact: true }).fill('가상 영상 재확인');
  await page.evaluate(() => window.__qaKeyboard(420));
  await page.waitForTimeout(100);
  const reason = await page.getByLabel('회차 수정 사유', { exact: true }).boundingBox();
  assert.ok(reason.y >= 0 && reason.y + reason.height <= 340);
  await tap('정정 저장 · 다음 회차');
  await page.evaluate(() => window.__qaKeyboard());
  d = await data();
  assert.equal(d.battingAttempts.find((a) => a.id === rounds[0].id).score, 4);
  assert.equal(d.battingAttempts.find((a) => a.id === rounds[0].id).trajectory, 'line');
  assert.ok(
    d.battingAudit.some(
      (a) => a.before?.qualityGrade === 'barrel' && a.after?.qualityGrade === 'solid',
    ),
  );
  await tap('성장 분석');
  assert.equal(await page.getByTestId('batting-score').textContent(), '44.4');
  await tap('회차 측정');
  await tap('다음 평가 학생');
  await tap('5점 장타성 정타(배럴)');
  await tap('기록 저장 · 다음 회차');
  await tap('전체 화면 닫기');
  await page.reload({ waitUntil: 'networkidle' });
  d = await data();
  assert.equal(d.battingAttempts.length, 8);
  assert.deepEqual(
    d.battingAttempts.find((a) => a.id === old.battingAttempts[0].id),
    old.battingAttempts[0],
  );
  check('과거 회차 정정·원본 감사·44.4 재계산 / 다음 학생 분리 / 새로고침 후 유지');
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
