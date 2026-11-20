// 闪卡点击检查：整张卡点击翻面，但点卡片里的“展开/收起”不能翻面；选中文字后的点击也不翻面。需要预览服务（127.0.0.1:4173）。
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:4173/#/cards'); await page.locator('#card-search').waitFor();
  await page.locator('#card-search').fill('fc2-0077');
  await page.waitForFunction(() => document.querySelectorAll('.fc-mini').length === 1);
  await page.locator('.fc-mini').click();
  await page.locator('.fc-open .fc-tap').waitFor();
  const summaries = page.locator('.fc-open .fc-data-set summary');
  assert.ok((await summaries.count()) >= 2, '这张卡应有至少两组可展开的示例数据');
  const before = await page.locator('.fc-data-set').nth(1).evaluate((n) => n.open);
  await summaries.nth(1).click();
  // 点“展开/收起”：卡片仍停在背面，且该组确实展开了
  assert.equal(await page.locator('.fc-open .fc-tap').count(), 1, '点展开不应翻回正面');
  assert.equal(await page.locator('.fc-data-set').nth(1).evaluate((n) => n.open), !before);
  // 点卡片的普通文字区域仍然翻回正面
  await page.locator('.fc-open .fc-title').click();
  await page.waitForFunction(() => !document.querySelector('.fc-open'));
  // 选中文字再点：不翻面
  await page.locator('#card-search').fill('fc2-0077');
  await page.waitForFunction(() => document.querySelectorAll('.fc-mini').length === 1);
  await page.locator('.fc-mini').click();
  await page.locator('.fc-open .fc-tap').waitFor();
  await page.evaluate(() => { const n = document.querySelector('.fc-open .fc-answer'); const r = document.createRange(); r.selectNodeContents(n); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.locator('.fc-open .fc-answer').click({ position: { x: 5, y: 5 } }).catch(() => {});
  assert.equal(await page.locator('.fc-open .fc-tap').count(), 1, '有选中文字时点击不应翻面');
  assert.deepEqual(errors, []);
  console.log('Flashcard taps: interactive controls and text selection do not flip the card.');
} finally { await browser.close(); }
