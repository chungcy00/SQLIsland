import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { formatSqlForDisplay } from '../src/sql-format.js';
const lessons=JSON.parse(fs.readFileSync('dist/content.json')).chapters.flatMap(c=>c.knowledgePoints);
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 for(const lesson of lessons){
  await page.goto('http://127.0.0.1:4173/#/lesson/'+lesson.id);
  await page.locator('#note[data-id="'+lesson.id+'"]').waitFor();
  if (!lesson.presentation) {
   const concept=await page.locator('.lesson-concept').innerText();
   for(const item of lesson.teaching?.mergedConcepts||[])assert.ok(concept.includes(item.explanation),lesson.id+' merged concept preserved');
  }
  const full=page.locator('.lesson-complete-code');
  assert.equal(await full.locator('h3').textContent(),'完整代码');
  assert.equal(await full.locator('pre code').textContent(),formatSqlForDisplay(lesson.mysqlSql));
  const structure=await page.locator('[data-lesson-section=example]').evaluate(n=>{
   const children=[...n.children];return {d:children.findIndex(n=>n.matches('.lesson-demand')),m:children.findIndex(n=>n.matches('.lesson-method')),b:children.findIndex(n=>n.matches('.lesson-breakdown')),c:children.findIndex(n=>n.matches('.lesson-complete-code')),e:children.findIndex(n=>n.matches('.lesson-expected')),x:children.findIndex(n=>n.matches('.lesson-extension'))};
  });
  assert.ok(structure.d<structure.m&&structure.m<structure.b&&structure.b<structure.c&&structure.c<structure.e,lesson.id);
  if(structure.x>=0)assert.ok(structure.e<structure.x,lesson.id);
  assert.equal(await full.locator('pre').evaluate(n=>n.nextElementSibling?.dataset.action),'lessonRun');
  assert.equal(await page.locator('.lesson-extension[open]').count(),0);
  assert.equal(await page.locator('#lesson-result table').count(),0);
  await full.locator('[data-action=lessonRun]').click();
  await page.locator('#lesson-result table').waitFor({timeout:15000});
  const expected=lesson.result.totalRows??lesson.result.rows.length;
  assert.match(await page.locator('#lesson-result small').textContent(),new RegExp(' · '+expected+' 行'),lesson.id);
  const actual=await page.locator('#lesson-result tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
  const rows=lesson.result.rows.slice(0,20).map(row=>row.map(value=>value===null?'NULL':String(value)));
  assert.deepEqual(actual.slice(0,rows.length),rows,lesson.id);
 }
 assert.deepEqual(errors,[]);
 console.log('All 80 lessons have ordered breakdown, explicitly titled complete SQL, adjacent executable button, and matching actual results.');
}finally{await browser.close();}
