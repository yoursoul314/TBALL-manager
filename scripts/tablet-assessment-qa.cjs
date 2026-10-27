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
  data = () => page.evaluate(() => JSON.parse(localStorage.getItem('tb-manager.workspace.v10')));
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
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.version').textContent(), 'BETA 0.10.0');

  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('tb-manager.workspace.v10'));
    d.assessments = d.assessments.filter((a) => a.playerId !== 'green-3');
    for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
    d.schemaVersion = 9;
    localStorage.setItem('tb-manager.workspace.v9', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v10');
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).schemaVersion, 10);
  assert.ok(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v9')));
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
  for (const [width, height] of [
    [1180, 820],
    [1024, 768],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => {
      const pane = document.querySelector('.defense-focused'),
        els = [
          ...pane.querySelectorAll(
            '.defense-outcomes button,.defense-situations button,.defense-save-row button',
          ),
        ];
      return {
        w: innerWidth,
        h: innerHeight,
        scroll: pane.scrollHeight,
        client: pane.clientHeight,
        groups: pane.querySelectorAll('.defense-checklist fieldset').length,
        buttons: els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.textContent,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            bottom: r.bottom,
          };
        }),
      };
    });
    report.metrics.push(geometry);
    assert.equal(geometry.groups, 9);
    assert.ok(geometry.scroll <= geometry.client + 2, 'defense scroll ' + JSON.stringify(geometry));
    for (const b of geometry.buttons) {
      assert.ok(b.y >= 0 && b.bottom <= height + 1, 'control outside screen ' + JSON.stringify(b));
      assert.ok(b.h >= 44 && b.w >= 44, 'touch size ' + JSON.stringify(b));
    }
    await page.screenshot({ path: path.join(out, 'defense-' + width + '.png') });
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  for (const [k, l] of Object.entries(abilities)) await tap(k + ' ' + l + ' 성공');
  assert.ok(await page.getByRole('button', { name: '다음 수비 학생', exact: true }).isDisabled());
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = orig;
      if (k === 'tb-manager.workspace.v10')
        throw new DOMException('QA quota', 'QuotaExceededError');
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
    'v9 원문 보존 / 수비 날짜 먼저 저장·새로고침 / 2명 선택·저장 후 다음 학생·실패 유지 / 9능력 점수 일괄 적용',
  );
  await nav('선수 비교 & 선택');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 비교 선택', { exact: true }).check();
  await page.getByLabel('비교 분석 최소 관찰 수', { exact: true }).fill('1');
  await tap('수비 수치');
  await page.getByLabel('선택 목적', { exact: true }).selectOption('position');
  await page
    .getByRole('heading', { name: '1루수 기준, 샘플 선수 01 우선 검토', exact: true })
    .waitFor();
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
  await tap('평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
  await page.getByLabel('샘플 선수 02 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  await tap('정상 타격');
  await tap('평가 8점');
  await page.getByRole('button', { name: '좌 원거리', exact: true }).click();
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
  await tap('다음 평가 학생');
  await tap('정상 타격');
  await tap('평가 6점');
  await page.getByRole('button', { name: '중 근거리', exact: true }).click();
  await tap('기록 저장 · 다음 회차');
  await tap('전체 화면 닫기');
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await page.getByRole('button', { name: /기록지 보기/ }).click();
  assert.ok(await page.locator('.attempt-sheet').isVisible());
  await page.getByRole('button', { name: /기록지 숨기기/ }).click();
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await nav('선수 비교 & 선택');
  await page.getByLabel('샘플 선수 02 비교 선택', { exact: true }).check();
  await page.getByLabel('비교 분석 최소 관찰 수', { exact: true }).fill('1');
  await page.getByLabel('선택 목적', { exact: true }).selectOption('batting');
  await page
    .getByRole('heading', { name: '타격 기능평가 우선 기준, 샘플 선수 01 우선 검토', exact: true })
    .waitFor();
  assert.equal(await page.locator('.zone-comparison [data-zone]').count(), 18);
  await page
    .locator('.zone-comparison')
    .screenshot({ path: path.join(out, 'zone-comparison.png') });
  await page.locator('.pair-verdict').screenshot({ path: path.join(out, 'pair-decision.png') });
  await page.getByLabel('비교 분석 최소 관찰 수', { exact: true }).fill('15');
  await page
    .getByRole('heading', { name: '아직 한 선수를 추천하기에는 자료가 부족합니다', exact: true })
    .waitFor();
  check('타격 일반·상세 기록지 접기 / 9구역 시각화 / 두 선수 목적별 권고 및 부족 표본 보류');
  await nav('선발 시뮬레이션');
  await tap('수동 선수 배치');
  await tap('샘플 선수 01 1루수 배치');
  await tap('수동 배치안 저장');
  assert.equal((await data()).selections.at(-1).assignments.length, 1);
  assert.ok(
    await page.getByRole('button', { name: '시범 배치 감독 승인', exact: true }).isDisabled(),
  );
  await page.reload({ waitUntil: 'networkidle' });
  await nav('선발 시뮬레이션');
  await tap('수동 선수 배치');
  const positions = [
    '1루수',
    '2루수',
    '유격수',
    '3루수',
    '본루수',
    '투수 위치 수비수',
    '좌익수',
    '제1중견수',
    '제2중견수',
    '우익수',
  ];
  for (let i = 1; i < 10; i++) {
    await page
      .locator('.manual-position-buttons')
      .getByRole('button', { name: new RegExp('^' + positions[i]) })
      .click();
    await tap('샘플 선수 ' + String(i + 1).padStart(2, '0') + ' ' + positions[i] + ' 배치');
  }
  await page
    .locator('.manual-position-buttons')
    .getByRole('button', { name: /^1루수/ })
    .click();
  await tap('샘플 선수 02 1루수 배치');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      Storage.prototype.setItem = original;
      if (k === 'tb-manager.workspace.v10')
        throw new DOMException('QA quota', 'QuotaExceededError');
      return original.call(this, k, v);
    };
  });
  await tap('수동 배치안 저장');
  assert.equal((await data()).selections.length, 1);
  await page.getByRole('heading', { name: '수동 선수 배치', exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'manual-lineup.png') });
  await tap('수동 배치안 저장');
  let selections = (await data()).selections;
  assert.equal(selections.length, 2);
  assert.equal(selections[1].assignments.length, 10);
  assert.equal(selections[1].assignments.find((a) => a.playerId === 'green-3').score, null);
  assert.equal(selections[1].assignments.find((a) => a.position === '1B').playerId, 'green-2');
  await tap('시범 배치 감독 승인');
  await page.getByLabel('승인 감독', { exact: true }).fill('가상 QA');
  await tap('배치안 승인 저장');
  await tap('수동 선수 배치');
  await page
    .locator('.manual-position-buttons')
    .getByRole('button', { name: /^1루수/ })
    .click();
  await tap('샘플 선수 01 1루수 배치');
  await tap('수동 배치안 저장');
  selections = (await data()).selections;
  assert.equal(selections[1].status, 'approved');
  assert.equal(selections[2].status, 'draft');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).selections.length, 3);
  check('수동 부분 배치·재열기·10명·맞교환 / 미측정 null / 저장실패 보호 / 감독 승인·수정 새 초안');
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
