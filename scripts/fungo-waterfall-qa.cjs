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
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.14.0');

  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await page.getByLabel('1지망 포지션', { exact: true }).selectOption('SS');
  await page.getByLabel('2지망 포지션', { exact: true }).selectOption('1B');
  await tap('선수 저장');
  assert.equal((await data()).players[0].pref1, 'SS');
  await nav('기능평가 & 팀워크');
  await tap('펑고 5변수 평가');
  await page.getByLabel('새 펑고 날짜', { exact: true }).fill('2026-10-27');
  await chooseAssessor(page, '펑고 평가자', '가상 QA');
  await page.getByLabel('샘플 선수 01 · 1번', { exact: true }).check();
  await page.getByLabel('샘플 선수 02 · 2번', { exact: true }).check();
  await tap('펑고 날짜 · 학생 저장 (2명)');
  for (const [width, height] of [
    [1024, 768],
    [1180, 820],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const m = await page.evaluate(() => {
      const r = document.querySelector('.fungo-focus');
      return {
        w: innerWidth,
        h: innerHeight,
        horizontal: document.documentElement.scrollWidth,
        scroll: r.scrollHeight,
        height: r.clientHeight,
        save: document.querySelector('.fungo-save-bar').getBoundingClientRect().toJSON(),
      };
    });
    report.metrics.push(m);
    assert.ok(m.horizontal <= width + 1);
    if (width >= 700) assert.ok(m.save.bottom <= height + 1, 'save outside ' + JSON.stringify(m));
    await page.screenshot({ path: path.join(out, 'fungo-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  for (let i = 1; i <= 5; i++) {
    await page
      .getByRole('group', { name: i + '구 포구', exact: true })
      .getByRole('button', { name: '3', exact: true })
      .click();
    await page
      .getByRole('group', { name: i + '구 송구', exact: true })
      .getByRole('button', { name: '2', exact: true })
      .click();
    await page.getByLabel(i + '구 송구 강도·공 빼기', { exact: true }).fill('8');
  }
  await tap('정밀 모드');
  assert.equal(await page.getByLabel('정밀 F', { exact: true }).inputValue(), '10');
  await page.getByLabel('정밀 F', { exact: true }).fill('7');
  await tap('메모·정정');
  await page.getByLabel('펑고 메모', { exact: true }).fill('가상 별도 관찰');
  await page.evaluate(() => window.__qaKeyboard(420, 60));
  await page.waitForTimeout(120);
  const save = await page
    .getByRole('button', { name: '저장 · 다음 학생', exact: true })
    .boundingBox();
  assert.ok(save.y >= 60 && save.y + save.height <= 480);
  await page.screenshot({ path: path.join(out, 'fungo-keyboard.png') });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = original;
      if (k === 'tb-manager.workspace.v12')
        throw new Error('QA write failure');
      return original.call(this, k, v);
    };
  });
  await tap('저장 · 다음 학생');
  assert.equal((await data()).fungoAssessments.length, 0);
  assert.equal(await page.getByLabel('펑고 메모', { exact: true }).inputValue(), '가상 별도 관찰');
  await tap('저장 · 다음 학생');
  await page.evaluate(() => window.__qaKeyboard());
  assert.equal(await page.getByLabel('펑고 평가 학생', { exact: true }).inputValue(), 'green-2');
  assert.equal(await page.getByLabel('1구 송구 강도·공 빼기', { exact: true }).inputValue(), '');
  await tap('이전 학생');
  await tap('메모·정정');
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('가상 재확인');
  await tap('기록 취소');
  assert.equal((await data()).fungoAssessments[0].revisions.at(-1).status, 'cancelled');
  await tap('메모·정정');
  await page.getByLabel('수정·취소 사유', { exact: true }).fill('가상 취소 복원');
  await tap('기록 복원 저장');
  await tap('전체 화면 닫기');
  check(
    '선수 희망 저장 / 날짜 다중 학생 / 5구 자동 환산·정밀 조정 / 키보드 저장 / 실패 입력 보존 / 다음 학생 / 취소·복원 감사',
  );
  // Fresh QA context only: synthetic measured candidates for end-to-end waterfall approval.
  await page.evaluate(() => {
    const k = 'tb-manager.workspace.v12',
      d = window.__qaDecodeWorkspace(localStorage.getItem(k)),
      at = '2026-10-27T01:00:00Z',
      source = d.fungoAssessments[0].revisions.at(-1);
    d.fungoAssessments = d.players.slice(0, 12).map((p) => ({
      id: 'qa-' + p.id,
      playerId: p.id,
      revisions: [
        {
          ...source,
          id: 'qa-r-' + p.id,
          mode: 'precise',
          manual: { G: 8, F: 8, C: 8, T_acc: 8, T_pow: 8 },
          date: '2026-10-27',
          status: 'active',
        },
      ],
    }));
    d.battingSessions = d.players.slice(0, 12).map((p) => ({
      id: 'qa-s-' + p.id,
      playerId: p.id,
      date: '2026-10-27',
      sessionNumber: 1,
      targetAttempts: 1,
      assessor: '가상 QA',
      purpose: '브라우저 검증',
      note: '',
      status: 'completed',
      zoneDefinitionVersion: d.battingSettings.currentZoneVersion,
      rubricVersion: 'quality-six-v1',
      createdAt: at,
      updatedAt: at,
    }));
    d.battingAttempts = d.battingSessions.map((s) => ({
      id: 'qa-a-' + s.playerId,
      sessionId: s.id,
      attemptNumber: 1,
      result: 'fair',
      qualityGrade: 'solid',
      direction: 'center',
      directionZone: 'center-middle',
      trajectory: null,
      intensity: null,
      contactQuality: null,
      score: 4,
      note: '',
      status: 'active',
      createdAt: at,
      updatedAt: at,
    }));
    d.battingAudit = [
      ...d.battingSessions.map((s) => ({
        id: 'audit-' + s.id,
        entity: 'session',
        originalId: s.id,
        before: null,
        after: s,
        changedAt: at,
        changedBy: '가상 QA',
        reason: '검증',
      })),
      ...d.battingAttempts.map((a) => ({
        id: 'audit-' + a.id,
        entity: 'attempt',
        originalId: a.id,
        before: null,
        after: a,
        changedAt: at,
        changedBy: '가상 QA',
        reason: '검증',
      })),
    ];
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await nav('선발 시뮬레이션');
  await page.getByLabel('추천 방식', { exact: true }).selectOption('waterfall');
  await tap('포지션 시뮬레이션');
  let d = await data(),
    selection = d.selections.at(-1);
  assert.equal(selection.method, 'waterfall');
  assert.equal(selection.status, 'draft');
  assert.equal(new Set(selection.assignments.map((a) => a.playerId)).size, 10);
  assert.equal(selection.waterfall.feedback.length, 10);
  assert.ok(selection.waterfall.feedback.some((f) => f.text.includes('내야를 우선')));
  await page.screenshot({ path: path.join(out, 'waterfall.png'), fullPage: true });
  await tap('시범 배치 감독 승인');
  await page.getByLabel('승인 감독', { exact: true }).fill('가상 QA');
  await tap('배치안 승인 저장');
  assert.equal((await data()).selections.at(-1).status, 'approved');
  await page.reload({ waitUntil: 'networkidle' });
  d = await data();
  assert.equal(d.selections.at(-1).status, 'approved');
  assert.equal(d.players[0].pref1, 'SS');
  check('워터폴 10자리 중복 없음 / 내야 우선 / 점수 근거 / 감독 승인 / 새로고침 보존');
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
