import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const content=JSON.parse(fs.readFileSync('dist/content.json'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
async function visit(path,selector){await page.goto('http://127.0.0.1:4173/#'+path);await page.locator(selector).first().waitFor();}
try{
 await visit('/lesson/kp01-01','#note');
 assert.equal(await page.locator('#lesson-result table').count(),0);
 await page.locator('[data-action=lessonRun]').click();
 await page.locator('#lesson-result table').waitFor();
 assert.equal(await page.locator('#lesson-result tbody tr').count(),5);
 const note='手动保存与自动保存回归\n保留换行。';
 await page.locator('#note').fill(note);
 await page.locator('[data-action=saveLessonNote]').click();
 await page.waitForFunction(()=>document.querySelector('#note-status')?.textContent==='已保存');
 await page.reload();await page.locator('#note').waitFor();
 assert.equal(await page.locator('#note').inputValue(),note);
 assert.equal(await page.locator('#lesson-result table').count(),0);
 await visit('/question/q0251','#sql-editor');
 assert.deepEqual(await page.locator('.tabs button').allTextContents(),['题目','数据表']);
 assert.ok(await page.locator('.requirement-sections').count());
 assert.equal(await page.locator('.query-output').count(),0);
 assert.equal(await page.locator('.keyboard-wrap:not(.hidden)').count(),0);
 for(const action of ['hint','showAnswer','runQuestion','submitQuestion']){
  const button=page.locator(`[data-action=${action}]`);
  assert.equal(await button.locator('.material-icon').count(),1);
  assert.equal(await button.evaluate(n=>getComputedStyle(n).borderRadius),'999px');
 }
 assert.equal(await page.locator('.quiz-details > :last-child').getAttribute('class'),'actions sequence-actions');
 await page.locator('.tabs [data-arg=数据表]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.source-table-name').length===3);
 assert.deepEqual(await page.locator('.source-table-name').allTextContents(),content.questions.find(q=>q.id==='q0251').sourceTables);
 assert.equal(await page.locator('[data-action=questionLab]').count(),0);
 assert.ok(await page.locator('.source-table table').count());
 await page.locator('.tabs [data-arg=题目]').click();await page.locator('#sql-editor').waitFor();
 await page.locator('#sql-editor').fill(content.questions.find(q=>q.id==='q0251').referenceSolutions[0].sqliteSql);
 await page.locator('[data-action=runQuestion]').click();
 await page.waitForFunction(()=>document.querySelector('.query-output tbody tr'));
 assert.equal(await page.locator('.query-output tbody tr').count(),12);
 assert.ok(await page.locator('#sql-editor').count());
 assert.ok(await page.locator('.requirement-sections').count());
 const order=await page.locator('.quiz-details').evaluate(n=>({code:n.querySelector('.question-code').offsetTop,actions:n.querySelector('.question-execution').offsetTop,result:n.querySelector('.query-output').offsetTop,footer:n.querySelector('.sequence-actions').offsetTop}));
 assert.ok(order.code<order.actions&&order.actions<order.result&&order.result<order.footer);
 await page.locator('[data-action=submitQuestion]').click();
 await page.waitForFunction(()=>document.querySelector('.judge-feedback')?.textContent.includes('回答正确'));
 for(const width of [320,390,975]){
  await page.setViewportSize({width,height:959});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`.tooling/inline-practice-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);
 console.log('Inline question editor and result, real business table previews, bottom navigation, Material action icons, pill buttons, manual note persistence and click-to-run lesson results passed.');
}finally{await browser.close();}
