import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const content=JSON.parse(fs.readFileSync('dist/content.json'));const ids=['kp01-01','kp01-02','kp01-03','kp02-01','kp02-02','kp05-01','kp05-02'];
try{
 for(const id of ids){
  const k=content.chapters.flatMap(c=>c.knowledgePoints).find(k=>k.id===id);
  for(const width of [320,390,975]){
   await page.setViewportSize({width,height:959});await page.goto('http://127.0.0.1:4173/#/lesson/'+id);await page.reload();await page.locator('#note').waitFor();
   assert.ok(await page.locator('.concept-group h3').count()>=2);
   const actual=await page.locator('.concept-group p,.concept-group li').allTextContents();assert.equal(actual.join(''),k.concept);
   assert.equal(await page.locator('.lesson-scenario').count(),0);
   assert.equal(await page.locator('.syntax-purpose').textContent(),k.presentation.syntax.purpose);
   assert.equal(await page.locator('.code-explanation-part').count(),k.presentation.breakdown.length);
   const normalize=text=>text.replace(/\s+/g,'').replace(/;$/,'').toLowerCase();
   for(const {title,sql:snippet,purpose,reason} of k.presentation.breakdown){
    assert.ok(normalize(k.mysqlSql).includes(normalize(snippet)),id+' fragment '+title);
    assert.ok(purpose&&reason);
   }
   for(const [name,note] of Object.entries(k.presentation.dataDescriptions)){
    const source=page.locator('[data-lesson-section=data] .source-table').filter({has:page.locator('h3',{hasText:name})});
    assert.equal(await source.locator('.source-table-description').textContent(),note);
   }
   assert.notEqual(k.presentation.cautions.reason.map(b=>b.text).join(''),k.comparison);
   assert.equal(await page.locator('.mistake-reason dd').textContent(),k.presentation.cautions.reason.map(b=>b.text).join(''));
   assert.equal(await page.locator('.lesson-concept table:not(.fig-mini):not(.fig-join)').count(),k.presentation.conceptBlocks.some(b=>b.type==='table')?1:0);

   const sections=await page.locator('[data-lesson-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.lessonSection));assert.ok(sections.indexOf('steps')<sections.indexOf('data'));
   assert.equal(await page.locator('.lesson-expected table').count(),0);assert.equal(await page.locator('.lesson-result-explanation').count(),0); // 预期查询结果表已删除；结果解读随实际运行结果一起出现assert.equal(await page.locator('#lesson-result table').count(),0);
   const order=await page.locator('[data-lesson-section=example]').evaluate(n=>({d:n.querySelector('.lesson-demand').offsetTop,c:n.querySelector('.lesson-complete-code').offsetTop,e:n.querySelector('.lesson-breakdown').offsetTop,r:n.querySelector('[data-action=lessonRun]').offsetTop,x:n.querySelector('[data-action=lessonRun]').offsetTop,z:n.querySelector('.lesson-extension')?.offsetTop}));assert.ok(order.d<order.e&&order.e<order.c&&order.c<order.r);if(order.z)assert.ok(order.r<order.z);
   assert.equal(await page.locator('.lesson-extension[open]').count(),0);
   for(const ext of await page.locator('.lesson-extension').all()){await ext.locator('summary').click();assert.equal(await ext.locator('table').count()>=1,true);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   // B4：课文代码默认自动换行，开关切为横向滚动（white-space: pre）
   assert.equal(await page.locator('.lesson-details pre').first().evaluate(n=>getComputedStyle(n).whiteSpace),'pre-wrap');
   await page.locator('[data-action=codeWrap]').first().click();
   assert.equal(await page.locator('.lesson-details pre').first().evaluate(n=>getComputedStyle(n).whiteSpace),'pre');
   await page.locator('[data-action=codeWrap]').first().click();
   if(id==='kp05-01')await page.screenshot({path:`.tooling/teaching-layout-${width}.png`,fullPage:true});
  }
  await page.locator('[data-action=lessonRun]').click();await page.locator('#lesson-result table').waitFor();assert.match(await page.locator('#lesson-result').innerText(),/本次 SQLite 兼容执行结果/);assert.equal(await page.locator('.lesson-expected table').count(),0);assert.equal(await page.locator('#lesson-result table').count(),1);assert.equal(await page.locator('#lesson-result .lesson-result-explanation').count(),1);
 }
 assert.deepEqual(errors,[]);console.log('Seven lessons, three widths, preserved concepts, expected/actual distinction, ordered examples, collapsed extensions and independent horizontal code scrolling passed.');
}finally{await browser.close();}
