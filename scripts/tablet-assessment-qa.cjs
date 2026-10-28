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

  await nav('선수 & 팀');
  await tap('샘플 선수 01 정보 수정');
  await tap('선수 저장');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.evaluate(() => {
    const d = window.__qaDecodeWorkspace(localStorage.getItem('tb-manager.workspace.v12'));
    d.assessments = d.assessments.filter((a) => a.playerId !== 'green-3');
    for (const k of Object.keys(d)) if (k.startsWith('_')) delete d[k];
    d.schemaVersion = 10;
    localStorage.setItem('tb-manager.workspace.v10', JSON.stringify(d));
    localStorage.removeItem('tb-manager.workspace.v12');
  });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal((await data()).schemaVersion, 13);
  assert.ok(await page.evaluate(() => localStorage.getItem('tb-manager.workspace.v10')));
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  await page.getByLabel('새 수비 평가 날짜', { exact: true }).fill('2026-10-27');
  await chooseAssessor(page, '수비 공통 평가자', '가상 QA');
  await page.getByLabel('학생당 수비 횟수', { exact: true }).fill('1');
  await tap('수비 평가 날짜 생성');
  await page.reload({ waitUntil: 'networkidle' });
  await nav('기능평가 & 팀워크');
  await tap('수비 체크리스트');
  assert.equal(await page.getByLabel('수비 날짜 선택', { exact: true }).inputValue(), '2026-10-27');
  for (const n of ['01', '02'])
    await page.getByLabel('샘플 선수 ' + n + ' 수비 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 수비 평가 시작');
  assert.equal((await data()).defenseDays[0].targetAttempts, 1);
  assert.equal(await page.locator('.defense-short-cue:visible').count(), 9);
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
      if (k === 'tb-manager.workspace.v12')
        throw new Error('QA write failure');
      return orig.call(this, k, v);
    };
  });
  await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).click();
  assert.equal((await data()).defenseAssessments.length, 0);
  assert.equal(
    await page
      .getByRole('button', { name: 'G 땅볼 성공', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).click();
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
  await page.getByRole('button', { name: /^수비 기록 저장 ·/ }).click();
  await tap('이전 수비 학생');
  assert.match(await page.getByLabel('수비 기록 진행').textContent(), /1 \/ 1회 · 완료/);
  assert.ok(
    await page
      .getByRole('button', { name: '수비 기록 저장 · 다음 상황', exact: true })
      .isDisabled(),
  );
  await tap('수비 횟수 설정');
  await page.getByLabel('학생당 수비 횟수', { exact: true }).fill('2');
  await tap('횟수 저장');
  assert.equal((await data()).defenseDays[0].targetAttempts, 2);
  await tap('집중 모드 끝내기');
  assert.equal((await data()).defenseAssessments.length, 2);
  await tap('평가 학생 누적 체크 점수 적용');
  assert.equal((await data()).defenseEvaluationChoices.length, 2);
  await page
    .locator('.defense-comparison-table')
    .screenshot({ path: path.join(out, '01-defense-nine.png') });
  check(
    'v10 원문 보존 / 수비 횟수 설정·완료·변경 / 9능력 설명 / 2명 선택·저장 후 다음 학생·실패 유지 / 9능력 점수 일괄 적용',
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
  await chooseAssessor(page, '공통 평가자', '가상 QA');
  await page.getByLabel('공통 평가 목적', { exact: true }).fill('타격');
  await page.getByLabel('날짜 평가 척도',{exact:true}).selectOption('manual-ten-v1');
  await tap('평가 날짜 생성');
  await page.getByLabel('샘플 선수 01 평가 대상 선택', { exact: true }).check();
  await page.getByLabel('샘플 선수 02 평가 대상 선택', { exact: true }).check();
  await tap('선택 학생 평가 시작');
  await tap('정상 타격');
  await tap('평가 8점');
  await page.getByRole('button', { name: '좌 원거리', exact: true }).click();
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await tap('기록지 조회');
  assert.ok(await page.locator('.attempt-sheet').isVisible());
  await tap('회차 측정');
  assert.equal(
    await page.getByRole('button', { name: '평가 8점', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  for (const [w, h] of [
    [1440, 900],
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
      studioHeight: document.querySelector('.batting-studio').clientHeight,
      studioScroll: document.querySelector('.batting-studio').scrollHeight,
      saveBottom: [...document.querySelectorAll('.batting-studio button')]
        .find((b) => b.textContent === '기록 저장 · 다음 회차')
        .getBoundingClientRect().bottom,
      buttons: [
        ...document.querySelectorAll(
          '.batting-studio .quick-three button,.batting-studio .score-buttons button,.batting-studio .zone-row button',
        ),
      ]
        .filter((b) => b.getBoundingClientRect().width)
        .map((b) => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
    }));
    assert.ok(m.scroll <= m.w + 1);
    if (w >= 700) {
      assert.ok(m.studioScroll <= m.studioHeight + 1, JSON.stringify(m));
      assert.ok(m.saveBottom <= h, 'Save must be visible without scroll');
      assert.ok(
        m.buttons.every((b) => b.w >= 48 && b.h >= 48),
        JSON.stringify(m.buttons),
      );
      await page.screenshot({ path: path.join(out, 'batting-measure-' + w + '.png') });
    }
    report.metrics.push(m);
    if (w === 1180) await page.screenshot({ path: path.join(out, '03-batting-sheet-hidden.png') });
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await tap('메모·정정');
  for (const [width, height, visible, top] of [
    [1024, 768, 420, 0],
    [1024, 768, 400, 80],
    [820, 1180, 650, 0],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByLabel('회차 메모', { exact: true }).fill('가상 키보드 메모');
    await page.evaluate(([h, t]) => window.__qaKeyboard(h, t), [visible, top]);
    await page.waitForTimeout(100);
    const geometry = await page.evaluate(() => {
      const pane = document.querySelector('.batting-studio');
      return {
        kind: 'keyboard',
        top: visualViewport.offsetTop,
        height: visualViewport.height,
        field: pane
          .querySelector('textarea[aria-label="회차 메모"]')
          .getBoundingClientRect()
          .toJSON(),
        save: [...pane.querySelectorAll('button')]
          .find((b) => b.textContent === '기록 저장 · 다음 회차')
          .getBoundingClientRect()
          .toJSON(),
      };
    });
    report.metrics.push(geometry);
    for (const r of [geometry.field, geometry.save])
      assert.ok(
        r.width > 0 && r.height > 0 && r.top >= top && r.bottom <= top + visible,
        JSON.stringify(geometry),
      );
    assert.ok(geometry.field.bottom <= geometry.save.top, 'memo covered by save bar');
    await page.screenshot({ path: path.join(out, 'keyboard-' + width + '-' + top + '.png') });
    await page.evaluate(() => window.__qaKeyboard());
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByLabel('회차 메모', { exact: true }).focus();
  await page.evaluate(() => window.__qaKeyboard(420));
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
  assert.equal((await data()).battingAttempts.length, 0);
  assert.equal(
    await page.getByLabel('회차 메모', { exact: true }).inputValue(),
    '가상 키보드 메모',
  );
  await tap('기록 저장 · 다음 회차');
  await page.evaluate(() => window.__qaKeyboard());
  assert.equal((await data()).battingAttempts[0].note, '가상 키보드 메모');
  assert.equal((await data()).battingAttempts[0].score, 8);
  await tap('기록지 조회');
  await page.getByRole('listitem', { name: '1회차 8점', exact: true }).click();
  await tap('메모·정정');
  await page.getByLabel('회차 메모', { exact: true }).fill('가상 정정 메모');
  await page.getByLabel('회차 수정 사유', { exact: true }).fill('메모 확인');
  await page.evaluate(() => window.__qaKeyboard(400, 80));
  await page.waitForTimeout(100);
  const correction = await page.getByLabel('회차 수정 사유', { exact: true }).boundingBox();
  assert.ok(
    correction.y >= 80 && correction.y + correction.height <= 400,
    'correction input covered',
  );
  const correctionSave = await page
    .getByRole('button', { name: '정정 저장 · 다음 회차', exact: true })
    .boundingBox();
  assert.ok(
    correctionSave.y >= 80 && correctionSave.y + correctionSave.height <= 480,
    'correction save covered',
  );
  await page.screenshot({ path: path.join(out, 'keyboard-correction.png') });
  await tap('정정 저장 · 다음 회차');
  await page.evaluate(() => window.__qaKeyboard());
  assert.equal((await data()).battingAttempts.length, 1);
  assert.equal((await data()).battingAttempts[0].score, 8);
  assert.equal((await data()).battingAttempts[0].note, '가상 정정 메모');
  assert.ok(
    (await data()).battingAudit.some(
      (a) => a.before?.note === '가상 키보드 메모' && a.after?.note === '가상 정정 메모',
    ),
  );

  check('타격 상세 5개 화면 크기 / 키보드 축소·이동 시 메모와 저장 노출 / 실패 입력 유지·재시도');
  await tap('다음 평가 학생');
  await tap('정상 타격');
  await tap('평가 6점');
  await page.getByRole('button', { name: '중 근거리', exact: true }).click();
  await tap('기록 저장 · 다음 회차');
  await tap('간편 모드');
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await tap('기록지 조회');
  assert.ok(await page.locator('.attempt-sheet').isVisible());
  await tap('회차 측정');
  assert.ok(await page.locator('.attempt-sheet').isHidden());
  await tap('전체 화면 닫기');
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
      if (k === 'tb-manager.workspace.v12')
        throw new Error('QA write failure');
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
  await nav('선발 시뮬레이션');
  await page.getByLabel('시뮬레이션 팀', { exact: true }).selectOption('orange');
  await tap('수동 선수 배치');
  for (let i = 0; i < 10; i++) {
    await page
      .locator('.manual-position-buttons')
      .getByRole('button', { name: new RegExp('^' + positions[i]) })
      .click();
    await tap('샘플 선수 ' + String(i + 13).padStart(2, '0') + ' ' + positions[i] + ' 배치');
  }
  await tap('수동 배치안 저장');
  await tap('시범 배치 감독 승인');
  await page.getByLabel('승인 감독', { exact: true }).fill('가상 QA');
  await tap('배치안 승인 저장');
  const originals = (await data()).selections;
  for (const [width, height] of [
    [1024, 768],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await nav('경기 기록실');
    await tap('새 경기');
    await tap('승인 배치안 적용');
    assert.equal(await page.getByLabel('엔트리 1루수', { exact: true }).inputValue(), 'green-2');
    await tap('샘플 선수 01 타순 위로');
    await tap('후공 엔트리 · 0/10명');
    await tap('승인 배치안 적용');
    await page.getByLabel('엔트리 확인 감독', { exact: true }).fill('가상 QA');
    const keyboardHeight = width === 1024 ? 420 : 650;
    await page.evaluate((h) => window.__qaKeyboard(h), keyboardHeight);
    await page.waitForTimeout(100);
    const managerRect = await page.getByLabel('엔트리 확인 감독', { exact: true }).boundingBox();
    assert.ok(
      managerRect.y >= 0 && managerRect.y + managerRect.height <= keyboardHeight,
      'manager input hidden',
    );
    await page.evaluate(() => window.__qaKeyboard());
    await page.getByRole('checkbox', { name: /양 팀 선발/ }).check();
    await page
      .locator('.entry-arrangement')
      .screenshot({ path: path.join(out, 'approved-entry-order-' + width + '.png') });
    await tap('경기 생성');
    const created = (await data()).games.at(-1);
    assert.deepEqual(created.lineups.away.slice(0, 2), ['green-1', 'green-2']);
    assert.equal(created.entry.defense.away['1B'], 'green-2');
    assert.equal(created.entry.defense.home['1B'], 'orange-1');
    assert.equal(created.rosters.away.length, 10);
    assert.equal(created.rosters.home.length, 10);
    assert.deepEqual((await data()).selections, originals);
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual((await data()).games.at(-1), created);
  }
  check(
    '승인안 두 팀 불러오기 / 미승인 초안 제외 / 타순 수동 변경 / 경기 수비 스냅샷·새로고침 / 원본 승인안 보존',
  );
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
