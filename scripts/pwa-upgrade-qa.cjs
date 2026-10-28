const { chooseAssessor } = require('./qa-assessors.cjs');
const { installStorageReader } = require('./qa-storage.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'chromium',
  dist = path.resolve(process.env.QA_DIST || 'dist'),
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/pwa', engine);
fs.mkdirSync(out, { recursive: true });
let phase = 'latest',
  future = false,
  browser,
  page;
const report = { engine, checks: [] };
const oldHTML =
  '<!doctype html><html><body><h1>BETA 0.5</h1><script>navigator.serviceWorker.register("./sw.js")</script></body></html>';
const oldSW =
  'self.addEventListener("install",e=>e.waitUntil(caches.open("qa-old-shell").then(c=>c.addAll(["./"]))));self.addEventListener("activate",e=>e.waitUntil(clients.claim()));self.addEventListener("fetch",e=>{if(e.request.mode==="navigate")e.respondWith(caches.match("./").then(r=>r||fetch(e.request)))});';
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Type',
    pathname.endsWith('.js')
      ? 'application/javascript'
      : pathname.endsWith('.css')
        ? 'text/css'
        : pathname.endsWith('.json')
          ? 'application/json'
          : pathname.endsWith('.png')
            ? 'image/png'
            : 'text/html',
  );
  if (phase === 'old' && (pathname === '/' || pathname === '/index.html' || pathname === '/sw.js'))
    return res.end(pathname === '/sw.js' ? oldSW : oldHTML);
  if (pathname === '/version.json' && future) return res.end('{"version":"9.0.0"}');
  const file = path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await pw[engine].launch({
    headless: true,
    ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  });
  const fixtureCtx = await browser.newContext({ serviceWorkers: 'block' });
  const fixture = await fixtureCtx.newPage();
  await installStorageReader(fixture);
  await fixture.goto(url);
  await fixture.getByRole('button', { name: '선수 & 팀', exact: true }).click();
  await fixture.getByRole('button', { name: '팀 추가', exact: true }).click();
  await fixture.getByLabel('팀 이름', { exact: true }).fill('QA 업그레이드 보존팀');
  await fixture.getByRole('button', { name: '팀 저장', exact: true }).click();
  const raw = await fixture.evaluate(() => {
    const d = window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12'));
    for (const key of Object.keys(d)) if (key.startsWith('_')) delete d[key];
    d.schemaVersion = 5;
    return JSON.stringify(d);
  });
  await fixtureCtx.close();
  phase = 'old';
  const ctx = await browser.newContext();
  page = await ctx.newPage();
  await installStorageReader(page);
  page.setDefaultTimeout(20000);
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByText('BETA 0.5', { exact: true }).waitFor();
  await page.evaluate((raw) => localStorage.setItem('tb-manager.workspace.v5', raw), raw);
  phase = 'latest';
  await page.reload();
  await page.getByText('BETA 0.5', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    const worker = reg.installing || reg.waiting;
    if (worker && worker.state !== 'activated')
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('upgrade timeout')), 20000);
        const changed = () => {
          if (worker.state === 'activated') {
            clearTimeout(timeout);
            resolve();
          }
          if (worker.state === 'redundant') {
            clearTimeout(timeout);
            reject(Error('worker redundant'));
          }
        };
        worker.addEventListener('statechange', changed);
        changed();
      });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'BETA 0.14.1', exact: true }).waitFor();
  const next = await page.evaluate(() =>
    window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12')),
  );
  assert.equal(next.schemaVersion, 13);
  assert.deepEqual(next.players, JSON.parse(raw).players);
  assert.deepEqual(next.games, JSON.parse(raw).games);
  assert.equal(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v5')), raw);
  report.checks.push('0.5 캐시 화면 재현 → 새 서비스워커 활성화 → 0.13 재열기 및 v5 원본/기록 보존');
  await page.getByRole('button', { name: '기능평가 & 팀워크', exact: true }).click();
  await page.getByRole('button', { name: '개인별 이전 기록', exact: true }).click();
  await chooseAssessor(page, '세션 평가자', 'QA');
  await page.getByLabel('평가 목적', { exact: true }).fill('미저장 보호');
  await page.getByLabel('세션 평가 척도',{exact:true}).selectOption('manual-ten-v1');
  await page.getByRole('button', { name: '평가 세션 생성', exact: true }).click();
  await page.getByRole('button', { name: '정상 타격', exact: true }).click();
  await page.getByRole('button', { name: '평가 8점', exact: true }).click();
  future = true;
  await page.getByRole('button', { name: 'BETA 0.14.1', exact: true }).click();
  await page.getByRole('button', { name: '새 버전 적용', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: '새 버전 적용', exact: true }).isDisabled());
  report.checks.push('미저장 평가 입력 중 업데이트 적용 차단·강제 새로고침 없음');
  await page.screenshot({ path: path.join(out, 'upgrade-preserved.png') });
  report.status = 'passed';
  console.log(report.checks.join('\n'));
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
    server.close();
  });
