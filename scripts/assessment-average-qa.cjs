// Public/local WebKit QA: synthetic students in an isolated browser only.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { installStorageReader } = require('./qa-storage.cjs');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/';
const out = path.resolve(process.env.QA_OUTPUT || 'test-results/assessment-average');
fs.mkdirSync(out, { recursive: true });
const report = {
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  version: '',
  checks: [],
  metrics: [],
  errors: [],
};
const day1 = '2026-10-27',
  day2 = '2026-10-28',
  actor = '가상 터치 평가자';
let browser, page;
const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
const data = () =>
  page.evaluate(() => window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')));
async function nav(name) {
  const b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.tap();
}
async function selectActor(label) {
  const b = page
    .getByRole('group', { name: label, exact: true })
    .getByRole('button', { name: new RegExp('^(✓ )?' + actor + '$') });
  await b.tap();
  assert.equal(await b.getAttribute('aria-pressed'), 'true');
  const r = await b.boundingBox();
  assert(r.height >= 48 && r.width >= 48);
}
async function purpose(label, value) {
  const g = page.getByRole('group', { name: label + ' 선택', exact: true });
  const b = g.getByRole('button', { name: new RegExp('^(✓ )?' + value + '$') });
  await b.tap();
  assert.equal(await b.getAttribute('aria-pressed'), 'true');
  assert.equal(await g.getByRole('textbox').inputValue(), value);
  const r = await b.boundingBox();
  assert(r.height >= 48);
  const box = await g.boundingBox();
  assert(box.width >= 220);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}
async function manage(kind, date, deleted = false) {
  await nav('기능평가 & 팀워크');
  await tap('평가자·기록 관리');
  await tap(kind);
  await page.getByLabel('관리할 평가 날짜', { exact: true }).selectOption(date);
  await tap(deleted ? '삭제한 기록' : '유효 기록');
}
async function confirm(restore = false) {
  await selectActor('처리 평가자');
  await tap(restore ? '복원 확인' : '삭제 확인');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function recordChange(kind, date, restore = false) {
  await manage(kind, date, restore);
  await page
    .locator('.assessment-management-records article')
    .first()
    .getByRole('button', { name: restore ? '기록 복원' : '기록 삭제', exact: true })
    .tap();
  await confirm(restore);
}
async function dateChange(kind, date, restore = false) {
  await manage(kind, date);
  await tap(restore ? '선택 날짜 복원' : '선택 날짜 삭제');
  await confirm(restore);
}
async function profile(expected, label) {
  await nav('선수 & 팀');
  await page.locator('.player-card').filter({ hasText: '샘플 선수 01' }).tap();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '기능평가', exact: true }).tap();
  const b = dialog.getByRole('region', { name: '타격 기능평가 분석', exact: true });
  const score = await b.getByTestId('batting-score').textContent();
  assert.equal(score, expected.b === null ? '평가 기록 없음' : expected.b.toFixed(1));
  const hint = await b.locator('p.hint').first().textContent();
  assert(hint.includes('유효 ' + expected.n + '회'), hint);
  const defense = dialog.getByRole('region', { name: '수비 체크리스트 분석', exact: true });
  const g = defense.locator('.defense-score-grid > div').first();
  const defenseScore = await g.locator('b').textContent();
  assert.equal(defenseScore, expected.g === null ? '미측정' : expected.g.toFixed(1) + '점');
  assert((await g.innerText()).includes('유효 ' + expected.gn + '회'));
  // An unobserved ability must remain missing, never a made-up zero.
  assert.equal(
    await defense.locator('.defense-score-grid > div').nth(1).locator('b').textContent(),
    '미측정',
  );
  const d = await data(),
    sessions = d.battingSessions.filter(
      (s) => s.playerId === 'green-1' && s.status !== 'cancelled',
    );
  const active = d.battingAttempts.filter(
    (a) =>
      sessions.some((s) => s.id === a.sessionId) &&
      a.status === 'active' &&
      a.score !== null &&
      a.result !== null,
  );
  assert.equal(active.length, expected.n);
  const raw = active.length ? active.reduce((s, a) => s + a.score, 0) / active.length : null;
  if (raw !== null) assert(Math.abs(((raw + 1) / 6) * 100 - expected.b) < 1e-8);
  for (const date of [day1, day2]) {
    const a = active.filter((a) => sessions.find((s) => s.id === a.sessionId).date === date);
    const row = b.getByTestId('batting-day').filter({ hasText: date });
    if (a.length) {
      assert(
        (await row.textContent()).includes(
          '평균 ' + (a.reduce((s, a) => s + a.score, 0) / a.length).toFixed(1),
        ),
      );
    }
  }
  report.metrics.push({
    label,
    batting: score,
    battingCount: expected.n,
    rawAverage: raw,
    defenseG: defenseScore,
    defenseCount: expected.gn,
  });
  await b.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, label + '-batting.png') });
  await defense.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, label + '-defense.png') });
  await dialog.getByRole('button', { name: '닫기', exact: true }).tap();
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
  report.version = await page.locator('.version').textContent();
  assert.equal(report.version, 'BETA 0.14.2');
  await nav('기능평가 & 팀워크');
  await tap('평가자·기록 관리');
  await page.getByLabel('등록할 평가자', { exact: true }).fill(actor);
  await tap('평가자 등록 저장');
  const untouched = await data();
  for (const [date, grades] of [
    [day1, ['5점 장타성 정타(배럴)', '1점 팝플라이·내야뜬공']],
    [day2, ['2점 약한 땅볼']],
  ]) {
    await tap('타격 상세평가');
    await page.getByLabel('새 평가 날짜', { exact: true }).fill(date);
    await page.getByLabel('공통 타격 횟수', { exact: true }).fill(String(grades.length));
    await selectActor('공통 평가자');
    await purpose('공통 평가 목적', '수비 평가');
    await purpose('공통 평가 목적', '타격 평가');
    assert.equal((await data()).battingDays.length, date === day1 ? 0 : 1);
    await page.screenshot({ path: path.join(out, 'purpose-' + date + '.png') });
    await tap('평가 날짜 생성');
    assert.equal((await data()).battingDays.find((d) => d.date === date).purpose, '타격 평가');
    await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
    await tap('선택 학생 평가 시작');
    for (const grade of grades) {
      await tap(grade);
      await tap('기록 저장 · 다음 회차');
    }
    await tap('전체 화면 닫기');
    if (date === day1) {
      await tap('1 날짜·설정');
      await tap('새 평가 날짜 만들기');
    }
  }
  for (const [date, values] of [
    [day1, ['성공', '부분 수행']],
    [day2, ['실패']],
  ]) {
    await tap('수비 체크리스트');
    if (date === day2) await tap('새 수비 날짜 만들기');
    await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill(date);
    await page.getByLabel('학생당 수비 횟수', { exact: true }).fill(String(values.length));
    await selectActor('수비 공통 평가자');
    await purpose('수비 평가 목적', '타격 평가');
    await purpose('수비 평가 목적', '수비 평가');
    await tap('수비 평가 날짜 생성');
    assert.equal((await data()).defenseDays.find((d) => d.date === date).purpose, '수비 평가');
    await page.getByLabel('샘플 선수 01 수비 평가 대상 선택', { exact: true }).check();
    await tap('선택 학생 수비 평가 시작');
    for (const value of values) {
      await tap('G 땅볼 ' + value);
      await tap('수비 기록 저장 · 다음 상황');
    }
    await tap('집중 모드 끝내기');
  }
  const original = await data();
  assert.equal(original.assessmentManagement.assessors.length, 1);
  report.checks.push('평가자 1회 등록 후 두 날짜의 타격·수비 평가자와 목적을 터치로 선택·저장');
  const base = { b: ((8 / 3 + 1) / 6) * 100, n: 3, g: 50, gn: 3 };
  await profile(base, '01-before');
  await recordChange('타격 회차', day1);
  await profile({ ...base, b: ((1.5 + 1) / 6) * 100, n: 2 }, '02-batting-deleted');
  await page.reload({ waitUntil: 'networkidle' });
  await profile({ ...base, b: ((1.5 + 1) / 6) * 100, n: 2 }, '03-deleted-reload');
  await recordChange('타격 회차', day1, true);
  await profile(base, '04-batting-restored');
  await recordChange('수비 상황', day1);
  await profile({ ...base, g: 25, gn: 2 }, '05-defense-deleted');
  await recordChange('수비 상황', day1, true);
  await profile(base, '06-defense-restored');
  report.checks.push(
    '개별 삭제·복원: 타격 61.1→41.7→61.1, 수비 G 50.0→25.0→50.0; 날짜별 평균 및 저장 후 재로딩 일치',
  );
  await dateChange('타격 세션', day1);
  await profile({ ...base, b: 50, n: 1 }, '07-batting-date-deleted');
  await dateChange('타격 세션', day2);
  await profile({ ...base, b: null, n: 0 }, '08-batting-all-deleted');
  await dateChange('수비 상황', day1);
  await profile({ b: null, n: 0, g: 0, gn: 1 }, '09-defense-date-deleted');
  await dateChange('수비 상황', day2);
  await profile({ b: null, n: 0, g: null, gn: 0 }, '10-all-deleted');
  report.checks.push(
    '날짜 전체 삭제: 남은 날짜만 반영, 타격 0회는 평가 기록 없음, 수비 0회는 미측정; 실제 실패 1회 0점과 구분',
  );
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const kind of ['타격 세션', '수비 상황'])
    for (const date of [day1, day2]) await dateChange(kind, date, true);
  await profile(base, '11-portrait-restored');
  await page.reload({ waitUntil: 'networkidle' });
  await profile(base, '12-restored-reload');
  const final = await data();
  for (const field of ['players', 'teams', 'games', 'events', 'assessments'])
    assert.deepEqual(final[field], untouched[field]);
  assert.deepEqual(final.battingDays, original.battingDays);
  assert.deepEqual(final.defenseDays, original.defenseDays);
  assert.deepEqual(
    final.battingAttempts.map(({ updatedAt, ...a }) => a),
    original.battingAttempts.map(({ updatedAt, ...a }) => a),
  );
  assert.deepEqual(
    final.defenseAssessments.map((r) => r.revisions[0]),
    original.defenseAssessments.map((r) => r.revisions[0]),
  );
  assert(final.battingAudit.length > original.battingAudit.length);
  for (const [width, height] of [
    [1024, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await manage('타격 회차', day1);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'management-' + width + '.png') });
    await tap('타격 상세평가');
    await tap('새 평가 날짜 만들기');
    await selectActor('공통 평가자');
    await purpose('공통 평가 목적', '타격 평가');
    await page.screenshot({ path: path.join(out, 'purpose-layout-' + width + '.png') });
  }
  report.checks.push(
    '세로 모드에서 날짜별 복원 및 재로딩 유지; 원본 관찰·기존 선수/팀/경기/평가 보존; 가로·세로 넘침 없음',
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
      report.pageText = (await page.locator('body').innerText()).slice(0, 7000);
      await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
  })
  .finally(async () => {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    console.log(JSON.stringify(report));
  });
