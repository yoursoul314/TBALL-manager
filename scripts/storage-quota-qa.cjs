const { chooseAssessor } = require('./qa-assessors.cjs');
// Synthetic, isolated context only. Never use the user's storage/profile.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {decompressFromUTF16}=require('lz-string');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright'),engine=process.argv[2]||'webkit';
const url=process.env.QA_URL||'https://yoursoul314.github.io/TBALL-manager/';
const out=path.resolve(process.env.QA_OUTPUT||'test-results/storage-quota',engine);fs.mkdirSync(out,{recursive:true});
const report={engine,source:process.env.QA_DIST?'local-dist':'deployed',checks:[],metrics:{},errors:[]};
let browser,page;
const tap=name=>page.getByRole('button',{name,exact:true}).click();
async function nav(name){const b=page.locator('.sidebar').getByRole('button',{name,exact:true});if(!await b.isVisible())await tap('메뉴 열기');await b.click();}
const decode=raw=>{const obj=JSON.parse(raw);return obj.format==='tb-manager-compressed-json'?JSON.parse(decompressFromUTF16(obj.payload)):obj;};
const data=async()=>decode(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12')));
(async()=>{
 browser=await pw[engine].launch({headless:true,...(process.env.QA_BROWSER_PATH?{executablePath:process.env.QA_BROWSER_PATH}:{})});
 const ctx=await browser.newContext({...pw.devices['iPad (gen 7) landscape'],viewport:{width:1024,height:768},deviceScaleFactor:1,serviceWorkers:'block'});
 if(process.env.QA_DIST)await ctx.route(url+'**',r=>r.fulfill({path:path.resolve(process.env.QA_DIST,new URL(r.request().url()).pathname.replace('/TBALL-manager/','')||'index.html')}));
 page=await ctx.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});
 assert.equal(await page.locator('.version').textContent(),'BETA 0.14.0');
 await nav('기능평가 & 팀워크');await tap('개인별 이전 기록');
 await page.getByLabel('평가 날짜',{exact:true}).fill('2026-10-26');await page.getByLabel('세션 평가 척도',{exact:true}).selectOption('manual-ten-v1');
 await chooseAssessor(page, '세션 평가자', '가상 QA');await page.getByLabel('평가 목적',{exact:true}).fill('용량 재현');
 await tap('평가 세션 생성');await tap('정상 타격');await tap('평가 8점');await tap('기록 저장 · 다음 회차');
 const baseline=await data();
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
  // Leave 384k characters free: enough for compressed data, insufficient for the old nested write.
  for(let i=Math.max(0,n-6);i<n;i++)localStorage.removeItem('qa-filler-'+i);
  let oldError='';try{localStorage.setItem('tb-manager.workspace.v12',oldWrite);}catch(e){oldError=e.name;}
  return {originals,oldError,oldLength:oldWrite.length,fillerCount:n};
 });
 report.metrics={oldLength:setup.oldLength,fillerCount:setup.fillerCount,sourceLength:setup.originals['tb-manager.workspace.v11'].length};console.log(JSON.stringify(report.metrics));assert.equal(setup.oldError,'QuotaExceededError');
 await page.reload({waitUntil:'networkidle'});await page.locator('.version').waitFor({state:'attached'});
 const migrated=await data();
 assert.deepEqual(migrated.battingAttempts,baseline.battingAttempts);assert.deepEqual(migrated.assessments,baseline.assessments);assert.deepEqual(migrated.events,baseline.events);
 assert.equal(migrated.battingAttempts[0].score,8);assert.deepEqual(migrated.battingAudit,JSON.parse(setup.originals['tb-manager.workspace.v11']).battingAudit);
 const raw=await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12'));
 report.metrics={oldLength:setup.oldLength,storedLength:raw.length,fillerCount:setup.fillerCount};
 assert(raw.length<setup.oldLength/4);
 for(const [key,value]of Object.entries(setup.originals))assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),value);
 report.checks.push('Native browser quota reproduced; compressed migration preserves every old key and legacy evaluation');
 await nav('선수 & 팀');await tap('선수 등록');await page.getByLabel('선수 이름',{exact:true}).fill('용량 복구 QA');await tap('선수 저장');await page.getByRole('dialog').waitFor({state:'hidden'});
 const saved=await data();assert.equal(saved.players.length,baseline.players.length+1);
 await page.reload({waitUntil:'networkidle'});assert.deepEqual(await data(),saved);
 await page.screenshot({path:path.join(out,'restored-1024.png')});
 report.checks.push('Save after recovery and reload retain new and historical records');
 // Even when no write at all is possible, the recovery screen must inspect/export without mutation.
 await page.evaluate(()=>{localStorage.removeItem('tb-manager.workspace.v12');sessionStorage.setItem('qa-force-quota','1');});
 await page.addInitScript(()=>{if(sessionStorage.getItem('qa-force-quota')){const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='tb-manager.workspace.v12')throw new DOMException('The quota has been exceeded.','QuotaExceededError');return set.call(this,k,v);};}});
 await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'브라우저 저장 공간이 부족합니다'}).waitFor();
 await tap('기존 기록 확인');await page.getByRole('button',{name:'검증된 기록 JSON 백업'}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('tb-manager.workspace.v12')),null);
 for(const [key,value]of Object.entries(setup.originals))assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),value);
 await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(out,'recovery-820.png')});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 report.checks.push('Zero-space fallback: explicit quota guidance, read-only verification, backup and updater, no writes');
 assert.deepEqual(report.errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);if(page){report.pageText=(await page.locator('body').innerText()).slice(0,3500);await page.screenshot({path:path.join(out,'failure.png')});}}).finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();console.log(JSON.stringify(report));});
