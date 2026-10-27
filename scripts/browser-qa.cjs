// Isolated synthetic browser QA only. Never use a persistent user profile or storageState.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.argv[2] || 'chromium',
  tag = process.argv[3] || 'release',
  root = path.resolve(__dirname, '../src/test/browser-fixtures'),
  out = path.resolve(
    process.env.QA_OUTPUT || path.resolve(__dirname, '../test-results/browser'),
    tag + '-' + engine,
  );
fs.mkdirSync(out, { recursive: true });
const url = process.env.QA_URL || 'https://yoursoul314.github.io/TBALL-manager/';
let browser,
  page,
  stage = 'init';
const report = {
  engine,
  url,
  tag,
  source: process.env.QA_DIST ? 'local-dist' : 'deployed',
  checks: [],
  metrics: [],
  errors: [],
};
const log = (text) => {
  stage = text;
  console.log(text);
  report.checks.push(text);
};
const strict = tag !== 'before';
const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
async function nav(name) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).tap();
  await button.tap();
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name + '.png') });
}
async function measure(name) {
  report.metrics.push({
    name,
    ...(await page.evaluate(() => {
      const visible = (e) =>
        !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) &&
        getComputedStyle(e).visibility !== 'hidden';
      const small = [
        ...document.querySelectorAll('button,select,input:not([type=checkbox]),.file-button'),
      ]
        .filter(visible)
        .map((e) => ({
          text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 55),
          tag: e.tagName,
          width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height,
        }))
        .filter((r) => r.width < 44 || r.height < 44);
      const d = document.querySelector('dialog[open]');
      return {
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.visualViewport?.width,
        modal: d
          ? {
              clientWidth: d.clientWidth,
              scrollWidth: d.scrollWidth,
              clientHeight: d.clientHeight,
              scrollHeight: d.scrollHeight,
            }
          : null,
        small,
      };
    })),
  });
  const m = report.metrics.at(-1);
  if (strict) {
    assert(
      m.scrollWidth <= page.viewportSize().width + 1,
      'Horizontal overflow at ' + name + ': ' + m.scrollWidth,
    );
    assert.equal(m.small.length, 0, 'Small touch controls at ' + name);
  }
}
async function download(button, filename) {
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    window.qaRestoreURL = () => {
      URL.createObjectURL = original;
    };
    window.qaDownloadText = null;
    URL.createObjectURL = function (blob) {
      if (blob.type.includes('json') || blob.type.includes('csv'))
        window.qaDownloadText = blob.text();
      return original.call(this, blob);
    };
  });
  const promise = page.waitForEvent('download');
  await button.tap();
  const d = await promise;
  try {
    await d.saveAs(path.join(out, filename));
  } catch (e) {
    report.downloadLimitations ??= [];
    report.downloadLimitations.push({ filename, failure: await d.failure() });
    const text = await page.evaluate(() => window.qaDownloadText);
    assert.equal(typeof text, 'string');
    fs.writeFileSync(path.join(out, filename), text);
  } finally {
    await page.evaluate(() => window.qaRestoreURL());
  }
  return path.join(out, filename);
}
async function workspace() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tb-manager.workspace.v11')));
}
async function photoInfo() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('tb-manager-photos-v1');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('photos', 'readonly'),
            r = tx.objectStore('photos').getAll();
          r.onsuccess = async () => {
            const values = [];
            for (const row of r.result) {
              const blob = row.blob || new Blob([row.bytes], { type: row.mimeType });
              const image = await createImageBitmap(blob);
              values.push({
                id: row.playerId,
                bytes: blob.size,
                mime: blob.type,
                width: image.width,
                height: image.height,
                format: row.formatVersion || 1,
              });
              image.close();
            }
            db.close();
            resolve(values);
          };
        };
      }),
  );
}
(async () => {
  browser = await pw[engine].launch({
    ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
    headless: true,
    downloadsPath: path.join(out, 'downloads'),
  });
  const context = await browser.newContext({
    ...pw.devices['iPad (gen 7) landscape'],
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    serviceWorkers: process.env.QA_DIST ? 'block' : 'allow',
  });
  if (process.env.QA_DIST)
    await context.route(url + '**', async (route) => {
      const relative =
        new URL(route.request().url()).pathname.replace('/TBALL-manager/', '') || 'index.html';
      const file = path.resolve(process.env.QA_DIST, relative);
      if (!file.startsWith(path.resolve(process.env.QA_DIST) + path.sep)) return route.abort();
      await route.fulfill({ path: file }).catch(() => route.abort());
    });
  page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  report.version = await page.locator('.version').textContent();
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'fresh isolated storage');
  log('기존 가상 자료를 UI 백업으로 확보');
  await nav('규칙 & 설정');
  const baselineFile = await download(
    page.getByRole('button', { name: 'JSON 백업', exact: true }),
    'baseline.json',
  );
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8')).workspace;
  log('선수 등록·파일 검증·PNG 업로드');
  await nav('선수 & 팀');
  await page.getByRole('button', { name: '선수 등록', exact: true }).tap();
  await page.getByLabel('선수 이름', { exact: true }).fill('QA 검증 선수 이름이 긴 테스트25');
  await page.getByRole('dialog').getByLabel(/^학년/).selectOption('3');
  await page.getByLabel('반', { exact: true }).fill('2');
  await page.getByLabel('학생 번호', { exact: true }).fill('25');
  await page.getByLabel('등번호', { exact: true }).fill('25');
  await page
    .getByRole('dialog')
    .getByLabel(/^주 포지션/)
    .selectOption('SS');
  await page
    .getByRole('dialog')
    .getByLabel(/^보조 포지션/)
    .selectOption('1B');
  await page
    .getByLabel('학생 사진 선택', { exact: true })
    .setInputFiles(path.join(root, 'invalid-photo.png'));
  await page.getByRole('alert').filter({ hasText: '실제 형식' }).waitFor();
  await page
    .getByLabel('학생 사진 선택', { exact: true })
    .setInputFiles(path.join(root, 'qa-photo.png'));
  await page.getByAltText('선수 사진 미리보기').waitFor();
  await measure('player-modal-landscape');
  await shot('01-player-form-landscape');
  await page.getByRole('button', { name: '선수 저장', exact: true }).tap();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const first = await workspace();
  const player = first.players.find((p) => p.name === 'QA 검증 선수 이름이 긴 테스트25');
  assert(player);
  assert.equal(player.grade, 3);
  assert.equal(first.players.length, 25);
  assert.equal((await photoInfo())[0].width, 320);
  assert.equal((await photoInfo())[0].height, 160);
  if (baseline) {
    assert.deepEqual(first.assessments, baseline.assessments);
    assert.deepEqual(first.events, baseline.events);
    assert.deepEqual(first.players.slice(0, 24), baseline.players);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await nav('선수 & 팀');
  await page.getByAltText(player.name + ' 사진').waitFor();
  assert.equal((await photoInfo())[0].id, player.id);
  log('새로고침 후 선수·IndexedDB 사진 유지 확인');
  await page.getByRole('button', { name: player.name + ' 정보 수정', exact: true }).tap();
  await page.getByLabel('학생 사진 선택').setInputFiles(path.join(root, 'qa-rotated.jpg'));
  await page.getByAltText('선수 사진 미리보기').waitFor();
  await page.getByRole('button', { name: '선수 저장', exact: true }).tap();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.deepEqual(
    (await photoInfo()).map((p) => [p.width, p.height]),
    [[160, 320]],
  );
  log('EXIF 방향 보정·사진 교체 확인');
  if (tag !== 'before') {
    await page.getByRole('button', { name: player.name + ' 정보 수정', exact: true }).tap();
    await page.getByLabel(/^비고/).fill('QA 저장 재시도');
    await page.getByLabel('학생 사진 선택').setInputFiles(path.join(root, 'qa-photo.png'));
    await page.getByAltText('선수 사진 미리보기').waitFor();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.qaRestoreStorage = () => {
        Storage.prototype.setItem = original;
      };
      Storage.prototype.setItem = function (k, v) {
        if (k === 'tb-manager.workspace.v11')
          throw new DOMException('QA storage full', 'QuotaExceededError');
        return original.call(this, k, v);
      };
    });
    await page.getByRole('button', { name: '선수 저장', exact: true }).tap();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.equal(await page.getByLabel(/^비고/).inputValue(), 'QA 저장 재시도');
    assert.deepEqual(
      (await photoInfo()).map((p) => [p.width, p.height]),
      [[160, 320]],
    );
    assert.equal((await workspace()).players.find((p) => p.id === player.id).note, '');
    await page.evaluate(() => window.qaRestoreStorage());
    await page.getByRole('button', { name: '선수 저장', exact: true }).tap();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      (await workspace()).players.find((p) => p.id === player.id).note,
      'QA 저장 재시도',
    );
    log('저장 실패 시 입력·선수·이전 사진 보존 후 재시도');
  }

  await page.setViewportSize({ width: 820, height: 1180 });
  await measure('players-portrait');
  await shot('02-players-portrait');
  await page.setViewportSize({ width: 1180, height: 820 });
  log('양 팀 선발10명·후보·결석·타순·수비 직접 편성');
  await nav('경기 기록실');
  await page.getByRole('button', { name: '새 경기', exact: true }).tap();
  await page.getByRole('button', { name: '등록 선수 불러오기', exact: true }).tap();
  await page.getByLabel('경기 이름', { exact: true }).fill('QA 통합 수비 검증 경기');
  await page.getByLabel('경기 날짜', { exact: true }).fill('2026-10-26');
  await page.getByLabel('시작 시간 · 선택', { exact: true }).fill('10:00');
  await page.getByRole('button', { name: player.name + ' 선발 선택', exact: true }).tap();
  for (let n = 1; n <= 9; n++)
    await page
      .getByRole('button', {
        name: '샘플 선수 ' + String(n).padStart(2, '0') + ' 선발 선택',
        exact: true,
      })
      .tap();
  await page.getByLabel('샘플 선수 10 경기 상태').selectOption('reserve');
  await page.getByLabel('샘플 선수 11 경기 상태').selectOption('absent');
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
  const away = [
    'green-1',
    'green-2',
    player.id,
    'green-3',
    'green-4',
    'green-5',
    'green-6',
    'green-7',
    'green-8',
    'green-9',
  ];
  const home = [
    'orange-1',
    'orange-3',
    'orange-2',
    'orange-4',
    'orange-5',
    'orange-6',
    'orange-7',
    'orange-8',
    'orange-9',
    'orange-10',
  ];
  if (tag !== 'before') await page.getByRole('button', { name: '타순·수비', exact: true }).tap();
  for (let n = 0; n < 10; n++)
    await page.getByLabel('엔트리 ' + positions[n], { exact: true }).selectOption(away[n]);
  await measure('entry-landscape');
  await shot('03-entry-landscape');
  await page.setViewportSize({ width: 820, height: 1180 });
  await measure('entry-portrait');
  await shot('04-entry-portrait');
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.getByRole('button', { name: '후공 엔트리 · 0/10명', exact: true }).tap();
  await page.getByRole('button', { name: '등록 선수 불러오기', exact: true }).tap();
  for (let n = 13; n <= 22; n++)
    await page.getByRole('button', { name: '샘플 선수 ' + n + ' 선발 선택', exact: true }).tap();
  for (let n = 0; n < 10; n++)
    await page.getByLabel('엔트리 ' + positions[n], { exact: true }).selectOption(home[n]);
  assert(await page.getByRole('button', { name: '경기 생성', exact: true }).isDisabled());
  await page.getByLabel('엔트리 확인 감독').fill('QA 감독');
  await page.getByLabel(/양 팀 선발 10명/).check();
  await page.getByRole('button', { name: '경기 생성', exact: true }).tap();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const data = await workspace(),
    game = data.games.at(-1);
  assert.equal(game.lineups.away[0], player.id);
  assert.equal(game.rosters.away.length, 11);
  assert(!game.rosters.away.includes('green-11'));
  await measure('match-dead-landscape');
  await shot('05-match-dead-landscape');
  log('실제 수비수 터치→포구·송구·아웃→주자 확인→심판 타임');
  await page.getByRole('button', { name: '아웃', exact: true }).tap();
  const defense = page.getByRole('region', { name: '상대 팀 수비 터치 기록' });
  await defense.scrollIntoViewIfNeeded();
  await measure('match-live-landscape');
  await shot('06-defense-field-landscape');
  report.metrics.push({
    name: 'field-landscape',
    ...(await defense.evaluate((el) => {
      const bs = [...el.querySelectorAll('.field-player')].map((e) => {
        const r = e.getBoundingClientRect();
        return { name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
      });
      const overlaps = [];
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++)
          if (
            Math.min(bs[i].x + bs[i].w, bs[j].x + bs[j].w) > Math.max(bs[i].x, bs[j].x) &&
            Math.min(bs[i].y + bs[i].h, bs[j].y + bs[j].h) > Math.max(bs[i].y, bs[j].y)
          )
            overlaps.push([bs[i].name, bs[j].name]);
      return { buttons: bs, overlaps };
    })),
  });
  if (tag !== 'before') {
    for (const size of [
      { width: 1024, height: 768 },
      { width: 820, height: 1180 },
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(size);
      await defense.scrollIntoViewIfNeeded();
      await measure('defense-' + size.width);
      const targets = await defense.locator('.field-player').evaluateAll((bs) =>
        bs.map((e) => {
          const r = e.getBoundingClientRect();
          return { name: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      for (let i = 0; i < targets.length; i++) {
        assert(targets[i].w >= 48 && targets[i].h >= 48);
        for (let j = i + 1; j < targets.length; j++)
          assert(
            !(
              Math.min(targets[i].x + targets[i].w, targets[j].x + targets[j].w) >
                Math.max(targets[i].x, targets[j].x) &&
              Math.min(targets[i].y + targets[i].h, targets[j].y + targets[j].h) >
                Math.max(targets[i].y, targets[j].y)
            ),
            'overlap: ' + targets[i].name + ' / ' + targets[j].name,
          );
      }
      await shot('field-' + size.width);
    }
    await page.setViewportSize({ width: 1180, height: 820 });
  }
  const action = async (f, a) => {
    await defense.getByRole('button', { name: f, exact: true }).tap();
    await defense.getByRole('button', { name: a, exact: true }).tap();
  };
  const connect = () => defense.getByRole('button', { name: '수비 행동 연결', exact: true }).tap();
  await action('유격수 샘플 선수 14', '땅볼 포구 성공');
  await connect();
  await action('유격수 샘플 선수 14', '송구 성공');
  await defense.getByLabel('수비 행동 목표 베이스').selectOption('1');
  await connect();
  await action('1루수 샘플 선수 13', '송구 포구 성공');
  await connect();
  await action('1루수 샘플 선수 13', '포스아웃');
  await defense.getByLabel('수비 행동 목표 베이스').selectOption('1');
  await defense.getByLabel('수비 행동 대상 주자').selectOption(player.id);
  await connect();
  await page.setViewportSize({ width: 820, height: 1180 });
  await defense.scrollIntoViewIfNeeded();
  await measure('match-live-portrait');
  await shot('07-defense-linked-portrait');
  await page.setViewportSize({ width: 1180, height: 820 });
  const commit = page.getByRole('button', { name: '심판 타임 · 플레이 확정', exact: true });
  assert(await commit.isDisabled());
  await page.getByRole('button', { name: player.name + ' 결과 확인', exact: true }).tap();
  assert(await commit.isDisabled());
  await page.getByLabel('심판 타임 선언 확인').check();
  await commit.tap();
  await commit.waitFor({ state: 'hidden' });
  let after = await workspace();
  assert.equal(after.events.at(-1).payload.defenseSequence.length, 4);
  assert.equal(after.events.at(-1).payload.result, 'out');
  assert.equal(
    after.events.at(-1).payload.details.filter((d) => d.type === 'DEFENSIVE_CREDIT').length,
    2,
  );
  assert.deepEqual(after.assessments, first.assessments);
  await shot('08-play-recorded');
  if (strict) {
    await page.getByRole('button', { name: '1루타', exact: true }).tap();
    await page.getByRole('button', { name: '샘플 선수 01 결과 확인', exact: true }).tap();
    await page.getByLabel('심판 타임 선언 확인').check();
    await commit.tap();
    await commit.waitFor({ state: 'hidden' });
    let single = (await workspace()).events.at(-1).payload;
    assert.equal(single.fielding.length, 0);
    assert.equal(single.quality, null);
    assert.equal(single.direction, null);
    await page.getByRole('button', { name: '야수선택 FC', exact: true }).tap();
    await page.getByLabel('야수선택 대상 주자', { exact: true }).selectOption('green-1');
    await action('유격수 샘플 선수 14', '포스아웃');
    await defense.getByLabel('수비 행동 목표 베이스').selectOption('2');
    await defense.getByLabel('수비 행동 대상 주자').selectOption('green-1');
    await connect();
    await page.getByRole('button', { name: '샘플 선수 02 결과 확인', exact: true }).tap();
    await page.getByLabel('심판 타임 선언 확인').check();
    assert(await commit.isDisabled(), '기존 주자 미확인 차단');
    await page.getByRole('button', { name: '샘플 선수 01 결과 확인', exact: true }).tap();
    await page.getByLabel('심판 타임 선언 확인').check();
    await commit.tap();
    await commit.waitFor({ state: 'hidden' });
    after = await workspace();
    assert.equal(after.events.at(-1).payload.result, 'fielders-choice');
    assert(
      after.events
        .at(-1)
        .payload.outcomes.some((o) => o.playerId === 'green-1' && o.to === 'out' && o.outAt === 2),
    );
    const original = after.events.find(
      (e) => e.gameId === game.id && e.payload.type === 'END_PLAY',
    );
    await page.getByText(/타순·플레이 기록 보기/).tap();
    await page.getByRole('button', { name: '플레이 수정 · 이력', exact: true }).last().tap();
    const correction = page.getByRole('dialog', { name: '과거 플레이 수정' });
    await correction.getByLabel('수정자 별칭', { exact: true }).fill('QA 감독');
    await correction.getByLabel('수정 사유', { exact: true }).fill('QA 타구 강도 관찰 정정');
    await correction.getByRole('button', { name: '타구·수비 상세 기록 펼치기', exact: true }).tap();
    await correction.getByLabel('타구 강도', { exact: true }).selectOption('strong');
    await correction
      .getByRole('button', { name: '수정 이력 저장 · 전체 경기 재계산', exact: true })
      .tap();
    await correction.waitFor({ state: 'hidden' });
    after = await workspace();
    assert.deepEqual(
      after.events.find((e) => e.id === original.id),
      original,
    );
    assert.equal(after.events.at(-1).payload.type, 'REVISE_PLAY');
    log('미관찰 null·기존 주자 FC 판정·주자별 확인 차단·과거 수정 및 원본 보존');
  }

  log('통계·프로필 및 원본 유지 확인');
  await nav('경기 분석');
  await page.locator('select').first().selectOption(game.id);
  const statRow = (n) =>
    page.getByRole('row').filter({ has: page.getByRole('button', { name: n, exact: true }) });
  assert((await statRow('샘플 선수 14').innerText()).includes(strict ? '1 / 1 / 0' : '0 / 1 / 0'));
  assert((await statRow('샘플 선수 13').innerText()).includes('1 / 0 / 0'));
  await shot('09-statistics');
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await workspace()).events, after.events);
  assert.equal((await photoInfo()).length, 1);
  await nav('규칙 & 설정');
  const backup = await download(
    page.getByRole('button', { name: 'JSON 백업', exact: true }),
    'complete-backup.json',
  );
  assert(!fs.readFileSync(backup, 'utf8').includes('image/jpeg'));
  await page.getByLabel('사진을 포함한 암호화 백업 만들기').check();
  await page.getByLabel('사진 백업 암호', { exact: true }).fill('QA-only-backup-2026');
  const encrypted = await download(
    page.getByRole('button', { name: '사진 포함 암호화 백업', exact: true }),
    'encrypted-backup.json',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(encrypted, 'utf8')).format,
    'tb-manager-protected-backup',
  );
  log('일반·사진 포함 암호화 백업 생성 확인');
  if (tag !== 'before') {
    await nav('선수 & 팀');
    await page.getByRole('button', { name: player.name + ' 정보 수정', exact: true }).tap();
    await page.getByRole('button', { name: '사진 삭제', exact: true }).tap();
    await page.getByRole('button', { name: '선수 저장', exact: true }).tap();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await photoInfo()).length, 0);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await photoInfo()).length, 0);
    await nav('규칙 & 설정');
    await page.getByLabel('암호화 사진 백업 파일').setInputFiles(encrypted);
    await page.getByLabel('사진 백업 암호', { exact: true }).fill('QA-only-backup-2026');
    await page.getByRole('button', { name: '암호로 백업 확인', exact: true }).tap();
    await page.getByRole('dialog', { name: '사진 포함 백업 복원' }).waitFor();
    await download(
      page.getByRole('button', { name: '현재 기록·사진 백업 후 복원', exact: true }),
      'pre-restore.json',
    );
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await photoInfo()).length, 1);
    assert.deepEqual((await workspace()).events, after.events);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal((await photoInfo()).length, 1);
    await nav('선수 & 팀');
    await page.getByAltText(player.name + ' 사진').waitFor();
    log('사진 삭제·암호화 백업 UI 복원·새로고침 및 경기 이벤트 동일성');
  }

  if (strict && engine === 'chromium') {
    const legacyBytes = [...fs.readFileSync(path.join(root, 'qa-photo.png'))];
    await page.evaluate(async (bytes) => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open('tb-manager-photos-v1');
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction('photos', 'readwrite');
          tx.objectStore('photos').put({
            playerId: 'green-2',
            blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
            updatedAt: '2026-10-26T00:00:00.000Z',
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      });
    }, legacyBytes);
    await page.reload({ waitUntil: 'networkidle' });
    await nav('선수 & 팀');
    await page.getByAltText('샘플 선수 02 사진').waitFor();
    assert.equal((await photoInfo()).find((p) => p.id === 'green-2').format, 1);
    log('기존 Blob 사진을 변환·삭제 없이 조회');
  }
  report.status = 'passed';
  report.playerId = player.id;
  report.gameId = game.id;
  assert.deepEqual(report.errors, []);
  save();
})()
  .catch(async (e) => {
    report.status = 'failed';
    report.stage = stage;
    report.failure = e.stack;
    console.error(e.stack);
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    save();
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });
