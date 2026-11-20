import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const content=JSON.parse(await readFile('dist/content.json'));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const questionIds=['选择','代码填空','独立编写','代码纠错','业务情景'].map(type=>content.questions.find(q=>q.type===type).id);
const routes=['/','/learn','/chapter/ch01','/lesson/kp01-01','/practice','/practice/kp/kp01-01',...questionIds.map(id=>'/question/'+id),'/cards','/card-chapters','/card-edit/new','/my-cards','/projects',...['retail','inventory','ecommerce','finance','hr','procurement'].map(id=>'/projects/'+id),'/lab','/mine','/stats','/wrong','/favorites','/settings','/datasets','/import','/backup','/resources'];
const report=[];
try {
 for(const route of routes){
  await page.goto('http://127.0.0.1:4173/#'+route);await page.locator('.appbar').waitFor();
  const text=await page.locator('body').innerText();
  assert.doesNotMatch(text,/把 SQL|一点点学会|每一点进步|每一步，都算数|在练习中，真正学会|记住，然后用出来|让查询回答业务问题|想一想，再翻开答案/);
  assert.doesNotMatch(text,/暂时无法打开|无法打开本地学习资源/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow '+route);
  const empties=await page.locator('main p, main small').evaluateAll(nodes=>nodes.filter(n=>!n.textContent.trim()&&!n.hasAttribute('role')).length);assert.equal(empties,0,'Empty text element '+route);
  report.push({route,characters:text.replace(/\s/g,'').length});
 }
 for(const width of [320,430]){await page.setViewportSize({width,height:844});for(const route of ['/','/cards','/mine','/backup','/resources']){await page.goto('http://127.0.0.1:4173/#'+route);await page.locator('.appbar').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,route+' '+width);}}
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4173/#/');await page.locator('.continue').waitFor();assert.equal(await page.locator('.hero').count(),0);await page.screenshot({path:'artifacts/preview-home-compact.png'});
 await page.goto('http://127.0.0.1:4173/#/mine');await page.locator('.appbar').waitFor();await page.screenshot({path:'artifacts/preview-mine-compact.png'});
 assert.equal(errors.length,0);await writeFile('artifacts/copy-validation.json',JSON.stringify({pass:true,pages:report,errors},null,2));console.log('Copy and layout checks passed for '+routes.length+' routes');
}finally{await browser.close();}
