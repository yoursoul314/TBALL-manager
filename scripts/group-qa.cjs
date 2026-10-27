const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright'),
  engine = process.argv[2] || 'webkit',
  url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/',
  out = path.resolve(process.env.QA_OUTPUT || 'test-results/groups', engine);
fs.mkdirSync(out, { recursive: true });
let browser, page;
const report = {
  engine,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
  errors: [],
};
const tap = (name) => page.getByRole('button', { name, exact: true }).click();
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('tb-manager.workspace.v11')));
async function nav(name) {
  const b = page.locator('.sidebar').getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) await tap('메뉴 열기');
  await b.click();
}
const check = (s) => {
  report.checks.push(s);
  console.log(s);
};
async function purge() {
  await page.getByLabel('완전삭제 백업 암호', { exact: true }).fill('QA-protected-backup-2026');
  await tap('완전삭제 전 백업 다운로드');
  await page.getByLabel('백업 파일과 삭제 범위를 확인했습니다', { exact: true }).check();
  await page.getByLabel('완전삭제 확인 문구', { exact: true }).fill('완전삭제');
  await tap('선택 항목 완전삭제 실행');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
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
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  report.version = await page.locator('.version').textContent();
  assert.equal(report.version, 'BETA 0.12.0');
  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('tb-manager.workspace.v11'));
    d.players = d.players.map((p, i) => ({
      ...p,
      grade: i < 10 ? 2 : 3,
      classroom: i < 10 ? '1' : '2',
    }));
    delete d.battingDays;
    d.schemaVersion = 7;
    for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
    localStorage.setItem('tb-manager.workspace.v7', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v11');
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).schemaVersion, 11);
  assert(await page.evaluate(() => !!localStorage.getItem('tb-manager.workspace.v7')));
  check('v7 원문 보존 이전·학년/반 가상 자료');
  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await page
    .getByLabel('학생 사진 선택', { exact: true })
    .setInputFiles(path.resolve('src/test/browser-fixtures/qa-photo.png'));
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.locator('.player-card').filter({ hasText: '샘플 선수 01' }).click();
  const photo = page.locator('.profile-hero .player-photo img');
  await photo.waitFor();
  await photo.evaluate((img) => img.decode());
  const m = await photo.evaluate((img) => ({
    fit: getComputedStyle(img).objectFit,
    width: img.parentElement.getBoundingClientRect().width,
    height: img.parentElement.getBoundingClientRect().height,
    radius: getComputedStyle(img.parentElement).borderRadius,
    natural: [img.naturalWidth, img.naturalHeight],
  }));
  assert.equal(m.fit, 'contain');
  assert.equal(m.width, 96);
  assert.equal(m.height, 120);
  report.metrics.push({ name: 'profile-photo', ...m });
  await page.screenshot({ path: path.join(out, '01-photo-profile.png') });
  await tap('닫기');
  check('사진 원본 비율 유지·96×120 둥근 사각형 프로필');
  await nav('경기 기록실');
  await tap('새 경기');
  await tap('등록 선수 불러오기');
  await page.getByLabel('경기 선수 학년', { exact: true }).selectOption('2');
  await page.getByLabel('경기 선수 반', { exact: true }).selectOption('1');
  await tap('검색 결과 전체 선택 · 10명');
  await page.getByLabel('경기 선수 학년', { exact: true }).selectOption('3');
  await page.getByText('선택 10명 · 표시 14명', { exact: true }).waitFor();
  await tap('선택 학생 팀에 배정');
  await tap('후공 엔트리 · 0/10명');
  await tap('등록 선수 불러오기');
  await page.getByLabel('경기 선수 반', { exact: true }).selectOption('2');
  for (let n = 11; n <= 20; n++)
    await page.getByLabel('샘플 선수 ' + n + ' 일괄 선택', { exact: true }).check();
  await tap('선택 학생 팀에 배정');
  await page.getByLabel('엔트리 확인 감독', { exact: true }).fill('QA');
  await page
    .getByLabel('양 팀 선발 10명·교체 후보·타순·수비 배치를 감독이 확인했습니다', { exact: true })
    .check();
  await tap('경기 생성');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const game = (await data()).games.at(-1);
  assert.equal(game.rosters.away.length, 10);
  assert.equal(new Set([...game.rosters.away, ...game.rosters.home]).size, 20);
  check('경기 학년·반 필터·필터 밖 선택 유지·각 팀 10명 일괄 배정');
  await nav('기능평가 & 팀워크');
  await page.getByLabel('새 평가 날짜', { exact: true }).fill('2026-10-26');
  await page.getByLabel('공통 평가자', { exact: true }).fill('QA');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('학급 타격 평가');
  await page.getByLabel('공통 타격 횟수', { exact: true }).fill('2');
  await tap('평가 날짜 생성');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  assert.equal(await page.getByLabel('평가 날짜 선택', { exact: true }).inputValue(), '2026-10-26');
  await page.getByLabel('평가 학생 학년', { exact: true }).selectOption('2');
  await page.getByLabel('평가 학생 반', { exact: true }).selectOption('1');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  assert.equal((await data()).battingSessions.length, 2);
  for (const size of [
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    const metrics = await page.evaluate(() => {
      const selectors = [
        '.assessment-fullscreen-heading',
        '.zone-map',
        '.score-picker',
        '.attempt-workbench',
        '.attempt-save-bar',
      ];
      return {
        w: innerWidth,
        scroll: document.documentElement.scrollWidth,
        regions: selectors.map((s) => {
          const e = document.querySelector(s);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { s, x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      };
    });
    assert.equal(metrics.w, metrics.scroll);
    for (const name of ['다음 평가 학생', '평가 10점', '좌 원거리', '기록 저장 · 다음 회차']) {
      const r = await page.getByRole('button', { name, exact: true }).boundingBox();
      assert(
        r &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= size.width + 1 &&
          r.y + r.height <= size.height + 1,
        name + ' outside viewport',
      );
    }
    report.metrics.push({ name: 'day-detail-' + size.width, ...metrics });
    await page.screenshot({ path: path.join(out, '02-day-detail-' + size.width + '.png') });
  }
  await tap('정상 타격');
  await tap('평가 8점');
  assert(await page.getByRole('button', { name: '다음 평가 학생', exact: true }).isDisabled());
  await page.evaluate(() => {
    window.qaSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'tb-manager.workspace.v11') throw new DOMException('QA quota', 'QuotaExceededError');
      return window.qaSetItem.call(this, k, v);
    };
  });
  await tap('기록 저장 · 다음 회차');
  assert.equal((await data()).battingAttempts.length, 0);
  assert.equal(
    await page.getByRole('button', { name: '평가 8점', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.qaSetItem;
  });
  await tap('기록 저장 · 다음 회차');
  await tap('정상 타격');
  await tap('평가 10점');
  await tap('기록 저장 · 다음 회차');
  await tap('다음 평가 학생');
  await tap('정상 타격');
  await tap('평가 6점');
  await tap('기록 저장 · 다음 회차');
  assert.deepEqual(
    (await data()).battingAttempts.map((a) => a.score),
    [8, 10, 6],
  );
  await tap('전체 화면 닫기');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await page.getByRole('button', { name: /샘플 선수 01.*2\/2회/ }).waitFor();
  check('날짜만 저장·재열기→2명 일괄 세션→상세 입력·미저장 전환 차단·저장 실패 유지·학생별 점수');
  await nav('선수 & 팀');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 관리 선택', { exact: true }).check();
  await tap('선택 선수 삭제');
  await tap('선수 선택 삭제 확정');
  await tap('삭제된 선수 · 2');
  await tap('표시 선수 전체 선택');
  await tap('선택 선수 복원');
  await tap('선수 선택 복원 확정');
  await tap('등록 선수 · 24');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 관리 선택', { exact: true }).check();
  await tap('선택 선수 삭제');
  await tap('선수 선택 삭제 확정');
  await tap('삭제된 선수 · 2');
  await tap('표시 선수 전체 선택');
  await tap('선택 선수 완전삭제');
  assert(
    await page.getByRole('button', { name: '선택 항목 완전삭제 실행', exact: true }).isDisabled(),
  );
  await page.screenshot({ path: path.join(out, '03-purge-impact.png') });
  await purge();
  let current = await data();
  assert.equal(current.players.length, 22);
  assert.equal(current.games.length, 0);
  assert.equal(current.battingSessions.length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v7')), null);
  assert.equal(
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open('tb-manager-photos-v1');
          r.onsuccess = () => {
            const db = r.result,
              q = db.transaction('photos').objectStore('photos').get('green-1');
            q.onsuccess = () => {
              db.close();
              resolve(q.result == null);
            };
            q.onerror = () => reject(q.error);
          };
        }),
    ),
    true,
  );
  check('선수 여러 명 삭제·복원·연결 경기/평가 완전삭제·사진과 구버전 키 정리');
  for (const name of ['QA 추가팀1', 'QA 추가팀2']) {
    await tap('팀 추가');
    await page.getByLabel('팀 이름', { exact: true }).fill(name);
    await tap('팀 저장');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByLabel(name + ' 팀 선택', { exact: true }).check();
  }
  await tap('선택 팀 삭제');
  await tap('팀 선택 삭제 확정');
  await tap('삭제된 팀 · 2');
  await tap('표시 팀 전체 선택');
  await tap('선택 팀 복원');
  await tap('팀 선택 복원 확정');
  await tap('운영 팀');
  for (const name of ['QA 추가팀1', 'QA 추가팀2'])
    await page.getByLabel(name + ' 팀 선택', { exact: true }).check();
  await tap('선택 팀 삭제');
  await tap('팀 선택 삭제 확정');
  await tap('삭제된 팀 · 2');
  assert(
    await page.getByRole('button', { name: 'QA 추가팀1 팀 완전삭제', exact: true }).isVisible(),
  );
  await tap('표시 팀 전체 선택');
  await tap('선택 팀 완전삭제');
  await purge();
  assert.equal((await data()).teams.length, 2);
  assert.equal((await data()).players.length, 22);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).players.length, 22);
  check('팀 복원 옆 완전삭제·팀 여러 개 삭제/복원/완전삭제·새로고침 보존');
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
