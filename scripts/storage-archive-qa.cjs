const { chooseAssessor } = require('./qa-assessors.cjs');
// Synthetic, isolated context only. Never use the user's storage/profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {decompressFromUTF16}=require('lz-string');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright'),engine=process.argv[2]||'webkit';
const url=process.env.QA_URL||'https://yoursoul314.github.io/TBALL-manager/';
const out=path.resolve(process.env.QA_OUTPUT||'test-results/storage-archive',engine);fs.mkdirSync(out,{recursive:true});
const report={engine,source:process.env.QA_DIST?'local-dist':'deployed',checks:[],metrics:{},errors:[]};
let browser,page;
const tap=name=>page.getByRole('button',{name,exact:true}).click();
async function nav(name){const b=page.locator('.sidebar').getByRole('button',{name,exact:true});if(!await b.isVisible())await tap('메뉴 열기');await b.click();}
const decode=raw=>{const obj=JSON.parse(raw);return obj.format==='tb-manager-compressed-json'?JSON.parse(decompressFromUTF16(obj.payload)):obj;};
const data=async()=>decode(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12')));
(async()=>{
 browser=await pw[engine].launch({headless:true,...(process.env.QA_BROWSER_PATH?{executablePath:process.env.QA_BROWSER_PATH}:{})});
 for(const interrupted of [false,true]) {
 const ctx=await browser.newContext({...pw.devices['iPad (gen 7) landscape'],viewport:{width:1024,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
 if(process.env.QA_DIST)await ctx.route(url+'**',r=>r.fulfill({path:path.resolve(process.env.QA_DIST,new URL(r.request().url()).pathname.replace('/TBALL-manager/','')||'index.html')}));
 page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});
 assert.equal(await page.locator('.version').textContent(),'BETA 0.14.1');
 await nav('기능평가 & 팀워크');await tap('개인별 이전 기록');
 await page.getByLabel('평가 날짜',{exact:true}).fill('2026-10-26');await page.getByLabel('세션 평가 척도',{exact:true}).selectOption('manual-ten-v1');
 await chooseAssessor(page, '세션 평가자', '가상 QA');await page.getByLabel('평가 목적',{exact:true}).fill('용량 재현');
 await tap('평가 세션 생성');await tap('정상 타격');await tap('평가 8점');await tap('기록 저장 · 다음 회차');
 const baseline=await data();
 const photoBytes=[...fs.readFileSync('src/test/browser-fixtures/qa-photo.png')];
 await page.evaluate(async ({bytes,id})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tb-manager-photos-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'playerId'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({playerId:id,bytes:new Uint8Array(bytes).buffer,mimeType:'image/png',updatedAt:new Date().toISOString(),formatVersion:2});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 },{bytes:photoBytes,id:baseline.players[0].id});
 const setup=await page.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('tb-manager.workspace.v12'));for(const k of Object.keys(d))if(k.startsWith('_'))delete d[k];
  for(const s of d.battingSessions)delete s.rubricVersion;for(const a of d.battingAudit)if(a.entity==='session'){if(a.before)delete a.before.rubricVersion;delete a.after.rubricVersion;}
  localStorage.clear();let previous=null;const baselines={},originals={};
  for(let v=8;v<=11;v++){
   const raw=JSON.stringify({...d,schemaVersion:v,...baselines,...(previous?{migrationSource:{schemaVersion:v-1,raw:previous}}:{})});
   localStorage.setItem('tb-manager.workspace.v'+v,raw);originals['tb-manager.workspace.v'+v]=raw;baselines['_v'+v+'Baseline']=raw;previous=raw;
  }
  const oldWrite=JSON.stringify({...d,schemaVersion:12,...baselines,migrationSource:{schemaVersion:11,raw:previous}});
  let n=0,quota='';for(;n<500;n++){try{localStorage.setItem('qa-filler-'+n,'q'.repeat(64000));}catch(e){quota=e.name;break;}}
  if(!quota)throw Error('Browser quota not reached');
  // Keep every filler key: compressed migration also has no room to write.
  for(let i=0;i<64;i++){try{localStorage.setItem('qa-tail-'+i,'q'.repeat(1000));}catch{break;}}
  let oldError='';try{localStorage.setItem('tb-manager.workspace.v12',oldWrite);}catch(e){oldError=e.name;}
  return {originals,oldError,oldLength:oldWrite.length,fillerCount:n};
 });

 assert.equal(setup.oldError,'QuotaExceededError');
 await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'브라우저 저장 공간이 부족합니다'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12')),null);
 report.checks.push('Native localStorage filled: even compressed migration fails without changing original keys');
 await page.screenshot({path:path.join(out,'before-'+interrupted+'.png')});
 if(interrupted){
  await page.evaluate(()=>sessionStorage.setItem('qa-force-quota','1'));
  await page.addInitScript(()=>{if(sessionStorage.getItem('qa-force-quota')){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='tb-manager.workspace.v12')throw new DOMException('The quota has been exceeded.','QuotaExceededError');return set.call(this,k,v);};}});
  await page.reload({waitUntil:'networkidle'});
 }
 await tap('원본 보관 후 저장 공간 복구');
 if(interrupted){
  await page.getByRole('button',{name:'중단된 복구 이어하기',exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'중단된 복구 이어하기',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12')),null);
  await tap('기존 기록 확인');await page.getByRole('button',{name:'검증된 기록 JSON 백업'}).waitFor();
  await page.evaluate(()=>sessionStorage.removeItem('qa-force-quota'));
  await page.reload({waitUntil:'networkidle'});await tap('중단된 복구 이어하기');
  report.checks.push('Interrupted after archive commit: reload prevents demo seeding, inspection works, resume succeeds');
 }
 await page.getByRole('button',{name:'복구된 기록 열기',exact:true}).waitFor();
 const migrated=await data();
 assert.deepEqual(migrated.battingAttempts,baseline.battingAttempts);assert.deepEqual(migrated.events,baseline.events);assert.deepEqual(migrated.assessments,baseline.assessments);
 assert.deepEqual(migrated.battingAudit,JSON.parse(setup.originals['tb-manager.workspace.v11']).battingAudit);
 const readNative=()=>page.evaluate(async()=>{
  const read=async(name,store)=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});db.close();return rows;};
  return {archives:await read('tb-manager-recovery-v1','snapshots'),photos:(await read('tb-manager-photos-v1','photos')).map(p=>({...p,bytes:[...new Uint8Array(p.bytes)]})),fillers:Object.keys(localStorage).filter(k=>k.startsWith('qa-filler-')).length,fillerUntouched:Object.keys(localStorage).filter(k=>k.startsWith('qa-filler-')).every(k=>localStorage.getItem(k)==='q'.repeat(64000))};
 });
 const archived=await readNative();assert.equal(archived.archives.length,1);assert.equal(archived.photos.length,1);assert.deepEqual(archived.photos[0].bytes,photoBytes);
 for(const [key,value]of Object.entries(setup.originals)){assert.equal(archived.archives[0].originals[key],value);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);}
 assert.equal(archived.archives[0].id,migrated._storageArchiveId);assert.equal(archived.fillers,setup.fillerCount);assert(archived.fillerUntouched);
 report.metrics[interrupted?'resumed':'normal']={oldLength:setup.oldLength,storedLength:(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12'))).length};
 // Capture only this synthetic backup through the browser's own Blob API.
 await page.evaluate(()=>{window.qaDownloads=[];const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.qaDownloads.push(blob.text());return create(blob);};});
 await tap('보관 원본 포함 백업');
 await page.waitForFunction(()=>window.qaDownloads.length>0);
 const exported=JSON.parse(await page.evaluate(()=>window.qaDownloads[0]));assert.deepEqual(exported.archives,archived.archives);
 await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(out,'recovered-'+interrupted+'.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await tap('복구된 기록 열기');await page.locator('.version').waitFor({state:'attached'});
 await nav('선수 & 팀');await tap('선수 등록');await page.getByLabel('선수 이름',{exact:true}).fill('별도 보관 복구 QA');await tap('선수 저장');await page.getByRole('dialog').waitFor({state:'hidden'});
 const saved=await data();assert.equal(saved.players.length,baseline.players.length+1);await page.reload({waitUntil:'networkidle'});assert.deepEqual(await data(),saved);
 report.checks.push('Archive contains exact originals; photos/other-app storage untouched; old scores/audit, new save, reload and archive export verified');
 if(!interrupted){
  await nav('규칙 & 설정');await tap('전체 초기화 · 선수/팀/사진 포함');await tap('초기화 준비');
  await page.getByLabel('초기화 백업 암호',{exact:true}).fill('synthetic-only-qa-132');await tap('초기화 전 백업 다운로드');
  await page.getByLabel('백업 파일이 저장된 것을 확인했습니다',{exact:true}).check();await page.getByLabel('확인 문구',{exact:true}).fill('전체 초기화');await tap('전체 초기화 실행');await page.getByRole('dialog').waitFor({state:'hidden'});
  const cleared=await readNative();assert.equal(cleared.archives.length,0);assert.equal(cleared.photos.length,0);assert.equal((await data()).players.length,0);assert.equal((await data())._storageArchiveId,undefined);
  report.checks.push('Explicit full reset removes linked archives/photos after backup; no hidden student copies remain');
 }
 await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);if(page){report.pageText=(await page.locator('body').innerText()).slice(0,3500);await page.screenshot({path:path.join(out,'failure.png')});}}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();console.log(JSON.stringify(report));});
