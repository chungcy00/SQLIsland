// B10 未触发项实测（桌面 Chrome，注入历史数据）：①连续学习 7 天鼓励弹窗；②首次答对“困难/挑战”题鼓励弹窗；
// ③资源检查未通过时显示 14 号“熄灭灯塔”。需要先 `npm run preview`（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base = 'http://127.0.0.1:4173/';
const browser = await chromium.launch({channel: 'chrome', headless: true});
const errors = [];
const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function fresh(patch) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.locator('.appbar').waitFor();
  if (patch) {
    await page.evaluate(async patch => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('sql-shouji', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const tx = db.transaction('records', 'readwrite'); const store = tx.objectStore('records');
      const old = await new Promise(resolve => { const g = store.get('state'); g.onsuccess = () => resolve(g.result || {}); });
      store.put({...old, ...patch}, 'state'); await new Promise(resolve => { tx.oncomplete = resolve; });
    }, patch);
    await page.reload(); await page.locator('.appbar').waitFor();
  }
  return {context, page};
}
async function solve(page, difficultyOf) {
  const picked = await page.evaluate(async difficultyOf => {
    const content = await (await fetch('content.json')).json();
    const q = content.questions.find(item => item.type === '独立编写' && difficultyOf.includes(item.difficulty) && item.referenceSolutions?.[0]?.sqliteSql);
    return {id: q.id, sql: q.referenceSolutions[0].sqliteSql};
  }, difficultyOf);
  await page.goto(`${base}#/question/${picked.id}`); await page.locator('#sql-editor').waitFor();
  await page.locator('#sql-editor').fill(picked.sql); await page.waitForTimeout(250);
  await page.getByRole('button', {name: '运行', exact: true}).click(); await page.locator('table').first().waitFor();
  await page.getByRole('button', {name: '提交答案', exact: true}).click();
  await page.getByText('回答正确', {exact: false}).waitFor();
  return picked.id;
}
const dialogTitle = async page => { await page.locator('.dialog').waitFor({timeout: 8000}); return page.locator('.dialog h2, .dialog h3').first().innerText(); };
const out = {};
try {
  // ① 连续学习：前 6 天有学习记录，今天首次答题 → 连续 7 天
  const a = await fresh({studyDays: Object.fromEntries([1, 2, 3, 4, 5, 6].map(n => [day(n), 60])), activity: {}});
  await solve(a.page, ['入门', '简单']); out.streak = await dialogTitle(a.page);
  assert.match(out.streak, /连续学习 7 天/); assert.equal(await a.page.locator('.dialog img[src*="13_encourage"]').count(), 1);
  await a.context.close();
  // ② 首次答对难题（新档案，答一道困难/挑战题）
  const b = await fresh(null);
  const hardId = await solve(b.page, ['困难', '挑战']); out.hard = await dialogTitle(b.page); out.hardId = hardId;
  assert.match(out.hard, /第一次答对难题/); assert.equal(await b.page.locator('.dialog img[src*="13_encourage"]').count(), 1);
  await b.context.close();
  // ③ 资源检查未通过 → 14 熄灭灯塔；通过 → 10 灯塔
  const c = await fresh({resourceCheck: {pass: false, time: Date.now(), checks: []}});
  await c.page.goto(`${base}#/resources`); await c.page.locator('.appbar').waitFor(); await c.page.waitForTimeout(500);
  out.failImg = await c.page.locator('img.summary-illustration').first().getAttribute('src'); assert.match(out.failImg, /14_load_failed/);
  await c.context.close();
  const d = await fresh({resourceCheck: {pass: true, time: Date.now(), checks: []}});
  await d.page.goto(`${base}#/resources`); await d.page.locator('.appbar').waitFor(); await d.page.waitForTimeout(500);
  out.okImg = await d.page.locator('img.summary-illustration').first().getAttribute('src'); assert.match(out.okImg, /10_ready/);
  await d.context.close();
  assert.deepEqual(errors, []); console.log(JSON.stringify(out));
} finally { await browser.close(); }
