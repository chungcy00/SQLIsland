import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:320,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:4173/#/lesson/kp20-01');await page.locator('#note').waitFor();
 assert.equal(await page.locator('.lesson-foundation h2').first().textContent(),'核心概念');assert.equal(await page.locator('[data-action=relatedCards]').count(),0);
 for(const w of [320,390,975]){await page.setViewportSize({width:w,height:844});assert.ok(await page.locator('pre').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));}
 await page.goto('http://127.0.0.1:4173/#/cards');
 await page.locator('[data-action=startCards]').waitFor();
 await page.locator('[data-action=startCards]').click();
 await page.locator('.flashcard').waitFor();
 await page.locator('.flashcard').evaluate(n=>{const pre=document.createElement('pre');pre.textContent='SELECT product_id,100.0*stock_value_cents/NULLIF(□,0) AS inventory_pct FROM share_mini';n.append(pre);});
 await page.setViewportSize({width:320,height:844});
 assert.ok(await page.locator('.flashcard pre').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)));
 await page.goto('http://127.0.0.1:4173/#/question/q0009');await page.locator('#sql-editor').waitFor();
 const sql="SELECT product_id,100.0*stock_value_cents/NULLIF(SUM(stock_value_cents) OVER(),0) AS inventory_pct FROM share_mini;\nSELECT 'this is a very very very long line with spaces and a_string_without_spaces_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz' AS note;\nSELECT 1;";
 await page.locator('#sql-editor').fill(sql);
 for(const w of [320,390,975]){
  await page.setViewportSize({width:w,height:844});await page.waitForTimeout(100);
  const r=await page.locator('.sql-editor').evaluate(n=>{const a=n.querySelector('#sql-editor'),b=n.querySelector('#editor-highlight');return {cw:a.clientWidth,sw:a.scrollWidth,ch:a.clientHeight,sh:a.scrollHeight,highlight:b.getBoundingClientRect().height,gutter:[...n.querySelector('#editor-lines').children].map(x=>x.getBoundingClientRect().height),body:n.querySelector('.editor-body').getBoundingClientRect().height};});
  console.log(w,r);assert.ok(r.sw<=r.cw+1);/* 编辑器现为固定高度、框内上下滑动（作答页分栏布局），不再要求自适应增高；换行与行号对齐仍须成立。 */assert.ok(Math.abs(r.gutter.reduce((a,b)=>a+b,0)+28-r.highlight)<2);
  await page.screenshot({path:`.tooling/wrap-${w}.png`,fullPage:true});
 }
 await page.locator('[data-action=editorFullscreen]').click();await page.waitForTimeout(100);assert.equal(await page.locator('#sql-editor').inputValue(),sql);await page.locator('[data-action=editorFullscreen]').click();
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
