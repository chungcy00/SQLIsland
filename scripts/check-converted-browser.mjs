import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {formatSqlForDisplay} from '../src/sql-format.js';
const content=JSON.parse(fs.readFileSync('dist/content.json'));
const converted=content.questions.filter(q=>q.previousExecutionMode==='predict_public_result');
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
try{
 await page.goto('http://127.0.0.1:4173/#/practice');await page.locator('.practice-selectors').waitFor();
 assert.equal(content.questions.length,120);assert.ok(converted.length>0);
 assert.ok(!(await page.locator('[data-filter=type]').innerText()).includes('结果预测'));
 await page.evaluate(()=>new Promise((resolve,reject)=>{const open=indexedDB.open('sql-shouji',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),get=store.get('state');get.onsuccess=()=>{const s=get.result;s.attempts=[{id:'legacy-prediction',questionId:'q0048',contentVersion:'3.0.0',input:'{"columns":["id"],"rows":[[1]]}',time:new Date().toISOString(),pass:true,independent:true}];s.drafts.q0048={prediction:'{"rows":[]}',hints:3,answerShown:true};store.put(s,'state');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);};}));
 await page.reload();await page.locator('.practice-selectors').waitFor();
 assert.match(await page.locator('.route-summary').innerText(),/已独立完成 0 \/ 120/);
 for(const q of converted){
  await page.goto('http://127.0.0.1:4173/#/question/'+q.id);
  await page.waitForFunction(id=>(document.querySelector('.question-meta small')?.textContent||document.querySelector('.iv-meta small')?.textContent||'').startsWith(id.toUpperCase()),q.id);
  assert.equal(await page.locator('#sql-editor').inputValue(),'');
  assert.equal(await page.locator('#prediction').count(),0);
  assert.match(await page.locator('[data-action=hint]').innerText(),/0\/3/);
  await page.locator('#sql-editor').fill(formatSqlForDisplay((q.referenceSolutions[1] || q.referenceSolutions[0]).mysqlSql));
  await page.locator('[data-action=submitQuestion]').click();
  await page.waitForFunction(()=>document.querySelector('.judge-feedback')?.textContent.includes('回答正确'));
 }
 const state=await page.evaluate(()=>new Promise(resolve=>{const o=indexedDB.open('sql-shouji',1);o.onsuccess=()=>{const r=o.result.transaction('records').objectStore('records').get('state');r.onsuccess=()=>resolve(r.result);};}));
 assert.equal(state.attempts.length,converted.length+1);assert.equal(state.attempts[0].id,'legacy-prediction');assert.equal(state.attempts[0].input,'{"columns":["id"],"rows":[[1]]}');
 assert.equal(state.attempts.filter(a=>a.executionMode==='query_result'&&a.pass&&a.independent).length,converted.length);
 console.log('All 15 retained converted questions accept equivalent SQL through the UI; legacy prediction record retained, new progress and drafts isolated.');
}finally{await browser.close();}
