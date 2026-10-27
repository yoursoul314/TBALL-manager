const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'webkit',
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/',
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/management', engine);
fs.mkdirSync(out, { recursive: true });
let browser, page;
const report = {
  engine,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
  errors: [],
};
const check = (s) => {
  report.checks.push(s);
  console.log(s);
};
async function nav(name) {
  const button = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).tap();
  await button.tap();
}
const tap = (name) => page.getByRole('button', { name, exact: true }).tap();
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('tb-manager.workspace.v12')));
async function formFit(name) {
  const r = await page.evaluate(() => {
    const boxes = [
      ...document.querySelectorAll(
        'input:not([type=checkbox]):not([type=hidden]):not([type=file]),select,textarea',
      ),
    ]
      .filter(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          getComputedStyle(e).visibility !== 'hidden' &&
          !e.closest('details:not([open])') &&
          (!document.querySelector('dialog[open]') || e.closest('dialog[open]')),
      )
      .map((e) => {
        const r = e.getBoundingClientRect(),
          p = e.closest('label')?.getBoundingClientRect();
        return {
          label: e.getAttribute('aria-label') || e.name || e.type,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          parent: p ? { x: p.x, y: p.y, w: p.width } : null,
        };
      });
    const bad = boxes.filter(
      (r) =>
        r.x < 0 ||
        r.x + r.w > innerWidth + 1 ||
        (r.parent && (r.x < r.parent.x - 1 || r.x + r.w > r.parent.x + r.parent.w + 1)),
    );
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        let a = boxes[i],
          b = boxes[j];
        if (
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1
        )
          overlaps.push([a.label, b.label]);
      }
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bad,
      overlaps,
      fields: boxes.length,
    };
  });
  assert.deepEqual(r.bad, [], name + ' outside label');
  assert.deepEqual(r.overlaps, [], name + ' overlapping controls');
  assert.equal(r.width, r.scrollWidth, name + ' horizontal overflow');
  report.metrics.push({ name, ...r });
}
async function captureBackup(button) {
  const n = await page.evaluate(() => window.qaBackups.length);
  await tap(button);
  await page.waitForFunction((n) => window.qaBackups.length > n, n);
  return page.evaluate(() => window.qaBackups.at(-1));
}
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
    await ctx.route(url + '**', (route) =>
      route.fulfill({
        path: path.resolve(
          process.env.QA_DIST,
          new URL(route.request().url()).pathname.replace('/TBALL-manager/', '') || 'index.html',
        ),
      }),
    );
  await ctx.addInitScript(() => {
    window.qaBackups = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === 'application/json') blob.text().then((t) => window.qaBackups.push(t));
      return original(blob);
    };
  });
  page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await nav('선수 & 팀');
  await tap('선수 등록');
  assert.equal(await page.getByLabel('소속 팀', { exact: true }).count(), 0);
  await page.getByLabel('선수 이름', { exact: true }).fill('QA 공통 등록 학생');
  await page.getByLabel('학년', { exact: true }).selectOption('2');
  await page.getByLabel('반', { exact: true }).fill('12');
  await page.getByLabel('학생 번호', { exact: true }).fill('30');
  await page
    .getByLabel('학생 사진 선택', { exact: true })
    .setInputFiles(path.resolve('src/test/browser-fixtures/qa-photo.png'));
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await formFit('player-' + size.width);
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('dialog').evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: path.join(out, '01-registration.png') });
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const p = (await data()).players.at(-1);
  assert.equal(p.teamId, null);
  await nav('기능평가 & 팀워크');
  if(await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).count()) await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).click();
  assert.equal(
    await page
      .getByLabel('선수 선택', { exact: true })
      .getByRole('option', { name: /QA 공통 등록 학생/ })
      .count(),
    1,
  );
  await nav('선수 & 팀');
  await tap('QA 공통 등록 학생 선수 삭제');
  await tap('선수 삭제 확정');
  await nav('기능평가 & 팀워크');
  if(await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).count()) await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).click();
  assert.equal(await page.getByRole('option', { name: /QA 공통 등록 학생/ }).count(), 0);
  await nav('선수 & 팀');
  await tap('삭제된 선수 · 1');
  await tap('QA 공통 등록 학생 선수 복원');
  check('팀 없는 학생 등록·사진 저장·삭제·복원·평가 명단 자동 연동');
  await nav('경기 기록실');
  await tap('새 경기');
  await tap('등록 선수 불러오기');
  await tap('QA 공통 등록 학생 선발 선택');
  await tap('후공 엔트리 · 0/10명');
  await tap('등록 선수 불러오기');
  assert.equal(
    await page.getByRole('button', { name: 'QA 공통 등록 학생 선발 선택', exact: true }).count(),
    0,
  );
  for (const size of [
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await formFit('new-game-' + size.width);
    await page.locator('.entry-arrangement > summary').tap();
    await formFit('new-game-open-' + size.width);
    await page.locator('.entry-arrangement > summary').tap();
  }
  await tap('닫기');
  check('공통 명단 불러오기와 양 팀 중복 편성 방지·입력칸 겹침 검사');
  await page.setViewportSize({ width: 1180, height: 820 });
  await nav('규칙 & 설정');
  await tap('앱 업데이트 확인');
  await page.getByText('현재 BETA 0.13.0입니다.', { exact: true }).waitFor();
  await formFit('settings');
  const before = await data();
  await tap('초기화 준비');
  assert(await page.getByRole('button', { name: '기록 초기화 실행', exact: true }).isDisabled());
  const backup = await captureBackup('초기화 전 백업 다운로드');
  assert.equal(JSON.parse(backup).workspace.players.length, before.players.length);
  await page.getByLabel('백업 파일이 저장된 것을 확인했습니다').check();
  await page.getByLabel('확인 문구', { exact: true }).fill('기록 초기화');
  await tap('기록 초기화 실행');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  let next = await data();
  assert.equal(next.games.length, 0);
  assert.equal(next.assessments.length, 0);
  assert.deepEqual(next.players, before.players);
  await page.reload({ waitUntil: 'networkidle' });
  await nav('경기 분석');
  await page.getByText(/표시할 경기가 없습니다/).waitFor();
  check('백업 확인 전 초기화 차단·기록만 초기화·선수/사진 보존·새로고침');
  // Simulate the existing v6 device's migration, in this isolated context only.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('tb-manager.workspace.v12'));
    delete d.lastReset;
    delete d.migrationSource;
    delete d.legacySource;
    for (const key of Object.keys(d)) if (key.startsWith('_')) delete d[key];
    d.schemaVersion = 6;
    localStorage.setItem('tb-manager.workspace.v6', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v12');
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).schemaVersion, 12);
  assert(await page.evaluate(() => !!localStorage.getItem('tb-manager.workspace.v6')));
  await nav('규칙 & 설정');
  await tap('전체 초기화 · 선수/팀/사진 포함');
  await tap('초기화 준비');
  await page.getByLabel('초기화 백업 암호', { exact: true }).fill('QA-only-backup-2026');
  const protectedBackup = await captureBackup('초기화 전 백업 다운로드');
  fs.writeFileSync(path.join(out, 'qa-protected-before-reset.json'), protectedBackup);
  assert.equal(JSON.parse(protectedBackup).format, 'tb-manager-protected-backup');
  await page.getByLabel('백업 파일이 저장된 것을 확인했습니다').check();
  await page.getByLabel('확인 문구', { exact: true }).fill('전체 초기화');
  await tap('전체 초기화 실행');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  next = await data();
  assert.equal(next.players.length, 0);
  assert.equal(next.teams.length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v6')), null);
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  if(await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).count()) await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).click();
  await page.getByText(/등록된 선수가 없습니다/).waitFor();
  await nav('선수 & 팀');
  await tap('선수 등록');
  await page.getByLabel('선수 이름', { exact: true }).fill('QA 초기화 후 단독 등록');
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await nav('기능평가 & 팀워크');
  if(await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).count()) await page.getByRole('button',{name:'개인별 이전 기록',exact:true}).click();
  assert.equal(await page.getByLabel('선수 선택', { exact: true }).getByRole('option').count(), 1);
  check('전체 초기화·구버전 저장본 제거·팀 없이 재등록·등록 학생만 평가에 표시');
  await nav('규칙 & 설정');
  await page.getByLabel('사진 백업 암호', { exact: true }).fill('QA-only-backup-2026');
  await page
    .getByLabel('암호화 사진 백업 파일', { exact: true })
    .setInputFiles(path.join(out, 'qa-protected-before-reset.json'));
  await tap('암호로 백업 확인');
  await tap('현재 기록·사진 백업 후 복원');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual((await data()).players, before.players);
  await nav('선수 & 팀');
  await tap('QA 공통 등록 학생 정보 수정');
  await page.getByRole('dialog').getByRole('img').first().waitFor();
  await tap('닫기');
  await page.screenshot({ path: path.join(out, '02-management.png') });
  check('초기화 전 암호화 백업으로 학생·사진 복원');
  assert.deepEqual(report.errors, []);
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
